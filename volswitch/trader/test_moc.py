#!/usr/bin/env python3
"""MOC 리허설 — 봇과 동일한 주문유형(MARKET+CLS)으로 1주 실매수.

⚠ 이것은 진짜 주문이다. 오늘 종가에 1주가 실제로 체결된다.
미국 정규장 중(한국시간 밤 11:30~새벽 5:50)에만 접수 가능.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from toss_client import TossClient  # noqa: E402

SYMBOL = os.environ.get("SYMBOL", "TQQQ")
client = TossClient()

px_raw = client.price(SYMBOL)
res = px_raw.get("result", px_raw)
if isinstance(res, list):
    res = res[0]
cur = next(float(res[k]) for k in
           ("price", "last", "close", "tradePrice", "currentPrice", "lastPrice")
           if res.get(k) is not None)
limit = round(cur * 1.10, 2)

print(f"⚠ {SYMBOL} 1주를 LOC(지정가 ${limit} + 종가체결)로 '실제 매수'합니다.")
print("봇이 실전에서 쓰는 것과 동일한 주문 유형입니다. 오늘 종가에 체결됩니다.")
if input("진행? (yes 전체 입력): ").strip().lower() != "yes":
    sys.exit("취소했습니다.")

order = client.order(SYMBOL, "BUY", order_type="LIMIT", qty=1,
                     price=limit, tif="CLS")
print("✅ 접수 응답:")
print(json.dumps(order, ensure_ascii=False, indent=2)[:800])
print("\n장 마감(한국시간 새벽 5시) 후 앱에서 체결 확인하세요.")
print("체결됐으면 봇의 주문 경로 전체가 검증 완료된 것입니다.")
