//+------------------------------------------------------------------+
//|                                                  DoubleBB_EA.mq5  |
//|        Double Bollinger Band breakout EA (parameterized)         |
//|                                                                  |
//|  백테스터(LEVERAGE LAB)의 더블비 로직을 그대로 옮긴 MT5 EA.        |
//|  한 EA로 모든 확정 전략을 커버 — 차트별로 입력값+매직넘버만 다르게  |
//|  붙이면 됨. 반드시 헤징(Hedging) 모드 계좌에서 사용.               |
//|                                                                  |
//|  로직 요약                                                        |
//|   · 더블비 상단 = max( BB(시가,4,4σ) 상단, BB(종가,20,2σ) 상단 )   |
//|   · 더블비 하단 = min( BB(시가,4,4σ) 하단, BB(종가,20,2σ) 하단 )   |
//|     (모집단 표준편차 = 합/period, N-1 아님)                        |
//|   · 롱 신호 = 종가가 상단을 처음 상향 돌파. 숏 = 하단 하향 돌파.    |
//|   · 추세필터(MA) = 롱은 돌파봉 종가>MA, 숏은 <MA 일 때만 인정.      |
//|   · 컨펌 = 돌파 후 N봉 내 종가가 돌파봉 종가보다 유리하게 마감해야  |
//|     진입. 체결은 컨펌봉 다음 봉부터.                               |
//|   · 진입 = 등분N(고저 N등분 지정가) 또는 TR분할(고가,고가-TR,…).    |
//|   · 손절 = 최심 주문가 ∓ SL×TR. 익절 = 돌파봉가/평단 ± TP×TR.      |
//|   · 손절·익절 동시 = 손절 우선. 동시 1포지션.                      |
//+------------------------------------------------------------------+
#property copyright "LEVERAGE LAB"
#property version   "1.05"
#property strict

#include <Trade/Trade.mqh>

//--- enums
enum ENUM_DIR     { DIR_LONG=0, DIR_SHORT=1 };
enum ENUM_ENTRY   { ENTRY_EQUALN=0, ENTRY_TRSPLIT=1 };
enum ENUM_TPMODE  { TP_BREAKOUT=0, TP_AVG=1 };

//--- inputs ---------------------------------------------------------
input group "=== 전략 방향 / 진입 ==="
input ENUM_DIR     InpDir         = DIR_LONG;      // 방향
input ENUM_ENTRY   InpEntryMode   = ENTRY_TRSPLIT; // 진입방식 (등분N / TR분할)
input int          InpSplitCount  = 3;             // 분할수 (N 또는 TR차수, 1=단일)
input ENUM_TPMODE  InpTPMode      = TP_BREAKOUT;   // 익절기준 (돌파봉가 / 평단)
input double       InpSL_x        = 1.5;           // 손절폭 ×TR
input double       InpTP_x        = 3.0;           // 익절폭 ×TR

input group "=== 추세필터 / 컨펌 ==="
input int          InpMAPeriod    = 120;           // 추세 SMA period (0=필터 없음)
input bool         InpUseConfirm  = false;         // 컨펌 사용
input int          InpConfirmWin  = 5;             // 컨펌 윈도우(봉)
input int          InpExpiryBars  = 50;            // 미체결 만료(봉) — 체결 전까지만 적용

input group "=== 자금 / 실행 ==="
input double       InpLot1        = 0.01;          // 1차수 랏
input double       InpLot2        = 0.01;          // 2차수 랏
input double       InpLot3        = 0.01;          // 3차수 랏
input double       InpLot4        = 0.01;          // 4차수 랏
input long         InpMagic       = 990001;        // 매직넘버 (전략마다 고유값!)
input int          InpMaxSpreadPts= 0;             // 최대 스프레드(포인트, 0=무시)
input string       InpComment     = "DBB";         // 주문 코멘트
input string       InpExpectedSymbol = "";         // 차트 종목 접두어 가드(예: XAUUSD, US100)
input ENUM_TIMEFRAMES InpExpectedTF = PERIOD_CURRENT; // 차트 타임프레임 가드(PERIOD_CURRENT=끄기)
input bool         InpDebugSignals= false;         // 신호판정 로그 출력

