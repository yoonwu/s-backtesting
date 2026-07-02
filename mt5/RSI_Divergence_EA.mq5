//+------------------------------------------------------------------+
//|                                            RSI_Divergence_EA.mq5 |
//|        RSI 다이버전스 자리 (변곡 눌림바닥) EA                     |
//|                                                                  |
//|  s-backtesting divergence/gridsearch.py 전략을 그대로 옮긴 EA.    |
//|  확정 조합(XAU H2 롱): SR+BB · 캔들 트리거 · RR2.5 · RSI14 · k3   |
//|  (2년 22거래 · 승률 64% · 평균R +1.23 · PF 4.38 · 능선 8/8 · 무비용)|
//|                                                                  |
//|  로직 요약 (봉 마감 기준, 리페인트 없음)                          |
//|   ① 스윙 피벗저점: 좌우 k봉 최저가. k봉 뒤 확정.                  |
//|   ② 다이버전스: 연속 피벗 p1→p2 가격 저점↓ + RSI 저점↑ (숏 대칭). |
//|      피벗 간격 k+1 ~ maxGap봉.                                    |
//|   ③ 자리(선택 전부 충족):                                         |
//|      S/R  = 과거 피벗(고/저) 레벨 ±오차×ATR14 (p1 이전, 룩백 내)  |
//|      BB   = 볼린저(20,2σ·모집단) 밴드 밖                          |
//|      FIB  = 최근 fibLb봉 레인지 38.2/50/61.8% ±오차×ATR14         |
//|   ④ 트리거: 확정봉부터 trigW봉 내 첫 발생                          |
//|      캔들 = 양봉 & 종가>직전봉 고가 (숏: 음봉 & 종가<직전봉 저가)  |
//|      MACD = 12,26,9 크로스 / 캔들+MACD = 캔들 & MACD 상태          |
//|   ⑤ 트리거봉 마감 직후 시장가 진입(≈다음봉 시가).                  |
//|      SL = 트리거봉 저가(롱)/고가(숏). TP = 체결가 ± RR×리스크.     |
//|      최대보유 maxHold봉 초과 시 종가 청산. 동시 1포지션.           |
//|                                                                  |
//|  주의: 백테스트는 무비용·봉시가 체결 가정. 실거래는 스프레드만큼   |
//|        불리 — 저빈도(연 11회)라 영향 작지만 데모로 먼저 검증할 것. |
//+------------------------------------------------------------------+
#property copyright "LEVERAGE LAB"
#property version   "1.10"
#property strict

#include <Trade/Trade.mqh>

enum ENUM_DIR  { DIR_LONG=0, DIR_SHORT=1 };
enum ENUM_TRIG { TRIG_CANDLE=0, TRIG_MACD=1, TRIG_BOTH=2 };
enum ENUM_DIVT { DIV_REGULAR=0, DIV_HIDDEN=1 };

//--- inputs ---------------------------------------------------------
input group "=== 다이버전스 ==="
input ENUM_DIR  InpDir        = DIR_LONG;   // 방향
input ENUM_DIVT InpDivType    = DIV_REGULAR;// 정다이버 / 히든(추세 눌림)
input int       InpMAPeriod   = 0;          // 추세 MA 게이트 (0=끄기, 히든=200 권장)
input int       InpRsiPeriod  = 14;         // RSI 기간
input int       InpKBars      = 3;          // 스윙 피벗 k봉
input int       InpMaxGap     = 60;         // 피벗 최대 간격(봉)

input group "=== 자리 필터 (선택 전부 충족) ==="
input bool      InpUseSR      = true;       // S/R (과거 피벗 레벨)
input bool      InpUseBB      = true;       // 볼린저(20,2σ) 이탈
input bool      InpUseFIB     = false;      // 피보 되돌림(38.2/50/61.8)
input double    InpTolATR     = 0.5;        // 자리 허용오차 ×ATR14
input int       InpSRLookback = 250;        // S/R 룩백(봉)
input int       InpFibLookback= 120;        // 피보 룩백(봉)

