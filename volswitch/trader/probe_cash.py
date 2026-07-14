#!/usr/bin/env python3
"""현금(예수금/주문가능금액) 조회 endpoint 탐색 도구."""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from toss_client import TossClient  # noqa: E402

client = TossClient()
candidates = [
    "/api/v1/accounts/cash",
    "/api/v1/cash",
    "/api/v1/deposits",
    "/api/v1/accounts/deposit",
    "/api/v1/balance",
    "/api/v1/accounts/balance",
    "/api/v1/orderable-amount",
    "/api/v1/orders/orderable-amount?symbol=TQQQ",
    "/api/v1/buyable-amount?symbol=TQQQ",
]
found = False
for path in candidates:
    try:
        res = client._req("GET", path)
        print(f"✅ {path}:")
        print(json.dumps(res, ensure_ascii=False, indent=2)[:1200])
        print()
        found = True
    except Exception as e:
        print(f"✗ {path}: {str(e)[:110]}")
if not found:
    print("\n전부 실패 — 개발자센터 문서에서 '예수금/주문가능금액' API 경로를 봐주세요.")