//--- double BB 고정 파라미터
#define BB1_PERIOD 4
#define BB1_MULT   4.0
#define BB2_PERIOD 20
#define BB2_MULT   2.0

//--- 상태기계
enum ENUM_STATE { ST_IDLE=0, ST_WAIT_CONFIRM=1, ST_ENTERING=2, ST_IN_POSITION=3 };
ENUM_STATE  g_state = ST_IDLE;

double   g_brkH=0, g_brkL=0, g_brkTR=0, g_brkClose=0;   // 돌파봉 정보
double   g_orderPrices[];                               // 분할 주문가
double   g_SL=0;                                        // 고정 손절가
int      g_barsSince=0;                                 // 컨펌/만료 카운트용
datetime g_lastBarTime=0;                               // 새 봉 감지
CTrade   g_trade;

//+------------------------------------------------------------------+
int OnInit()
  {
   g_trade.SetExpertMagicNumber(InpMagic);
   g_trade.SetTypeFillingBySymbol(_Symbol);
   g_trade.SetDeviationInPoints(20);
   if(InpSplitCount<1){ Print("InpSplitCount must be >=1"); return(INIT_PARAMETERS_INCORRECT); }
   if(StringLen(InpExpectedSymbol)>0 && StringFind(_Symbol,InpExpectedSymbol)!=0)
     {
      PrintFormat("DoubleBB_EA chart mismatch: expected symbol prefix %s, got %s", InpExpectedSymbol, _Symbol);
      return(INIT_PARAMETERS_INCORRECT);
     }
   if(InpExpectedTF!=PERIOD_CURRENT && _Period!=InpExpectedTF)
     {
      PrintFormat("DoubleBB_EA chart mismatch: expected TF %s, got %s",
                  EnumToString(InpExpectedTF), EnumToString((ENUM_TIMEFRAMES)_Period));
      return(INIT_PARAMETERS_INCORRECT);
     }
   if(!AccountInfoInteger(ACCOUNT_TRADE_ALLOWED))
      Print("경고: 이 계좌에서 자동매매가 허용되지 않음(또는 알고리즘 트레이딩 OFF).");
   if((ENUM_ACCOUNT_MARGIN_MODE)AccountInfoInteger(ACCOUNT_MARGIN_MODE)!=ACCOUNT_MARGIN_MODE_RETAIL_HEDGING)
      Print("경고: 헤징 계좌가 아닙니다. 여러 전략 동시 운용 시 네팅 상계 위험.");
   PrintFormat("DoubleBB_EA 시작 | %s %s | dir=%s entry=%s split=%d MA=%d confirm=%s magic=%d",
               _Symbol, EnumToString((ENUM_TIMEFRAMES)_Period),
               (InpDir==DIR_LONG?"LONG":"SHORT"),
               (InpEntryMode==ENTRY_TRSPLIT?"TR":"N"),
               InpSplitCount, InpMAPeriod, (InpUseConfirm?"Y":"N"), (int)InpMagic);
   return(INIT_SUCCEEDED);
  }

void OnDeinit(const int reason){}

//+------------------------------------------------------------------+
//| 모집단 표준편차 기반 BB 한쪽 값. arr는 as_series=true(0=현재).    |
//|  shift = 윈도우의 가장 최근 봉 인덱스.                            |
//+------------------------------------------------------------------+
double BBval(const double &arr[], int period, double mult, int shift, bool upper)
  {
   double sum=0;
   for(int k=0;k<period;k++) sum+=arr[shift+k];
   double m=sum/period;
   double v=0;
   for(int k=0;k<period;k++){ double d=arr[shift+k]-m; v+=d*d; }
   double sd=MathSqrt(v/period);
   return m + (upper?1.0:-1.0)*mult*sd;
  }