input group "=== 진입 / 청산 ==="
input ENUM_TRIG InpTrigger    = TRIG_CANDLE;// 트리거
input int       InpTrigWindow = 10;         // 트리거 대기(봉)
input double    InpRR         = 2.5;        // 손익비 RR
input int       InpMaxHold    = 300;        // 최대 보유(봉)

input group "=== 자금 / 실행 ==="
input double    InpLot        = 0.01;       // 고정 랏 (리스크%>0이면 무시)
input double    InpRiskPct    = 0.0;        // 리스크 %/트레이드 (0=고정 랏)
input long      InpMagic      = 880101;     // 매직넘버 (전략마다 고유값!)
input int       InpMaxSpreadPts = 0;        // 최대 스프레드(포인트, 0=무시)
input string    InpComment    = "DIV";      // 주문 코멘트
input string    InpExpectedSymbol = "";     // 차트 종목 접두어 가드(예: XAUUSD)
input ENUM_TIMEFRAMES InpExpectedTF = PERIOD_CURRENT; // 차트 TF 가드
input bool      InpDebugSignals = false;    // 신호판정 로그

//--- 고정 파라미터
#define BB_PERIOD  20
#define BB_MULT    2.0
#define ATR_PERIOD 14

//--- 상태
long      g_barCount = 0;                   // 닫힌 봉 일련번호(shift1 기준)
datetime  g_lastBarTime = 0;

long      g_pivBar[];  double g_pivVal[];   // S/R 레벨(피벗 고·저 전부, 시간순)
long      g_p1Bar = -1;                     // 직전 피벗(롱=저점/숏=고점)
double    g_p1Px  = 0, g_p1Rsi = 0;

long      g_trigDeadline = -1;              // 트리거 대기 마감 봉번호
double    g_SL = 0, g_TP = 0;
long      g_entryBar = -1;
bool      g_tpSet = false;

int       hRSI = INVALID_HANDLE, hATR = INVALID_HANDLE, hMACD = INVALID_HANDLE;
CTrade    g_trade;

//+------------------------------------------------------------------+
int OnInit()
  {
   g_trade.SetExpertMagicNumber(InpMagic);
   g_trade.SetTypeFillingBySymbol(_Symbol);
   g_trade.SetDeviationInPoints(20);
   if(InpKBars<1 || InpRsiPeriod<2){ Print("파라미터 오류"); return(INIT_PARAMETERS_INCORRECT); }
   if(StringLen(InpExpectedSymbol)>0 && StringFind(_Symbol,InpExpectedSymbol)!=0)
     {
      PrintFormat("RSI_Divergence_EA chart mismatch: expected symbol prefix %s, got %s", InpExpectedSymbol, _Symbol);
      return(INIT_PARAMETERS_INCORRECT);
     }
   if(InpExpectedTF!=PERIOD_CURRENT && _Period!=InpExpectedTF)
     {
      PrintFormat("RSI_Divergence_EA chart mismatch: expected TF %s, got %s",
                  EnumToString(InpExpectedTF), EnumToString((ENUM_TIMEFRAMES)_Period));
      return(INIT_PARAMETERS_INCORRECT);
     }
   hRSI = iRSI(_Symbol,_Period,InpRsiPeriod,PRICE_CLOSE);
   hATR = iATR(_Symbol,_Period,ATR_PERIOD);
   hMACD= iMACD(_Symbol,_Period,12,26,9,PRICE_CLOSE);
   if(hRSI==INVALID_HANDLE || hATR==INVALID_HANDLE || hMACD==INVALID_HANDLE)
     { Print("지표 핸들 생성 실패"); return(INIT_FAILED); }
   if(!AccountInfoInteger(ACCOUNT_TRADE_ALLOWED))
      Print("경고: 자동매매 미허용 상태.");
   if((ENUM_ACCOUNT_MARGIN_MODE)AccountInfoInteger(ACCOUNT_MARGIN_MODE)!=ACCOUNT_MARGIN_MODE_RETAIL_HEDGING)
      Print("경고: 헤징 계좌가 아닙니다.");
   PrintFormat("RSI_Divergence_EA 시작 | %s %s | dir=%s div=%s MA=%d rsi=%d k=%d SR=%s BB=%s FIB=%s trig=%d RR=%.1f magic=%d",
               _Symbol, EnumToString((ENUM_TIMEFRAMES)_Period),
               (InpDir==DIR_LONG?"LONG":"SHORT"),
               (InpDivType==DIV_HIDDEN?"HIDDEN":"REG"), InpMAPeriod, InpRsiPeriod, InpKBars,
               (InpUseSR?"Y":"N"),(InpUseBB?"Y":"N"),(InpUseFIB?"Y":"N"),
               (int)InpTrigger, InpRR, (int)InpMagic);
   return(INIT_SUCCEEDED);
  }
