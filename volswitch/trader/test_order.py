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

limit = round(cur * 0.5, 2)
print(f"{SYMBOL} 현재가 ${cur} → 테스트 지정가 ${limit} (체결 불가)")
if input("1주 지정가 매수 후 즉시 취소합니다. 진행? (y 입력): ").strip().lower() != "y":
    sys.exit("취소했습니다.")

order = client.order(SYMBOL, "BUY", order_type="LIMIT", qty=1,
                     price=limit, tif="DAY")
print("✅ 주문 접수 응답:")
print(json.dumps(order, ensure_ascii=False, indent=2)[:800])

res_o = order.get("result", order)
oid = res_o.get("orderId") or res_o.get("id")
if not oid:
    sys.exit("⚠ orderId를 응답에서 못 찾음 — 위 응답을 공유해 주세요. (앱에서 주문을 직접 취소하세요!)")

time.sleep(1)
cancel = client._req("POST", f"/api/v1/orders/{oid}/cancel", json={})
print("✅ 취소 응답:")
print(json.dumps(cancel, ensure_ascii=False, indent=2)[:500])
print("\n주문·취소 API 검증 완료. 앱의 주문내역에서 '취소됨' 상태도 확인해 보세요.")
