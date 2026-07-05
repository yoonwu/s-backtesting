# 대회계좌 MT5 설치 체크리스트

이 문서는 새 계좌에 EA를 처음부터 넣을 때 쓰는 최종 체크리스트입니다.

## 1. GitHub에서 받을 파일

`mt5` 폴더에서 아래 3개 EA를 받습니다.

- `DoubleBB_EA.mq5` — v1.06 이상
- `MA_Pullback_EA.mq5` — v1.02 이상
- `RSI_Divergence_EA.mq5` — v1.10 이상

`mt5/sets` 폴더에서 아래 set만 사용합니다.

- `DBB_US100_M5.set`
- `DBB_US100_H1.set`
- `DBB_XAU_M5_SHORT.set`
- `DBB_XAU_M5_LONG.set`
- `DBB_XAU_H2.set`
- `MAPB_US100_M30.set`
- `MAPB_US100_H4.set`
- `MAPB_XAU_H2.set`
- `MAPB_XAU_M10_SHORT.set`
- `DIV_XAU_H2.set`
- `HID_XAU_M15_SHORT.set`
- `HID_US100_M30_LONG.set`
- `HID_US100_M15_SHORT_RR4.set`

사용 금지:

- `HID_US100_M15_SHORT.set` — 구버전 880103. `HID_US100_M15_SHORT_RR4.set` 880105로 대체됨.

## 2. MT5에 복사

MT5에서 `파일` → `데이터 폴더 열기`.

- `.mq5` 파일 3개: `MQL5/Experts/`에 복사
- `.set` 파일: `MQL5/Presets/`에 복사

MetaEditor에서 EA 3개를 각각 열고 `F7` 컴파일합니다. 컴파일 로그는 반드시 `0 errors`여야 합니다.

## 3. 차트 구성

한 차트에는 EA 하나만 붙입니다. 같은 종목·같은 시간봉이라도 전략이 다르면 차트를 하나 더 열어야 합니다.

| 슬롯 | EA | 차트 | set | 매직 |
|---|---|---|---|---|
| DBB 1 | DoubleBB | US100 M5 | `DBB_US100_M5.set` | 990001 |
| DBB 2 | DoubleBB | US100 H1 | `DBB_US100_H1.set` | 990005 |
| DBB 3 | DoubleBB | XAUUSD M5 | `DBB_XAU_M5_SHORT.set` | 990004 |
| DBB 4 | DoubleBB | XAUUSD M5 | `DBB_XAU_M5_LONG.set` | 990007 |
| DBB 5 | DoubleBB | XAUUSD H2 | `DBB_XAU_H2.set` | 990006 |
| MAPB 1 | MA Pullback | US100 M30 | `MAPB_US100_M30.set` | 880001 |
| MAPB 2 | MA Pullback | US100 H4 | `MAPB_US100_H4.set` | 880004 |
| MAPB 3 | MA Pullback | XAUUSD H2 | `MAPB_XAU_H2.set` | 880003 |
| MAPB 4 | MA Pullback | XAUUSD M10 | `MAPB_XAU_M10_SHORT.set` | 880005 |
| DIV 1 | RSI Divergence | XAUUSD H2 | `DIV_XAU_H2.set` | 880101 |
| DIV 2 | RSI Divergence | XAUUSD M15 | `HID_XAU_M15_SHORT.set` | 880102 |
| DIV 3 | RSI Divergence | US100 M30 | `HID_US100_M30_LONG.set` | 880104 |
| DIV 4 | RSI Divergence | US100 M15 | `HID_US100_M15_SHORT_RR4.set` | 880105 |

브로커 심볼이 `US100.x`, `XAUUSD.b`여도 set의 종목 가드는 `US100`, `XAUUSD` 접두어 기준이라 정상입니다.

## 4. 붙인 뒤 확인

각 EA를 차트에 드래그한 뒤 `입력` 탭에서 해당 set을 `로드`하고 `확인`합니다.

전문가 탭에서 아래를 확인합니다.

- EA 버전: `DoubleBB_EA 1.06`, `MA_Pullback_EA 1.02`, `RSI_Divergence_EA 1.10`
- 매직넘버가 위 표와 일치
- 차트 종목/시간봉 가드 통과
- 자동매매 버튼 ON

## 5. 주문 동작 기준

최신 `DoubleBB_EA v1.06` 기준:

- 돌파 신호 확정 후 1차는 시장가 진입
- 2차 이후 분할은 눌림 리밋만 사용
- 1차 `BuyStop`/`SellStop` 대기 진입은 사용하지 않음
- 이미 생성된 과거 대기주문은 새 코드가 자동 삭제하지 않으므로 직접 확인

최신 `MA_Pullback_EA`와 `RSI_Divergence_EA` 기준:

- 신규 주문 생성 시 가능한 경우 SL/TP를 같이 부착
- 이미 열려 있던 기존 포지션은 새 코드가 SL/TP를 소급 적용하지 않음

## 6. 첫 가동 전

- 기존 수동 주문이나 이전 EA 대기주문이 남아 있으면 먼저 정리
- 같은 매직넘버 중복 사용 금지
- 같은 차트에 EA 2개 붙이기 금지
- 세팅 후 터미널 로그에서 `시작` 로그 13개 확인