void OnDeinit(const int reason){}

//+------------------------------------------------------------------+
//| 유틸: 매직 일치 포지션                                            |
//+------------------------------------------------------------------+
int CountMyPositions(double &avgPrice)
  {
   int cnt=0; double sumPV=0, totVol=0;
   for(int i=PositionsTotal()-1;i>=0;i--)
     {
      ulong tk=PositionGetTicket(i);
      if(tk==0) continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol) continue;
      if(PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue;
      double vol=PositionGetDouble(POSITION_VOLUME);
      sumPV+=PositionGetDouble(POSITION_PRICE_OPEN)*vol; totVol+=vol; cnt++;
     }
   avgPrice=(totVol>0? sumPV/totVol : 0);
   return cnt;
  }
void CloseMyPositions()
  {
   for(int i=PositionsTotal()-1;i>=0;i--)
     {
      ulong tk=PositionGetTicket(i);
      if(tk==0) continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol) continue;
      if(PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue;
      g_trade.PositionClose(tk);
     }
  }

//+------------------------------------------------------------------+
//| 모집단 표준편차 BB 한쪽 값 (cl은 as_series, shift=윈도우 최신봉)   |
//+------------------------------------------------------------------+
double BBside(const double &cl[], int shift, bool upper)
  {
   double sum=0;
   for(int k=0;k<BB_PERIOD;k++) sum+=cl[shift+k];
   double m=sum/BB_PERIOD, v=0;
   for(int k=0;k<BB_PERIOD;k++){ double d=cl[shift+k]-m; v+=d*d; }
   return m + (upper?1.0:-1.0)*BB_MULT*MathSqrt(v/BB_PERIOD);
  }

//+------------------------------------------------------------------+
//| 리스크 기반 랏 계산                                               |
//+------------------------------------------------------------------+
double CalcLot(double entryPx, double slPx)
  {
   if(InpRiskPct<=0) return InpLot;
   double dist=MathAbs(entryPx-slPx);
   if(dist<=0) return InpLot;
   double tickVal =SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_VALUE);
   double tickSize=SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_SIZE);
   if(tickVal<=0 || tickSize<=0) return InpLot;
   double valuePerUnit=tickVal/tickSize;                     // 1랏이 가격 1.0 움직일 때 손익
   double riskMoney=AccountInfoDouble(ACCOUNT_BALANCE)*InpRiskPct/100.0;
   double lot=riskMoney/(dist*valuePerUnit);
   double step=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_STEP);
   double vmin=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MIN);
   double vmax=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MAX);
   if(step>0) lot=MathFloor(lot/step)*step;
   return MathMin(MathMax(lot,vmin),vmax);
  }

