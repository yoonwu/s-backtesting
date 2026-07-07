//+------------------------------------------------------------------+
//| Volatility_Squeeze_EA.mq5                                         |
//| 변동성 압축 돌파: 인사이드바 + NR(최근 N봉 최소 레인지) 확정 →     |
//| 신호봉 고가에 매수 스탑(롱). SL=신호봉 저가, TP=진입가+R배수.      |
//| 반대편(신호봉 저가) 먼저 터치 시 주문 취소. 미체결 N봉 만료.       |
//| 숏은 대칭. 동시 1주문/1포지션. 최대 보유 봉수 안전청산.            |
//| 백테스트 근거: divergence/frontier_scan.py D.SQZ                  |
//|  (XAU H4 nr5: 86거래 +0.596R 랜덤27/30 / US100 H4 nr7: 62거래     |
//|   +0.419R 랜덤29/30 — 두 종목 전 변형 양수)                       |
//+------------------------------------------------------------------+
#property copyright "s-backtesting"
#property version   "1.00"
#property strict
#include <Trade/Trade.mqh>

enum ENUM_DIR { DIR_LONG=0, DIR_SHORT=1 };

input group "=== 신호 ==="
input ENUM_DIR  InpDir          = DIR_LONG;   // 방향
input int       InpNRPeriod     = 5;          // NR 기간 — 최근 N봉 중 최소 레인지
input int       InpCancelBars   = 10;         // 미체결 만료(봉)
input double    InpTP_R         = 3.5;        // 익절 R배수 (리스크=신호봉 레인지)
input int       InpMaxHoldBars  = 300;        // 최대 보유 봉수(안전청산)
input int       InpMAGate       = 0;          // MA 레짐 게이트(0=끄기) — 롱=종가>SMA (골드 50 권장: +0.60→+0.82R)

input group "=== 자금 / 실행 ==="
input double    InpLot          = 0.01;       // 고정 랏 (RiskPct=0일 때)
input double    InpRiskPct      = 0.0;        // 리스크 %(0=고정랏)
input long      InpMagic        = 880202;     // 매직넘버 (골드=880202 / 나스닥=880203 권장)
input int       InpMaxSpreadPts = 0;          // 최대 스프레드(포인트, 0=무시)
input string    InpComment      = "SQZ";      // 주문 코멘트
input string    InpExpectedSymbol = "";       // 차트 종목 접두어 가드
input ENUM_TIMEFRAMES InpExpectedTF = PERIOD_CURRENT; // 차트 TF 가드

CTrade    g_trade;
datetime  g_lastBarTime=0;
double    g_sigLow=0, g_sigHigh=0;   // 신호봉 고저 (반대편 취소 감시용)
datetime  g_entryBarTime=0;
datetime  g_orderBarTime=0;          // 주문 낸 봉 (수동 만료 백업)

//+------------------------------------------------------------------+
int OnInit()
  {
   g_trade.SetExpertMagicNumber(InpMagic);
   g_trade.SetTypeFillingBySymbol(_Symbol);
   g_trade.SetDeviationInPoints(20);
   if(InpNRPeriod<2 || InpCancelBars<1 || InpTP_R<=0)
     { Print("잘못된 파라미터"); return(INIT_PARAMETERS_INCORRECT); }
   if(StringLen(InpExpectedSymbol)>0 && StringFind(_Symbol,InpExpectedSymbol)!=0)
     { PrintFormat("Squeeze_EA 차트 불일치: %s 기대, %s", InpExpectedSymbol, _Symbol); return(INIT_PARAMETERS_INCORRECT); }
   if(InpExpectedTF!=PERIOD_CURRENT && _Period!=InpExpectedTF)
     { PrintFormat("Squeeze_EA TF 불일치: %s 기대", EnumToString(InpExpectedTF)); return(INIT_PARAMETERS_INCORRECT); }
   if(!AccountInfoInteger(ACCOUNT_TRADE_ALLOWED))
      Print("경고: 자동매매 비허용 상태.");
   if((ENUM_ACCOUNT_MARGIN_MODE)AccountInfoInteger(ACCOUNT_MARGIN_MODE)!=ACCOUNT_MARGIN_MODE_RETAIL_HEDGING)
      Print("경고: 헤징 계좌 아님.");
   PrintFormat("Squeeze_EA 시작 | %s %s | dir=%s NR=%d cancel=%d TP=%.1fR magic=%d",
               _Symbol, EnumToString((ENUM_TIMEFRAMES)_Period),
               (InpDir==DIR_LONG?"LONG":"SHORT"), InpNRPeriod, InpCancelBars, InpTP_R, (int)InpMagic);
   return(INIT_SUCCEEDED);
  }