double DoubleUpper(const double &op[], const double &cl[], int shift)
  { return MathMax(BBval(op,BB1_PERIOD,BB1_MULT,shift,true), BBval(cl,BB2_PERIOD,BB2_MULT,shift,true)); }
double DoubleLower(const double &op[], const double &cl[], int shift)
  { return MathMin(BBval(op,BB1_PERIOD,BB1_MULT,shift,false), BBval(cl,BB2_PERIOD,BB2_MULT,shift,false)); }
double SMAval(const double &cl[], int period, int shift)
  { if(period<=0) return 0; double s=0; for(int k=0;k<period;k++) s+=cl[shift+k]; return s/period; }

//+------------------------------------------------------------------+
//| 매직 일치하는 이 심볼의 포지션 정보 집계                          |
//+------------------------------------------------------------------+
int CountMyPositions(double &avgPrice, double &totVol)
  {
   int cnt=0; double sumPV=0; totVol=0;
   for(int i=PositionsTotal()-1;i>=0;i--)
     {
      ulong tk=PositionGetTicket(i);
      if(tk==0) continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol) continue;
      if(PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue;
      double vol=PositionGetDouble(POSITION_VOLUME);
      double pr =PositionGetDouble(POSITION_PRICE_OPEN);
      sumPV+=pr*vol; totVol+=vol; cnt++;
     }
   avgPrice = (totVol>0? sumPV/totVol : 0);
   return cnt;
  }
int CountMyPendings()
  {
   int cnt=0;
   for(int i=OrdersTotal()-1;i>=0;i--)
     {
      ulong tk=OrderGetTicket(i);
      if(tk==0) continue;
      if(OrderGetString(ORDER_SYMBOL)!=_Symbol) continue;
      if(OrderGetInteger(ORDER_MAGIC)!=InpMagic) continue;
      cnt++;
     }
   return cnt;
  }
