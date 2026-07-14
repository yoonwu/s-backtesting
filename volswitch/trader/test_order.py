#!/usr/bin/env python3
"""주문/취소 API 검증 도구 — 체결 불가능한 초저가 지정가 1주 매수 후 즉시 취소.

현재가의 50% 지정가라 절대 체결되지 않으며, 접수 확인 즉시 취소한다.
목적: 실전 전환 전에 주문 생성·취소 엔드포인트와 권한을 1회 검증.
"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from toss_client import TossClient  # noqa: E402

SYMBOL = os.environ.get("SYMBOL", "TQQQ")
client = TossClient()

px_raw = client.price(SYMBOL)
res = px_raw.get("result", px_raw)
if isinstance(res, list):
    res = res[0]
cur = None
for k in ("price", "last", "close", "tradePrice", "currentPrice", "lastPrice"):
    if res.get(k) is not None:
        cur = float(res[k])
        break
if not cur:
    sys.exit(f"현재가 파싱 실패: {str(px_raw)[:300]}")

def place_and_cancel(side: str, limit: float):
    print(f"\n--- {side} 1주 @ ${limit} (체결 불가 가격) ---")
    order = client.order(SYMBOL, side, order_type="LIMIT", qty=1,
                         price=limit, tif="DAY")
    print("✅ 접수:", json.dumps(order, ensure_ascii=False)[:400])
    res_o = order.get("result", order)
    oid = res_o.get("orderId") or res_o.get("id")
    if not oid:
        sys.exit("⚠ orderId를 못 찾음 — 위 응답 공유 + 앱에서 주문 직접 취소!")
    time.sleep(1)
    cancel = client._req("POST", f"/api/v1/orders/{oid}/cancel", json={})
    print("✅ 취소:", json.dumps(cancel, ensure_ascii=False)[:300])


buy_limit = round(cur * 0.5, 2)    # 현재가 절반 매수 → 체결 불가
sell_limit = round(cur * 2.0, 2)   # 현재가 2배 매도 → 체결 불가
print(f"{SYMBOL} 현재가 ${cur}")
print(f"테스트: 매수 1주 @ ${buy_limit} / 매도 1주 @ ${sell_limit} — 둘 다 접수 직후 취소")
if input("진행? (y 입력): ").strip().lower() != "y":
    sys.exit("취소했습니다.")

place_and_cancel("BUY", buy_limit)
place_and_cancel("SELL", sell_limit)
print("\n✅ 매수·매도 주문 + 취소 전부 검증 완료. 앱 주문내역에서 '취소됨' 2건 확인해 보세요.")
