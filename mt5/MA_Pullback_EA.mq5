//+------------------------------------------------------------------+
//|                                              MA_Pullback_EA.mq5   |
//|          120/200선 눌림목 EA (MA Pullback, parameterized)         |
//|                                                                  |
//|  웹 백테스터(120선 눌림목 탭)의 로직을 그대로 옮긴 MT5 EA.        |
//|  더블비(DoubleBB_EA)와는 별개 전략군 — 차트별 입력값+매직넘버만  |
//|  다르게 붙여서 여러 셋업을 동시 운용. 반드시 헤징 계좌 사용.       |
//|                                                                  |
//|  로직 요약                                                        |
//|   · 무장: 종가가 이평(MA)보다 이격% 이상 위(롱)/아래(숏)로 벌어짐 |
//|   · 진입: 되돌림으로 이평선 첫 터치(롱=저가≤MA, 숏=고가≥MA)       |
//|   · 분할: 터치가(=MA) 기준 ∓KR, ∓2KR … N차 지정가                |
//|   · KR = 최근 N시간 최대봉(고가−저가). 비농·FOMC급 큰봉(평균봉×   |
//|     배수↑)은 큰봉지속시간(기본24h) 동안 KR로 유지.                |
//|   · 손절 = 최심 매수가 ∓ 손절×KR (가까운 실손절 권장)             |
//|   · 익절 = 평단 ± 익절×KR                                         |
//|   · 손절·익절 동시 = 손절 우선. 동시 1포지션.                      |
//|   · EA/PC 꺼져도 브로커측 SL/TP가 보호(가상청산 백업).            |
//+------------------------------------------------------------------+
#property copyright "LEVERAGE LAB"
#property version   "1.00"
#property strict

#include <Trade/Trade.mqh>

//--- enums
enum ENUM_DIR { DIR_LONG=0, DIR_SHORT=1 };

//--- inputs ---------------------------------------------------------
input group "=== 전략 방향 / 신호 ==="
input ENUM_DIR  InpDir         = DIR_LONG;   // 방향 (롱=눌림매수 / 숏=반등매도)
input int       InpMAPeriod    = 120;        // 이평 기간(봉)
input double    InpGapPct      = 1.0;        // 이격 조건(%) — 이 % 이상 벌어져야 무장
input int       InpSplitCount  = 4;          // 분할 차수 N
input double    InpSL_x        = 1.0;        // 손절폭 ×KR (최심 매수가 아래)
input double    InpTP_x        = 3.0;        // 익절폭 ×KR (평단 기준)

input group "=== TR(KR) 산정 ==="
input int       InpTRHours     = 12;         // TR 윈도우(시간) — 최근 N시간 최대봉
input int       InpNewsHours   = 24;         // 큰봉 지속(시간) — 뉴스봉 KR 유지
input double    InpNewsMult    = 3.0;        // 큰봉 배수(평균봉 대비 이 배수↑ = 뉴스봉)

input group "=== 진입 관리 ==="
input int       InpTouchWaitH  = 168;        // 무장 유효(시간) — 초과 시 해제
input int       InpExpiryBars  = 240;        // 미체결 만료(봉)

input group "=== 자금 / 실행 ==="
input double    InpLot1        = 0.01;       // 1차수 랏
input double    InpLot2        = 0.01;       // 2차수 랏
input double    InpLot3        = 0.01;       // 3차수 랏
input double    InpLot4        = 0.01;       // 4차수 랏
input long      InpMagic       = 880001;     // 매직넘버 (전략마다 고유값!)
input int       InpMaxSpreadPts= 0;          // 최대 스프레드(포인트, 0=무시)
input string    InpComment     = "MAPB";     // 주문 코멘트

//--- 상태기계
enum ENUM_STATE { ST_IDLE=0, ST_ENTERING=1, ST_IN_POSITION=2 };
ENUM_STATE g_state = ST_IDLE;

bool     g_armed=false;        // 이격 무장 상태
datetime g_armT=0;             // 무장 시각(직전 닫힌 봉)
double   g_touchPx=0;          // 터치가(=MA)
double   g_KR=0;               // 분할 간격(KR)
double   g_SL=0;               // 고정 손절가
int      g_barsSince=0;        // 미체결 만료 카운트
datetime g_lastBarTime=0;      // 새 봉 감지
CTrade   g_trade;