void DeleteMyPendings()
  {
   for(int i=OrdersTotal()-1;i>=0;i--)
     {
      ulong tk=OrderGetTicket(i);
      if(tk==0) continue;
      if(OrderGetString(ORDER_SYMBOL)!=_Symbol) continue;
      if(OrderGetInteger(ORDER_MAGIC)!=InpMagic) continue;
      g_trade.OrderDelete(tk);
     }
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
void ResetIdle()
  {
   DeleteMyPendings();
   ArrayResize(g_orderPrices,0);
   g_state=ST_IDLE; g_barsSince=0;
   g_brkH=g_brkL=g_brkTR=g_brkClose=g_SL=0;
  }

//+------------------------------------------------------------------+
//| 분할 지정가 주문 배치                                            |
//+------------------------------------------------------------------+
void PlaceEntryOrders()
  {
   // ---- 거래모드 방어: 청산전용·거래중지 심볼은 신규주문 불가 ----
   ENUM_SYMBOL_TRADE_MODE tmode=(ENUM_SYMBOL_TRADE_MODE)SymbolInfoInteger(_Symbol,SYMBOL_TRADE_MODE);
   if(tmode==SYMBOL_TRADE_MODE_DISABLED || tmode==SYMBOL_TRADE_MODE_CLOSEONLY)
     {
      PrintFormat("주문 차단: %s 거래모드=%s → 신규진입 불가. IDLE 유지.",_Symbol,EnumToString(tmode));
      return;
     }
   bool isShort=(InpDir==DIR_SHORT);
   int  N=InpSplitCount;
   ArrayResize(g_orderPrices,0);
   double prices[];
   if(InpEntryMode==ENTRY_TRSPLIT)
     {
      ArrayResize(prices,N);
      for(int k=0;k<N;k++) prices[k]= isShort ? g_brkL + k*g_brkTR : g_brkH - k*g_brkTR;
     }
   else // 등분N
     {
      ArrayResize(prices,N);
      for(int k=0;k<N;k++)
        {
         if(N==1) prices[k]= isShort ? g_brkL : g_brkH;
         else     prices[k]= isShort ? g_brkL + (g_brkH-g_brkL)*k/(N-1)
                                     : g_brkH - (g_brkH-g_brkL)*k/(N-1);
        }
     }
   // 손절 = 최심 주문가 ∓ SL×TR
   double extreme = prices[0];
   for(int k=1;k<N;k++) extreme = isShort ? MathMax(extreme,prices[k]) : MathMin(extreme,prices[k]);
   g_SL = isShort ? extreme + InpSL_x*g_brkTR : extreme - InpSL_x*g_brkTR;

   double lotsArr[4]; lotsArr[0]=InpLot1; lotsArr[1]=InpLot2; lotsArr[2]=InpLot3; lotsArr[3]=InpLot4;
   int    dig = (int)SymbolInfoInteger(_Symbol,SYMBOL_DIGITS);
   double ask = SymbolInfoDouble(_Symbol,SYMBOL_ASK);
   double bid = SymbolInfoDouble(_Symbol,SYMBOL_BID);
   ArrayResize(g_orderPrices,N);
   int okCount=0;
   for(int k=0;k<N;k++)
     {
      double p=NormalizeDouble(prices[k],dig);
      g_orderPrices[k]=p;
      double lot=(k<4)?lotsArr[k]:lotsArr[3];
      bool ok;
      if(isShort)
        {
         // 숏: 현재가보다 위면 SellLimit, 아래면 SellStop
         if(p >= bid) ok=g_trade.SellLimit(lot,p,_Symbol,0,0,ORDER_TIME_GTC,0,InpComment);
         else         ok=g_trade.SellStop (lot,p,_Symbol,0,0,ORDER_TIME_GTC,0,InpComment);
        }
      else
        {
         // 롱: 현재가보다 아래면 BuyLimit, 위면 BuyStop
         if(p <= ask) ok=g_trade.BuyLimit(lot,p,_Symbol,0,0,ORDER_TIME_GTC,0,InpComment);
         else         ok=g_trade.BuyStop (lot,p,_Symbol,0,0,ORDER_TIME_GTC,0,InpComment);
        }
      if(!ok) PrintFormat("주문 실패 차수%d @%.*f (%s)",k,dig,p,g_trade.ResultRetcodeDescription());
      else    okCount++;
     }
   if(okCount>0){ g_state=ST_ENTERING; g_barsSince=0; }
   else         { Print("전체 주문 실패 → IDLE 복귀"); ResetIdle(); }
  }

//+------------------------------------------------------------------+
//| 새 봉마다 호출되는 메인 로직                                      |
//+------------------------------------------------------------------+
void OnNewBar(const double &op[], const double &hi[], const double &lo[], const double &cl[])
  {
   bool isShort=(InpDir==DIR_SHORT);

   // ---- 포지션 존재 여부 동기화 ----
   double avg=0, vol=0;
   int npos=CountMyPositions(avg,vol);
   int npend=CountMyPendings();

   if(g_state==ST_IN_POSITION && npos==0)   // SL/TP로 청산 완료
     { ResetIdle(); }

   // ---- 진입 대기/체결 관리 ----
   if(g_state==ST_ENTERING)
     {
      if(npos>0){ g_state=ST_IN_POSITION; }      // 첫 체결 → 보유상태
      else
        {
         g_barsSince++;
         if(g_barsSince>=InpExpiryBars){ Print("미체결 만료 → 취소"); ResetIdle(); }
        }
     }
   if(g_state==ST_WAIT_CONFIRM)
     {
      // 직전 닫힌 봉(shift1) 종가가 돌파봉 종가보다 유리하면 컨펌
      double c1=cl[1];
      bool confirmed = isShort ? (c1<g_brkClose) : (c1>g_brkClose);
      if(confirmed){ PlaceEntryOrders(); }
      else
        {
         g_barsSince++;
         if(g_barsSince>=InpConfirmWin){ ResetIdle(); }  // 컨펌 실패 폐기
        }
     }

   // ---- IDLE 상태에서만 새 신호 탐색 ----
   if(g_state!=ST_IDLE || npos>0 || npend>0)
     {
      if(InpDebugSignals)
         PrintFormat("DBB DEBUG skip | %s %s state=%d pos=%d pend=%d barsSince=%d",
                     _Symbol, EnumToString((ENUM_TIMEFRAMES)_Period), (int)g_state, npos, npend, g_barsSince);
     }
   if(g_state==ST_IDLE && npos==0 && npend==0)
     {
      // shift1 = 직전 닫힌 봉
      double u1=DoubleUpper(op,cl,1), u2=DoubleUpper(op,cl,2);
      double l1=DoubleLower(op,cl,1), l2=DoubleLower(op,cl,2);
      bool sig = isShort ? (cl[1]<l1 && cl[2]>=l2) : (cl[1]>u1 && cl[2]<=u2);
      bool pass=true;
      double ma=0;
      if(InpMAPeriod>0)
        {
         ma=SMAval(cl,InpMAPeriod,1);
         pass = isShort ? (cl[1]<ma) : (cl[1]>ma);
        }
      double TR=hi[1]-lo[1];
      if(InpDebugSignals)
        {
         if(isShort)
            PrintFormat("DBB DEBUG short | c1=%.5f l1=%.5f c2=%.5f l2=%.5f sig=%s ma%d=%.5f pass=%s TR=%.5f",
                        cl[1],l1,cl[2],l2,(sig?"Y":"N"),InpMAPeriod,ma,(pass?"Y":"N"),TR);
         else
            PrintFormat("DBB DEBUG long | c1=%.5f u1=%.5f c2=%.5f u2=%.5f sig=%s ma%d=%.5f pass=%s TR=%.5f",
                        cl[1],u1,cl[2],u2,(sig?"Y":"N"),InpMAPeriod,ma,(pass?"Y":"N"),TR);
        }
      if(sig)
        {
         // 추세필터
         if(pass && TR>0)
           {
            g_brkH=hi[1]; g_brkL=lo[1]; g_brkTR=TR; g_brkClose=cl[1];
            if(InpDebugSignals)
               PrintFormat("DBB DEBUG signal accepted | H=%.5f L=%.5f C=%.5f TR=%.5f confirm=%s",
                           g_brkH,g_brkL,g_brkClose,g_brkTR,(InpUseConfirm?"Y":"N"));
            if(InpUseConfirm){ g_state=ST_WAIT_CONFIRM; g_barsSince=0; }
            else             { PlaceEntryOrders(); }
           }
         else if(InpDebugSignals)
            PrintFormat("DBB DEBUG signal blocked | pass=%s TR=%.5f", (pass?"Y":"N"), TR);
        }
     }
  }

//+------------------------------------------------------------------+
//| 매 틱: 보유 중이면 SL/TP 감시 (손절 우선)                         |
//+------------------------------------------------------------------+
void ManageExit()
  {
   double avg=0, vol=0;
   int npos=CountMyPositions(avg,vol);
   if(npos==0) return;
   if(g_SL<=0 || g_brkTR<=0) return;   // 상태 유실(EA 재시작) 시: 브로커측 SL/TP가 보호. 가상청산 보류.
   bool isShort=(InpDir==DIR_SHORT);
   double bid=SymbolInfoDouble(_Symbol,SYMBOL_BID);
   double ask=SymbolInfoDouble(_Symbol,SYMBOL_ASK);

   double TP;
   if(InpTPMode==TP_AVG) TP = isShort ? avg - InpTP_x*g_brkTR : avg + InpTP_x*g_brkTR;
   else                  TP = isShort ? g_brkL - InpTP_x*g_brkTR : g_brkH + InpTP_x*g_brkTR;

   // 손절 우선
   if(isShort)
     {
      if(ask>=g_SL){ Print("숏 손절"); CloseMyPositions(); DeleteMyPendings(); return; }
      if(bid<=TP ){ Print("숏 익절"); CloseMyPositions(); DeleteMyPendings(); return; }
     }
   else
     {
      if(bid<=g_SL){ Print("롱 손절"); CloseMyPositions(); DeleteMyPendings(); return; }
      if(ask>=TP ){ Print("롱 익절"); CloseMyPositions(); DeleteMyPendings(); return; }
     }
  }

//+------------------------------------------------------------------+
//| 매 틱: 보유 포지션에 브로커측 SL/TP 부착·갱신                      |
//|  - 손절: 체결 즉시 g_SL 부착(고정)                                |
//|  - 익절: 평단(TP_AVG)이면 체결 추가될 때마다 자동 갱신            |
//|  EA/PC가 꺼져도 브로커가 SL/TP를 잡아줌(가상청산의 백업).         |
//+------------------------------------------------------------------+
void ApplyBrokerStops()
  {
   if(g_SL<=0 || g_brkTR<=0) return;          // 상태 없으면 기존 브로커 SL/TP 유지
   double avg=0, vol=0;
   int npos=CountMyPositions(avg,vol);
   if(npos==0) return;
   bool isShort=(InpDir==DIR_SHORT);
   int    dig  =(int)SymbolInfoInteger(_Symbol,SYMBOL_DIGITS);
   double point=SymbolInfoDouble(_Symbol,SYMBOL_POINT);
   double stops=(double)SymbolInfoInteger(_Symbol,SYMBOL_TRADE_STOPS_LEVEL)*point;
   double bid  =SymbolInfoDouble(_Symbol,SYMBOL_BID);
   double ask  =SymbolInfoDouble(_Symbol,SYMBOL_ASK);

   double tp;
   if(InpTPMode==TP_AVG) tp = isShort ? avg - InpTP_x*g_brkTR : avg + InpTP_x*g_brkTR;
   else                  tp = isShort ? g_brkL - InpTP_x*g_brkTR : g_brkH + InpTP_x*g_brkTR;
   double sl=NormalizeDouble(g_SL,dig);
   tp=NormalizeDouble(tp,dig);

   // 스톱레벨 안쪽이면 이번 틱 보류(주문 거부 방지) — 그동안은 가상청산이 백업
   if(isShort){ if(sl-ask < stops || bid-tp < stops) return; }
   else       { if(bid-sl < stops || tp-ask < stops) return; }

   double tol=point;
   for(int i=PositionsTotal()-1;i>=0;i--)
     {
      ulong tkt=PositionGetTicket(i);
      if(tkt==0) continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol) continue;
      if(PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue;
      double curSL=PositionGetDouble(POSITION_SL);
      double curTP=PositionGetDouble(POSITION_TP);
      if(MathAbs(curSL-sl)>tol || MathAbs(curTP-tp)>tol)
         g_trade.PositionModify(tkt,sl,tp);
     }
  }

//+------------------------------------------------------------------+
void OnTick()
  {
   // 스프레드 필터
   if(InpMaxSpreadPts>0)
     {
      long sp=SymbolInfoInteger(_Symbol,SYMBOL_SPREAD);
      if(sp>InpMaxSpreadPts) { ApplyBrokerStops(); ManageExit(); return; }  // 청산 감시는 유지
     }

   // 새 봉 감지
   datetime t=(datetime)SeriesInfoInteger(_Symbol,_Period,SERIES_LASTBAR_DATE);
   if(t!=g_lastBarTime)
     {
      g_lastBarTime=t;
      int need = MathMax(InpMAPeriod, BB2_PERIOD) + 5;
      double op[],hi[],lo[],cl[];
      ArraySetAsSeries(op,true); ArraySetAsSeries(hi,true);
      ArraySetAsSeries(lo,true); ArraySetAsSeries(cl,true);
      if(CopyOpen(_Symbol,_Period,0,need,op)==need &&
         CopyHigh(_Symbol,_Period,0,need,hi)==need &&
         CopyLow (_Symbol,_Period,0,need,lo)==need &&
         CopyClose(_Symbol,_Period,0,need,cl)==need)
        {
         OnNewBar(op,hi,lo,cl);
        }
     }

   // 매 틱: 브로커측 SL/TP 부착·갱신 + 가상청산 백업
   ApplyBrokerStops();
   ManageExit();
  }
//+------------------------------------------------------------------+
