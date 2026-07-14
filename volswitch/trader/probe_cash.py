#!/usr/bin/env python3
"""orderable-amount endpoint 파라미터 탐색 (에러 전문을 그대로 출력)."""
import json
import os
import sys

import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from toss_client import TossClient  # noqa: E402

client = TossClient()
token = client._token()
H = {"Authorization": f"Bearer {token}",
     "X-Tossinvest-Account": client.account}
BASE = client.base + "/api/v1/orders/orderable-amount"

gets = [
    "?symbol=TQQQ",
    "?symbol=TQQQ&orderType=MARKET",
    "?symbol=TQQQ&side=BUY",
    "?symbol=TQQQ&orderType=LIMIT&price=100",
    "?symbol=TQQQ&price=100",
]
for qs in gets:
    r = requests.get(BASE + qs, headers=H, timeout=15)
    tag = "✅" if r.status_code == 200 else "✗"
    print(f"{tag} GET {qs} → {r.status_code}")
    print("   " + r.text[:500])
    print()
    if r.status_code == 200:
        break
else:
    r = requests.post(BASE, headers=H, json={"symbol": "TQQQ"}, timeout=15)
    print(f"POST body={{symbol}} → {r.status_code}")
    print("   " + r.text[:500])