void OnDeinit(const int reason){}

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
int CountMyPendings(ulong &ticket)
  {
   int cnt=0; ticket=0;
   for(int i=OrdersTotal()-1;i>=0;i--)
     {
      ulong tk=OrderGetTicket(i); if(tk==0) continue;
      if(OrderGetString(ORDER_SYMBOL)!=_Symbol) continue;
      if(OrderGetInteger(ORDER_MAGIC)!=InpMagic) continue;
      cnt++; ticket=tk;
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

//+------------------------------------------------------------------+
void OnTick()
  {
   datetime bt=iTime(_Symbol,_Period,0);
   if(bt==g_lastBarTime) return;                // 새 봉에서만
   g_lastBarTime=bt;

   // ── 보유 중: 최대 보유 안전청산 (SL/TP는 브로커측)
   if(CountMyPositions()>0)
     {
      if(g_entryBarTime==0) g_entryBarTime=bt;   // 체결 후 첫 새봉 = 보유 시작 기준
      int sh=iBarShift(_Symbol,_Period,g_entryBarTime,false);
      if(sh>=InpMaxHoldBars)
        { CloseMyPositions(); g_entryBarTime=0; Print("Squeeze 최대보유 청산"); }
      return;
     }
   g_entryBarTime=0;
   ulong tk;

   // ── 대기주문 감시: 반대편 터치 시 취소 (백테스트 OCO 취소 규칙) + 수동 만료 백업
   if(CountMyPendings(tk)>0)
     {
      double l1=iLow(_Symbol,_Period,1), h1=iHigh(_Symbol,_Period,1);
      bool oppHit=(InpDir==DIR_LONG? (g_sigLow>0 && l1<=g_sigLow)
                                   : (g_sigHigh>0 && h1>=g_sigHigh));
      bool expired=(g_orderBarTime>0 && iBarShift(_Symbol,_Period,g_orderBarTime,false)>=InpCancelBars);
      if(oppHit || expired)
        {
         g_trade.OrderDelete(tk);
         g_sigLow=0; g_sigHigh=0; g_orderBarTime=0;
         Print(oppHit? "Squeeze 반대편 터치 — 주문 취소" : "Squeeze 만료 — 주문 취소");
        }
      return;                                   // 주문 있는 동안 신규 신호 무시
     }

   // ── 신호: 직전 닫힌 봉(shift1) = 인사이드바 + NR
   double h1=iHigh(_Symbol,_Period,1), l1=iLow(_Symbol,_Period,1);
   double h2=iHigh(_Symbol,_Period,2), l2=iLow(_Symbol,_Period,2);
   double tr1=h1-l1;
   if(tr1<=0) return;
   if(!(h1<h2 && l1>l2)) return;                // 인사이드바
   for(int j=2;j<=InpNRPeriod;j++)              // 최근 N봉 중 최소인가
     {
      double trj=iHigh(_Symbol,_Period,j)-iLow(_Symbol,_Period,j);
      if(tr1>trj) return;
     }
   if(InpMAGate>1)                              // MA 레짐 게이트
     {
      double cl[]; ArraySetAsSeries(cl,true);
      int need=InpMAGate+3;
      if(CopyClose(_Symbol,_Period,0,need,cl)<need) return;
      double s=0; for(int k2=1;k2<=InpMAGate;k2++) s+=cl[k2];
      double ma=s/InpMAGate;
      double c1=iClose(_Symbol,_Period,1);
      if(InpDir==DIR_LONG ? c1<=ma : c1>=ma) return;
     }
   if(!SpreadOK()) return;

   double trig, sl, tp, risk=tr1;
   datetime expire=bt+(datetime)(InpCancelBars*PeriodSeconds(_Period));
   double lot=CalcLot(risk);
   if(InpDir==DIR_LONG)
     {
      trig=NormalizeDouble(h1,_Digits); sl=NormalizeDouble(l1,_Digits);
      tp=NormalizeDouble(trig+InpTP_R*risk,_Digits);
      bool ok=g_trade.BuyStop(lot,trig,_Symbol,sl,tp,ORDER_TIME_SPECIFIED,expire,InpComment);
      if(!ok) ok=g_trade.BuyStop(lot,trig,_Symbol,sl,tp,ORDER_TIME_GTC,0,InpComment); // 만료 미지원 브로커 폴백
      if(ok)
        { g_sigLow=l1; g_sigHigh=h1; g_entryBarTime=0; g_orderBarTime=bt;
          PrintFormat("Squeeze BuyStop @%.2f SL=%.2f TP=%.2f lot=%.2f", trig, sl, tp, lot); }
     }
   else
     {
      trig=NormalizeDouble(l1,_Digits); sl=NormalizeDouble(h1,_Digits);
      tp=NormalizeDouble(trig-InpTP_R*risk,_Digits);
      bool ok=g_trade.SellStop(lot,trig,_Symbol,sl,tp,ORDER_TIME_SPECIFIED,expire,InpComment);
      if(!ok) ok=g_trade.SellStop(lot,trig,_Symbol,sl,tp,ORDER_TIME_GTC,0,InpComment); // 만료 미지원 브로커 폴백
      if(ok)
        { g_sigLow=l1; g_sigHigh=h1; g_entryBarTime=0; g_orderBarTime=bt;
          PrintFormat("Squeeze SellStop @%.2f SL=%.2f TP=%.2f lot=%.2f", trig, sl, tp, lot); }
     }
  }
//+------------------------------------------------------------------+