//+------------------------------------------------------------------+
int OnInit()
  {
   g_trade.SetExpertMagicNumber(InpMagic);
   g_trade.SetTypeFillingBySymbol(_Symbol);
   g_trade.SetDeviationInPoints(20);
   if(InpSplitCount<1){ Print("InpSplitCount must be >=1"); return(INIT_PARAMETERS_INCORRECT); }
   if(InpMAPeriod<2){ Print("InpMAPeriod must be >=2"); return(INIT_PARAMETERS_INCORRECT); }
   if(!AccountInfoInteger(ACCOUNT_TRADE_ALLOWED))
      Print("경고: 이 계좌/터미널에서 자동매매가 허용되지 않음(알고리즘 트레이딩 OFF?).");
   if((ENUM_ACCOUNT_MARGIN_MODE)AccountInfoInteger(ACCOUNT_MARGIN_MODE)!=ACCOUNT_MARGIN_MODE_RETAIL_HEDGING)
      Print("경고: 헤징 계좌가 아닙니다. 여러 전략 동시 운용 시 네팅 상계 위험.");
   PrintFormat("MA_Pullback_EA 시작 | %s %s | dir=%s MA=%d gap=%.2f%% N=%d SL=%.2f TP=%.2f magic=%d",
               _Symbol, EnumToString((ENUM_TIMEFRAMES)_Period),
               (InpDir==DIR_LONG?"LONG":"SHORT"),
               InpMAPeriod, InpGapPct, InpSplitCount, InpSL_x, InpTP_x, (int)InpMagic);
   return(INIT_SUCCEEDED);
  }

void OnDeinit(const int reason){}

//+------------------------------------------------------------------+
//| 직전 닫힌 봉(shift1) 기준 SMA                                     |
//+------------------------------------------------------------------+
double MAval(int shift)
  {
   double cl[]; ArraySetAsSeries(cl,true);
   int need=InpMAPeriod+shift+2;
   if(CopyClose(_Symbol,_Period,0,need,cl)<need) return 0;
   double s=0; for(int k=0;k<InpMAPeriod;k++) s+=cl[shift+k];
   return s/InpMAPeriod;
  }

//+------------------------------------------------------------------+
//| KR = 최근 N시간 최대봉. 뉴스봉(평균봉×배수↑)은 큰봉지속 동안 유지 |
//|  기준봉 = shift1(터치봉). 그 이전 봉들에서 산정.                  |
//+------------------------------------------------------------------+
double ComputeKR()
  {
   int per=PeriodSeconds(_Period); if(per<=0) per=60;
   int need=(int)((double)InpNewsHours*3600.0/per)+110;
   if(need<120) need=120;
   datetime tm[]; double hi[],lo[];
   ArraySetAsSeries(tm,true); ArraySetAsSeries(hi,true); ArraySetAsSeries(lo,true);
   if(CopyTime(_Symbol,_Period,0,need,tm)<need) return 0;
   if(CopyHigh(_Symbol,_Period,0,need,hi)<need) return 0;
   if(CopyLow (_Symbol,_Period,0,need,lo)<need) return 0;
   // 평균봉(직전 100봉, shift 1..100)
   double sum=0; int cnt=0;
   for(int j=1;j<=100 && j<need;j++){ sum+=(hi[j]-lo[j]); cnt++; }
   double avgRng=(cnt>0? sum/cnt : 0);
   double tref=(double)tm[1];                          // 터치봉 시각
   double normStart=tref-(double)InpTRHours*3600.0;
   double newsStart=tref-(double)InpNewsHours*3600.0;
   double kr=0;
   for(int j=2;j<need;j++)                              // 터치봉 이전 봉들
     {
      if((double)tm[j]<newsStart) break;
      double rng=hi[j]-lo[j];
      bool inNorm=((double)tm[j]>=normStart);
      bool isNews=(avgRng>0 && rng>=InpNewsMult*avgRng);
      if(inNorm||isNews){ if(rng>kr) kr=rng; }
     }
   if(kr<=0){ for(int j=2;j<=4 && j<need;j++){ double r=hi[j]-lo[j]; if(r>kr) kr=r; } } // 고타임프레임 안전장치
   return kr;
  }

