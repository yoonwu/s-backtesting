//+------------------------------------------------------------------+
//| Momentum_Ignition_EA.mq5                                          |
//| 모멘텀 점화: 대양봉(레인지>=x×ATR14) + 종가 상단 마감 + 직전고가   |
//| 돌파 → 다음봉 시가 시장가 진입. SL=신호봉 중간값(브로커).          |
//| 익절 없음 — N봉 경과 시 시간청산. 숏은 대칭. 동시 1포지션.        |
//| 백테스트 근거: divergence/frontier_scan.py E.IGN (XAU H4 롱:      |
//|   60거래 · 0.05%비용 +0.895R · PF2.59 · 전후반+ · 랜덤 24/30)     |
//+------------------------------------------------------------------+
#property copyright "s-backtesting"
#property version   "1.00"
#property strict
#include <Trade/Trade.mqh>

enum ENUM_DIR { DIR_LONG=0, DIR_SHORT=1 };

input group "=== 신호 ==="
input ENUM_DIR  InpDir          = DIR_LONG;   // 방향
input double    InpBigX         = 1.5;        // 점화봉 레인지 최소 ×ATR14
input double    InpClosePos     = 0.8;        // 종가 위치(0~1) — 롱=상단 이 비율 이상
input int       InpHoldBars     = 20;         // 보유 봉수(시간청산)
input int       InpATRPeriod    = 14;         // ATR 기간(Wilder)
input int       InpMAGate       = 0;          // MA 레짐 게이트(0=끄기) — 롱=종가>MA. 골드 50 권장(랜덤 30/30)
input bool      InpGateEMA      = true;       // 게이트 MA 종류: true=EMA(우위) / false=SMA

input group "=== 자금 / 실행 ==="
input double    InpLot          = 0.01;       // 고정 랏 (RiskPct=0일 때)
input double    InpRiskPct      = 0.0;        // 리스크 %(0=고정랏) — SL거리 기준
input long      InpMagic        = 880201;     // 매직넘버
input int       InpMaxSpreadPts = 0;          // 최대 스프레드(포인트, 0=무시)
input string    InpComment      = "IGN";      // 주문 코멘트
input string    InpExpectedSymbol = "";       // 차트 종목 접두어 가드
input ENUM_TIMEFRAMES InpExpectedTF = PERIOD_CURRENT; // 차트 TF 가드

CTrade    g_trade;
datetime  g_lastBarTime=0;
datetime  g_entryBarTime=0;    // 진입한 봉의 오픈 시각

//+------------------------------------------------------------------+
int OnInit()
  {
   g_trade.SetExpertMagicNumber(InpMagic);
   g_trade.SetTypeFillingBySymbol(_Symbol);
   g_trade.SetDeviationInPoints(20);
   if(InpBigX<=0 || InpHoldBars<1 || InpATRPeriod<2)
     { Print("잘못된 파라미터"); return(INIT_PARAMETERS_INCORRECT); }
   if(StringLen(InpExpectedSymbol)>0 && StringFind(_Symbol,InpExpectedSymbol)!=0)
     { PrintFormat("Ignition_EA 차트 불일치: %s 기대, %s", InpExpectedSymbol, _Symbol); return(INIT_PARAMETERS_INCORRECT); }
   if(InpExpectedTF!=PERIOD_CURRENT && _Period!=InpExpectedTF)
     { PrintFormat("Ignition_EA TF 불일치: %s 기대", EnumToString(InpExpectedTF)); return(INIT_PARAMETERS_INCORRECT); }
   if(!AccountInfoInteger(ACCOUNT_TRADE_ALLOWED))
      Print("경고: 자동매매 비허용 상태.");
   if((ENUM_ACCOUNT_MARGIN_MODE)AccountInfoInteger(ACCOUNT_MARGIN_MODE)!=ACCOUNT_MARGIN_MODE_RETAIL_HEDGING)
      Print("경고: 헤징 계좌 아님.");
   PrintFormat("Ignition_EA 시작 | %s %s | dir=%s bigX=%.2f pos=%.2f hold=%d magic=%d",
               _Symbol, EnumToString((ENUM_TIMEFRAMES)_Period),
               (InpDir==DIR_LONG?"LONG":"SHORT"), InpBigX, InpClosePos, InpHoldBars, (int)InpMagic);
   return(INIT_SUCCEEDED);
  }
void OnDeinit(const int reason){}

//+------------------------------------------------------------------+
//| ATR(Wilder) — 백테스트 gridsearch.atr14와 동일: EMA(TR, 2p-1)     |
//| shift 기준 봉까지의 값                                            |
//+------------------------------------------------------------------+
double ATRW(int shift)
  {
   int need=400+shift;
   double hi[],lo[],cl[];
   ArraySetAsSeries(hi,true); ArraySetAsSeries(lo,true); ArraySetAsSeries(cl,true);
   if(CopyHigh(_Symbol,_Period,0,need,hi)<need) return 0;
   if(CopyLow (_Symbol,_Period,0,need,lo)<need) return 0;
   if(CopyClose(_Symbol,_Period,0,need,cl)<need) return 0;
   double a=2.0/(2.0*InpATRPeriod);              // = 1/기간 (Wilder)
   double atr=0; bool init=false;
   for(int j=need-1;j>=shift;j--)
     {
      double pc=(j+1<need? cl[j+1] : cl[j]);
      double tr=MathMax(hi[j]-lo[j], MathMax(MathAbs(hi[j]-pc), MathAbs(lo[j]-pc)));
      if(!init){ atr=tr; init=true; }
      else      atr+=a*(tr-atr);
     }
   return atr;
  }