//+------------------------------------------------------------------+
//| 피벗 레벨 배열 관리                                               |
//+------------------------------------------------------------------+
void PushPivot(long barNum, double val)
  {
   int n=ArraySize(g_pivBar);
   ArrayResize(g_pivBar,n+1); ArrayResize(g_pivVal,n+1);
   g_pivBar[n]=barNum; g_pivVal[n]=val;
   // 오래된 것 제거
   int cut=0;
   while(cut<ArraySize(g_pivBar) && g_pivBar[cut] < g_barCount-InpSRLookback-200) cut++;
   if(cut>0)
     {
      int m=ArraySize(g_pivBar)-cut;
      for(int i=0;i<m;i++){ g_pivBar[i]=g_pivBar[i+cut]; g_pivVal[i]=g_pivVal[i+cut]; }
      ArrayResize(g_pivBar,m); ArrayResize(g_pivVal,m);
     }
  }

//+------------------------------------------------------------------+
//| 새 봉 로직                                                        |
//+------------------------------------------------------------------+
void OnNewBar()
  {
   g_barCount++;
   bool isShort=(InpDir==DIR_SHORT);
   int  k=InpKBars;
   int  need=MathMax(MathMax(BB_PERIOD+k+2, InpFibLookback+k+3), 2*k+3);
   need=MathMax(need, 40);
   if(InpMAPeriod>0) need=MathMax(need, InpMAPeriod+k+3);

   double op[],hi[],lo[],cl[],rsi[],atr[],macdM[],macdS[];
   ArraySetAsSeries(op,true); ArraySetAsSeries(hi,true);
   ArraySetAsSeries(lo,true); ArraySetAsSeries(cl,true);
   ArraySetAsSeries(rsi,true); ArraySetAsSeries(atr,true);
   ArraySetAsSeries(macdM,true); ArraySetAsSeries(macdS,true);
   if(CopyOpen (_Symbol,_Period,0,need,op)!=need) return;
   if(CopyHigh (_Symbol,_Period,0,need,hi)!=need) return;
   if(CopyLow  (_Symbol,_Period,0,need,lo)!=need) return;
   if(CopyClose(_Symbol,_Period,0,need,cl)!=need) return;
   if(CopyBuffer(hRSI ,0,0,need,rsi )!=need) return;
   if(CopyBuffer(hATR ,0,0,need,atr )!=need) return;
   if(CopyBuffer(hMACD,0,0,need,macdM)!=need) return;
   if(CopyBuffer(hMACD,1,0,need,macdS)!=need) return;

   // ---- 포지션 상태 동기화 / TP 부착 / 만료 ----
   double avg=0;
   int npos=CountMyPositions(avg);
   if(npos>0)
     {
      if(!g_tpSet && g_SL>0)
        {
         double risk = isShort ? g_SL-avg : avg-g_SL;
         if(risk>0)
           {
            g_TP = isShort ? avg-InpRR*risk : avg+InpRR*risk;
            int dig=(int)SymbolInfoInteger(_Symbol,SYMBOL_DIGITS);
            for(int i=PositionsTotal()-1;i>=0;i--)
              {
               ulong tk=PositionGetTicket(i);
               if(tk==0) continue;
               if(PositionGetString(POSITION_SYMBOL)!=_Symbol) continue;
               if(PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue;
               g_trade.PositionModify(tk,NormalizeDouble(g_SL,dig),NormalizeDouble(g_TP,dig));
              }
            g_tpSet=true;
            PrintFormat("TP 부착: entry=%.5f SL=%.5f TP=%.5f", avg, g_SL, g_TP);
           }
         else { Print("갭 진입(리스크<=0) → 즉시 정리"); CloseMyPositions(); }
        }
      if(g_entryBar>=0 && g_barCount-g_entryBar>=InpMaxHold)
        { Print("최대보유 만료 청산"); CloseMyPositions(); }
     }
   else if(g_entryBar>=0)   // 청산 완료 → 리셋
     { g_entryBar=-1; g_SL=0; g_TP=0; g_tpSet=false; }

   // ---- 피벗 확정 검사 (피벗봉 = shift k+1, 봉번호 = g_barCount-k) ----
   int ps=k+1;
   bool pivLow=true, pivHigh=true;
   for(int j=1;j<=2*k+1;j++)
     {
      if(j==ps) continue;
      if(lo[j]<=lo[ps]) pivLow=false;
      if(hi[j]>=hi[ps]) pivHigh=false;
     }
   long p2Bar=g_barCount-k;

   // 셋업 피벗(롱=저점, 숏=고점) 확정 시 다이버전스+자리 판정
   bool setupPiv = isShort ? pivHigh : pivLow;
   double p2Px  = isShort ? hi[ps] : lo[ps];
   double p2Rsi = rsi[ps];
   if(setupPiv)
     {
      if(g_p1Bar>=0 && p2Bar-g_p1Bar<=InpMaxGap && p2Bar-g_p1Bar>k)
        {
         bool div;
         if(InpDivType==DIV_HIDDEN)   // 히든: 가격 저점↑ + RSI 저점↓ (추세 지속 눌림)
            div = isShort ? (p2Px<g_p1Px && p2Rsi>g_p1Rsi)
                          : (p2Px>g_p1Px && p2Rsi<g_p1Rsi);
         else                          // 정다이버: 가격 저점↓ + RSI 저점↑
            div = isShort ? (p2Px>g_p1Px && p2Rsi<g_p1Rsi)
                          : (p2Px<g_p1Px && p2Rsi>g_p1Rsi);
         bool maOK=true;
         if(InpMAPeriod>0)
           {
            double s=0; for(int q=0;q<InpMAPeriod;q++) s+=cl[ps+q];
            double ma=s/InpMAPeriod;   // 피벗봉 기준 SMA
            maOK = isShort ? (cl[ps]<ma) : (cl[ps]>ma);
           }
         if(div && maOK)
           {
            double tol=InpTolATR*atr[ps];
            // S/R
            bool srOK=!InpUseSR;
            if(InpUseSR)
              for(int i=0;i<ArraySize(g_pivBar);i++)
                {
                 if(g_pivBar[i]>=g_p1Bar) break;
                 if(g_pivBar[i]<p2Bar-InpSRLookback) continue;
                 if(MathAbs(g_pivVal[i]-p2Px)<=tol){ srOK=true; break; }
                }
            // BB
            bool bbOK=!InpUseBB;
            if(InpUseBB)
              {
               double band=BBside(cl,ps,isShort);
               bbOK = isShort ? (hi[ps]>=band) : (lo[ps]<=band);
              }
            // FIB
            bool fibOK=!InpUseFIB;
            if(InpUseFIB)
              {
               double hh=-DBL_MAX, ll=DBL_MAX;
               for(int j=ps+1;j<=ps+InpFibLookback && j<need;j++)
                 { if(hi[j]>hh)hh=hi[j]; if(lo[j]<ll)ll=lo[j]; }
               double rng=hh-ll;
               if(rng>0)
                 {
                  double r1=0.382,r2=0.5,r3=0.618;
                  double l1=isShort? ll+r1*rng : hh-r1*rng;
                  double l2=isShort? ll+r2*rng : hh-r2*rng;
                  double l3=isShort? ll+r3*rng : hh-r3*rng;
                  fibOK = MathAbs(p2Px-l1)<=tol || MathAbs(p2Px-l2)<=tol || MathAbs(p2Px-l3)<=tol;
                 }
               else fibOK=false;
              }
            if(srOK && bbOK && fibOK)
              {
               g_trigDeadline=g_barCount+InpTrigWindow;
               PrintFormat("셋업: 다이버+자리 | p1=%.5f(%d) p2=%.5f(%d) rsi %.1f→%.1f 대기 %d봉",
                           g_p1Px,(int)g_p1Bar,p2Px,(int)p2Bar,g_p1Rsi,p2Rsi,InpTrigWindow);
              }
            else if(InpDebugSignals)
               PrintFormat("DIV DEBUG 다이버O 자리X | SR=%s BB=%s FIB=%s",(srOK?"Y":"N"),(bbOK?"Y":"N"),(fibOK?"Y":"N"));
           }
        }
      g_p1Bar=p2Bar; g_p1Px=p2Px; g_p1Rsi=p2Rsi;   // p1 갱신
     }
   // S/R 레벨 축적(판정 후) — 저점·고점 피벗 모두
   if(pivLow)  PushPivot(p2Bar, lo[ps]);
   if(pivHigh) PushPivot(p2Bar, hi[ps]);

   // ---- 트리거 (대기 중 & 무포지션) ----
   if(g_trigDeadline>=0 && g_barCount>g_trigDeadline) g_trigDeadline=-1;   // 만료
   if(g_trigDeadline>=0 && npos==0 && g_entryBar<0)
     {
      bool candle = isShort ? (cl[1]<op[1] && cl[1]<lo[2]) : (cl[1]>op[1] && cl[1]>hi[2]);
      bool mx     = isShort ? (macdM[1]<macdS[1] && macdM[2]>=macdS[2])
                            : (macdM[1]>macdS[1] && macdM[2]<=macdS[2]);
      bool mstate = isShort ? (macdM[1]<macdS[1]) : (macdM[1]>macdS[1]);
      bool trig = (InpTrigger==TRIG_CANDLE)? candle : (InpTrigger==TRIG_MACD)? mx : (candle&&mstate);
      if(trig)
        {
         double sl = isShort ? hi[1] : lo[1];
         double px = isShort ? SymbolInfoDouble(_Symbol,SYMBOL_BID) : SymbolInfoDouble(_Symbol,SYMBOL_ASK);
         double risk = isShort ? sl-px : px-sl;
         if(risk>0)
           {
            double lot=CalcLot(px,sl);
            int dig=(int)SymbolInfoInteger(_Symbol,SYMBOL_DIGITS);
            bool ok = isShort
               ? g_trade.Sell(lot,_Symbol,0.0,NormalizeDouble(sl,dig),0.0,InpComment)
               : g_trade.Buy (lot,_Symbol,0.0,NormalizeDouble(sl,dig),0.0,InpComment);
            if(ok)
              {
               g_SL=sl; g_TP=0; g_tpSet=false; g_entryBar=g_barCount; g_trigDeadline=-1;
               PrintFormat("진입: %s lot=%.2f SL=%.5f (TP는 체결가 기준 다음 봉에 부착)",
                           (isShort?"SELL":"BUY"), lot, sl);
              }
            else PrintFormat("주문 실패: %s", g_trade.ResultRetcodeDescription());
           }
         else if(InpDebugSignals) Print("DIV DEBUG 트리거O 리스크<=0 스킵");
        }
     }
  }

//+------------------------------------------------------------------+
void OnTick()
  {
   if(InpMaxSpreadPts>0)
     {
      long sp=SymbolInfoInteger(_Symbol,SYMBOL_SPREAD);
      if(sp>InpMaxSpreadPts) return;
     }
   datetime t=(datetime)SeriesInfoInteger(_Symbol,_Period,SERIES_LASTBAR_DATE);
   if(t!=g_lastBarTime)
     {
      g_lastBarTime=t;
      OnNewBar();
     }
   // 체결 직후 TP 미부착 상태면 틱에서도 시도 (다음 봉까지 안 기다림)
   if(!g_tpSet && g_SL>0)
     {
      double avg=0;
      if(CountMyPositions(avg)>0)
        {
         bool isShort=(InpDir==DIR_SHORT);
         double risk = isShort ? g_SL-avg : avg-g_SL;
         if(risk>0)
           {
            g_TP = isShort ? avg-InpRR*risk : avg+InpRR*risk;
            int dig=(int)SymbolInfoInteger(_Symbol,SYMBOL_DIGITS);
            for(int i=PositionsTotal()-1;i>=0;i--)
              {
               ulong tk=PositionGetTicket(i);
               if(tk==0) continue;
               if(PositionGetString(POSITION_SYMBOL)!=_Symbol) continue;
               if(PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue;
               g_trade.PositionModify(tk,NormalizeDouble(g_SL,dig),NormalizeDouble(g_TP,dig));
              }
            g_tpSet=true;
           }
         else { CloseMyPositions(); }
        }
     }
  }
//+------------------------------------------------------------------+
