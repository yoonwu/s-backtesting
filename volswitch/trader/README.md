# 볼스위칭 자동매매 — 토스증권 Open API

`run_trader.py`가 매 거래일 장 마감 20분 전(15:40 ET) 신호를 계산하고,
상태가 바뀐 날만 MOC(MARKET + timeInForce=CLS) 주문을 낸다. 사람은 아무것도 안 함.

## 0. 토스 오픈API 승인 받는 법

1. **토스증권 계좌**가 있어야 함 (이미 있으면 통과)
2. **사전 신청**: https://corp.tossinvest.com/ko/open-api 또는 토스증권 앱에서 Open API 사전신청
   (2026-05부터 순차 개방 중 — 신청이 늦을수록 개방도 늦어짐)
3. 오픈 알림이 오면 **PC 웹 개발자센터**(developers.tossinvest.com)에서
   **App Key / App Secret 발급** + 계좌 연결(accountSeq 확인)
4. 발급받은 키로 아래 `.env` 작성

## 1. 서버 준비 (라즈베리파이 or 월 5천원대 VPS)

GitHub Actions는 cron이 수 분~십수 분 지연될 수 있어 장 마감 직전 주문에 부적합.
상시 서버에서 crontab으로 돌린다.

```bash
git clone <이 저장소> && cd s-backtesting/volswitch/trader
pip install requests yfinance pandas numpy
cp .env.example .env   # 키 입력
```

`.env` (또는 crontab 환경변수):
```bash
TOSS_CLIENT_ID=발급받은키
TOSS_CLIENT_SECRET=발급받은시크릿
TOSS_ACCOUNT_SEQ=계좌번호seq
# TOSS_API_BASE=https://api.tossinvest.com   # 개발자센터 문서의 실제 host로 확인!
TRADER_ENABLED=1
DRY_RUN=1                # 검증 끝나기 전까지 절대 0으로 바꾸지 말 것
SYMBOL=TQQQ
EXCEPTION_FRACTION=0.5   # 예외매수 비중 (0 = 비활성)
TELEGRAM_BOT_TOKEN=...   # 옵션
TELEGRAM_CHAT_ID=...
```

crontab (`crontab -e`):
```cron
CRON_TZ=America/New_York
40 15 * * 1-5  cd /home/pi/s-backtesting/volswitch/trader && set -a && . ./.env && set +a && python3 run_trader.py >> trader.log 2>&1
```
15:40 ET인 이유: MOC 주문 접수 마감이 NYSE 15:50 / Nasdaq 15:55 ET.

## 2. 가동 절차 (순서 지킬 것)

1. **DRY_RUN=1로 2주** — 매일 로그로 ① 신호가 signal_state.json과 일치하는지
   ② holdings 응답의 raw JSON에서 수량/현금 키가 `parse_holdings()`와 맞는지 확인.
   안 맞으면 그 함수만 수정.
2. `TOSS_API_BASE` 를 개발자센터 문서의 실제 host로 확정.
3. 소액(1주 수준)으로 DRY_RUN=0 전환, 신호 변경일에 실제 MOC 체결 확인.
4. 전체 슬리브 금액 입금.

## 3. 운영 규칙

- **이 계좌는 볼스위칭 슬리브 전용.** 다른 종목/수동 매매 금지 (전량 매수/매도 로직이라 섞이면 사고남)
- 킬스위치: `TRADER_ENABLED=0` 한 줄이면 정지
- `trader_state.json`이 예외매수 latch를 기억한다 — 서버 옮길 때 같이 옮길 것
- 신호 대시보드: 저장소의 `volswitch/signal_state.json` + daily-signal 워크플로 이슈 알림이
  독립적인 2차 확인 채널 (봇이 죽어도 알림은 옴)

## 4. 전략 파라미터 (run_trader.py 기준)

- 정규: QQQ > MA150 & 20일 변동성 < 32% → TQQQ 100%, 아니면 현금
- 예외매수: 현금 상태에서 (QQQ<400일선 & RSI14<30) 또는 고점대비 −40% → 현금의 50% 매수,
  정규 신호 재점등 시 정상 규칙에 인계 (latch)
- 근거와 검증: `../results.md`, `../README.md`

## 5. 중단 기준 (2026-07 채택 시점에 미리 박아두는 서약)

이 전략을 **그만둘 수 있는 정당한 사유** (구조적 전제의 붕괴):
- TQQQ/QQQ 상장폐지·상품구조 변경, 레버리지 ETF 규제로 매매 불가
- 세제 변경으로 전략의 세후 우위가 산술적으로 소멸
- 신호 데이터/체결 인프라를 복구 불가능하게 상실

**정당하지 않은 사유** (전략의 정상 작동 구간 — 이걸로 끄면 안 됨):
- B&H에 1~3년 연속 뒤처짐 (V자 장에서는 구조적으로 뒤처지도록 설계됨)
- 헛스윙 연속 (연 3~4회 나갔다 들어오는 것 자체가 보험료 납부 방식)
- 슬리브 MDD −50% 도달 (백테스트 범위 내 — 예정된 일)
- "이번엔 다르다"는 느낌

성과를 이유로 규칙을 수정하고 싶다면: 수정안을 이 저장소에서 백테스트해
전 구간 검증을 통과한 뒤에만, 분기 1회 이하로 반영한다. 현장 즉흥 수정 금지.