int CountMyPositions()
  {
   int cnt=0;
   for(int i=PositionsTotal()-1;i>=0;i--)
     {
      ulong tk=PositionGetTicket(i); if(tk==0) continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol) continue;
      if(PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue;
      cnt++;
     }
   return cnt;
  }
void CloseMyPositions()
  {
   for(int i=PositionsTotal()-1;i>=0;i--)
     {
      ulong tk=PositionGetTicket(i); if(tk==0) continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol) continue;
      if(PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue;
      g_trade.PositionClose(tk);
     }
  }
double CalcLot(double slDist)
  {
   if(InpRiskPct<=0 || slDist<=0) return InpLot;
   double tickVal=SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_VALUE);
   double tickSz =SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_SIZE);
   if(tickVal<=0||tickSz<=0) return InpLot;
   double lossPerLot=slDist/tickSz*tickVal;
   double lot=AccountInfoDouble(ACCOUNT_EQUITY)*InpRiskPct/100.0/lossPerLot;
   double step=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_STEP);
   double mn=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MIN);
   double mx=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MAX);
   lot=MathFloor(lot/step)*step;
   return MathMin(mx,MathMax(mn,lot));
  }
bool SpreadOK()
  {
   if(InpMaxSpreadPts<=0) return true;
   return (SymbolInfoInteger(_Symbol,SYMBOL_SPREAD)<=InpMaxSpreadPts);
  }
double GateMA()                                 // 직전 닫힌 봉 기준 SMA/EMA
  {
   int need=(InpGateEMA? InpMAGate*5 : InpMAGate)+3;
   double cl[]; ArraySetAsSeries(cl,true);
   if(CopyClose(_Symbol,_Period,0,need,cl)<need) return 0;
   if(!InpGateEMA)
     {
      double s=0; for(int k=1;k<=InpMAGate;k++) s+=cl[k];
      return s/InpMAGate;
     }
   double a=2.0/(InpMAGate+1), ema=cl[need-1];
   for(int k=need-2;k>=1;k--) ema+=a*(cl[k]-ema);
   return ema;
  }

//+------------------------------------------------------------------+
void OnTick()
  {
   datetime bt=iTime(_Symbol,_Period,0);
   if(bt==g_lastBarTime) return;                // 새 봉에서만
   g_lastBarTime=bt;

   // ── 보유 중: 시간청산 체크 (진입봉 이후 HoldBars봉 마감 시 청산)
   if(CountMyPositions()>0)
     {
      if(g_entryBarTime>0)
        {
         int sh=iBarShift(_Symbol,_Period,g_entryBarTime,false);
         if(sh>=InpHoldBars+1)                  // 진입봉 + 20봉 마감 → 다음봉 오픈 = 지금
           {
            CloseMyPositions();
            g_entryBarTime=0;
            Print("Ignition 시간청산");
           }
        }
      return;
     }
   g_entryBarTime=0;

   // ── 신호: 직전 닫힌 봉(shift1)이 점화봉인가
   double h1=iHigh(_Symbol,_Period,1), l1=iLow(_Symbol,_Period,1);
   double c1=iClose(_Symbol,_Period,1), h2=iHigh(_Symbol,_Period,2), l2=iLow(_Symbol,_Period,2);
   double tr1=h1-l1;
   double atr=ATRW(1);
   if(tr1<=0 || atr<=0 || tr1<InpBigX*atr) return;
   if(InpMAGate>1)                              // MA 레짐 게이트
     {
      double ma=GateMA();
      if(ma<=0) return;
      if(InpDir==DIR_LONG ? c1<=ma : c1>=ma) return;
     }
   bool sig;
   double sl;
   if(InpDir==DIR_LONG)
     {
      sig=((c1-l1)/tr1>=InpClosePos) && (c1>h2);
      sl=(h1+l1)/2.0;
     }
   else
     {
      sig=((h1-c1)/tr1>=InpClosePos) && (c1<l2);
      sl=(h1+l1)/2.0;
     }
   if(!sig || !SpreadOK()) return;

   double px=(InpDir==DIR_LONG? SymbolInfoDouble(_Symbol,SYMBOL_ASK)
                              : SymbolInfoDouble(_Symbol,SYMBOL_BID));
   double slDist=MathAbs(px-sl);
   if(slDist<=0) return;
   double lot=CalcLot(slDist);
   sl=NormalizeDouble(sl,_Digits);
   bool ok=(InpDir==DIR_LONG? g_trade.Buy (lot,_Symbol,0.0,sl,0.0,InpComment)
                            : g_trade.Sell(lot,_Symbol,0.0,sl,0.0,InpComment));
   if(ok)
     {
      g_entryBarTime=bt;
      PrintFormat("Ignition 진입 %s lot=%.2f SL=%.2f (tr=%.2f atr=%.2f)",
                  (InpDir==DIR_LONG?"LONG":"SHORT"), lot, sl, tr1, atr);
     }
  }
//+------------------------------------------------------------------+