//+------------------------------------------------------------------+
//| 매직 일치 이 심볼 포지션 집계                                     |
//+------------------------------------------------------------------+
int CountMyPositions(double &avgPrice, double &totVol)
  {
   int cnt=0; double sumPV=0; totVol=0;
   for(int i=PositionsTotal()-1;i>=0;i--)
     {
      ulong tk=PositionGetTicket(i); if(tk==0) continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol) continue;
      if(PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue;
      double vol=PositionGetDouble(POSITION_VOLUME);
      double pr =PositionGetDouble(POSITION_PRICE_OPEN);
      sumPV+=pr*vol; totVol+=vol; cnt++;
     }
   avgPrice=(totVol>0? sumPV/totVol : 0);
   return cnt;
  }
int CountMyPendings()
  {
   int cnt=0;
   for(int i=OrdersTotal()-1;i>=0;i--)
     {
      ulong tk=OrderGetTicket(i); if(tk==0) continue;
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
      ulong tk=OrderGetTicket(i); if(tk==0) continue;
      if(OrderGetString(ORDER_SYMBOL)!=_Symbol) continue;
      if(OrderGetInteger(ORDER_MAGIC)!=InpMagic) continue;
      g_trade.OrderDelete(tk);
     }
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
void ResetIdle()
  {
   DeleteMyPendings();
   g_state=ST_IDLE; g_barsSince=0;
   g_touchPx=0; g_KR=0; g_SL=0;
   g_armed=false;                  // 재무장하려면 다시 이격% 위로 벌어져야 함
  }

//+------------------------------------------------------------------+
//| 분할 지정가 주문 배치                                            |
//+------------------------------------------------------------------+
void PlaceEntryOrders()
  {
   bool isShort=(InpDir==DIR_SHORT);
   int  N=InpSplitCount;
   double lots[4]; lots[0]=InpLot1; lots[1]=InpLot2; lots[2]=InpLot3; lots[3]=InpLot4;
   int    dig=(int)SymbolInfoInteger(_Symbol,SYMBOL_DIGITS);
   double ask=SymbolInfoDouble(_Symbol,SYMBOL_ASK);
   double bid=SymbolInfoDouble(_Symbol,SYMBOL_BID);
   // 손절 = 최심 매수가 ∓ SL×KR
   double deepest=(isShort? g_touchPx+(N-1)*g_KR : g_touchPx-(N-1)*g_KR);
   g_SL=(isShort? deepest+InpSL_x*g_KR : deepest-InpSL_x*g_KR);
   g_SL=NormalizeDouble(g_SL,dig);
   for(int k=0;k<N;k++)
     {
      double p=(isShort? g_touchPx+k*g_KR : g_touchPx-k*g_KR);
      p=NormalizeDouble(p,dig);
      double lot=(k<4? lots[k] : lots[3]);
      bool ok=false;
      if(isShort)
        {
         if(p>=bid) ok=g_trade.SellLimit(lot,p,_Symbol,0,0,ORDER_TIME_GTC,0,InpComment);
         else       ok=g_trade.SellStop (lot,p,_Symbol,0,0,ORDER_TIME_GTC,0,InpComment);
        }
      else
        {
         if(p<=ask) ok=g_trade.BuyLimit(lot,p,_Symbol,0,0,ORDER_TIME_GTC,0,InpComment);
         else       ok=g_trade.BuyStop (lot,p,_Symbol,0,0,ORDER_TIME_GTC,0,InpComment);
        }
      if(!ok) PrintFormat("주문 실패 차수%d @%.*f (%s)",k,dig,p,g_trade.ResultRetcodeDescription());
     }
   g_state=ST_ENTERING; g_barsSince=0;
  }

//+------------------------------------------------------------------+
//| 새 봉마다: 무장→터치 신호 + 진입/만료 관리                       |
//+------------------------------------------------------------------+
void OnNewBar()
  {
   bool isShort=(InpDir==DIR_SHORT);
   double avg=0,vol=0;
   int npos=CountMyPositions(avg,vol);
   int npend=CountMyPendings();

   if(g_state==ST_IN_POSITION && npos==0) { ResetIdle(); }

   if(g_state==ST_ENTERING)
     {
      if(npos>0){ g_state=ST_IN_POSITION; }
      else
        {
         g_barsSince++;
         if(g_barsSince>=InpExpiryBars){ Print("미체결 만료 → 취소"); ResetIdle(); }
        }
     }

   if(g_state==ST_IDLE && npos==0 && npend==0)
     {
      double m=MAval(1); if(m<=0) return;
      double cl1=iClose(_Symbol,_Period,1);
      double lo1=iLow(_Symbol,_Period,1);
      double hi1=iHigh(_Symbol,_Period,1);
      datetime t1=iTime(_Symbol,_Period,1);
      double gap=InpGapPct/100.0;
      // 무장
      bool armCond=(isShort? (cl1<=m*(1-gap)) : (cl1>=m*(1+gap)));
      if(armCond){ g_armed=true; g_armT=t1; return; }
      if(!g_armed) return;
      // 무장 만료
      if((long)t1-(long)g_armT > (long)InpTouchWaitH*3600){ g_armed=false; return; }
      // 첫 터치
      bool touchCond=(isShort? (hi1>=m) : (lo1<=m));
      if(touchCond)
        {
         double kr=ComputeKR();
         g_armed=false;
         if(kr<=0) return;
         g_touchPx=m; g_KR=kr;
         PlaceEntryOrders();
        }
     }
  }

//+------------------------------------------------------------------+
//| 평단 기준 익절가                                                 |
//+------------------------------------------------------------------+
double TargetTP(double avg)
  {
   bool isShort=(InpDir==DIR_SHORT);
   return (isShort? avg-InpTP_x*g_KR : avg+InpTP_x*g_KR);
  }

//+------------------------------------------------------------------+
//| 매 틱: 가상 청산 감시 (손절 우선)                                |
//+------------------------------------------------------------------+
void ManageExit()
  {
   double avg=0,vol=0;
   int npos=CountMyPositions(avg,vol);
   if(npos==0) return;
   if(g_SL<=0 || g_KR<=0) return;     // 상태 유실(EA 재시작) 시: 브로커측 SL/TP가 보호
   bool isShort=(InpDir==DIR_SHORT);
   double bid=SymbolInfoDouble(_Symbol,SYMBOL_BID);
   double ask=SymbolInfoDouble(_Symbol,SYMBOL_ASK);
   double TP=TargetTP(avg);
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
//| 매 틱: 보유 포지션에 브로커측 SL/TP 부착·갱신                     |
//|  - 손절 g_SL 고정 / 익절은 평단 기준이라 체결 추가될 때마다 갱신  |
//+------------------------------------------------------------------+
void ApplyBrokerStops()
  {
   if(g_SL<=0 || g_KR<=0) return;
   double avg=0,vol=0;
   int npos=CountMyPositions(avg,vol);
   if(npos==0) return;
   bool isShort=(InpDir==DIR_SHORT);
   int    dig  =(int)SymbolInfoInteger(_Symbol,SYMBOL_DIGITS);
   double point=SymbolInfoDouble(_Symbol,SYMBOL_POINT);
   double stops=(double)SymbolInfoInteger(_Symbol,SYMBOL_TRADE_STOPS_LEVEL)*point;
   double bid  =SymbolInfoDouble(_Symbol,SYMBOL_BID);
   double ask  =SymbolInfoDouble(_Symbol,SYMBOL_ASK);
   double sl=NormalizeDouble(g_SL,dig);
   double tp=NormalizeDouble(TargetTP(avg),dig);
   // 스톱레벨 안쪽이면 이번 틱 보류(주문 거부 방지) — 그동안은 가상청산이 백업
   if(isShort){ if(sl-ask < stops || bid-tp < stops) return; }
   else       { if(bid-sl < stops || tp-ask < stops) return; }
   double tol=point;
   for(int i=PositionsTotal()-1;i>=0;i--)
     {
      ulong tkt=PositionGetTicket(i); if(tkt==0) continue;
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
   if(InpMaxSpreadPts>0)
     {
      long sp=SymbolInfoInteger(_Symbol,SYMBOL_SPREAD);
      if(sp>InpMaxSpreadPts){ ApplyBrokerStops(); ManageExit(); return; }
     }

   datetime t=(datetime)SeriesInfoInteger(_Symbol,_Period,SERIES_LASTBAR_DATE);
   if(t!=g_lastBarTime)
     {
      g_lastBarTime=t;
      OnNewBar();
     }

   ApplyBrokerStops();
   ManageExit();
  }
//+------------------------------------------------------------------+
