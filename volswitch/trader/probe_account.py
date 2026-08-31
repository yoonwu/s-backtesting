#!/usr/bin/env python3
"""토스 API 탐색 — 계좌 단위 '실현손익 / 입출금 / 자산요약'을 주는 엔드포인트 찾기.

봇 일지는 설치 시점부터라 그 이전 실현손익을 모른다 → 원금을 정확히 내려면
토스가 계좌 전체 기준으로 주는 값이 필요하다. 이 스크립트는
  (1) holdings 응답 '전문'을 덤프하고 (items 밖에 계좌요약이 있을 수 있음)
  (2) 있을 법한 엔드포인트를 순회하며 200 나오는 것만 골라 보여준다.

실행:  python probe_account.py            (화면 출력)
       python probe_account.py > probe.txt 2>&1   (파일로 저장)
"""
import json
import os
import sys

import requests

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

# .env 로드 (panel/run_trader와 동일 규칙)
env_path = os.path.join(HERE, ".env")
if os.path.exists(env_path):
    for line in open(env_path, encoding="utf-8"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

from toss_client import TossClient  # noqa: E402

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

client = TossClient()
H = {"Authorization": f"Bearer {client._token()}",
     "X-Tossinvest-Account": client.account}
BASE = client.base

print("=" * 70)
print("[1] /api/v1/holdings 전문 — items 밖에 계좌요약(총손익·실현손익)이 있는지 확인")
print("=" * 70)
try:
    raw = client.holdings()
    txt = json.dumps(raw, ensure_ascii=False, indent=1)
    # 종목 배열이 길면 첫 항목만 남기고 축약
    if len(txt) > 4000:
        r = raw.get("result", raw)
        if isinstance(r, dict) and isinstance(r.get("items"), list) and len(r["items"]) > 1:
            r["items"] = r["items"][:1] + [f"...(+{len(r['items'])-1} more)"]
        txt = json.dumps(raw, ensure_ascii=False, indent=1)[:4000]
    print(txt)
except Exception as e:
    print("실패:", e)

CANDIDATES = [
    # 계좌 요약 / 자산
    "/api/v1/accounts", "/api/v1/account", "/api/v1/balance", "/api/v1/balances",
    "/api/v1/assets", "/api/v1/asset", "/api/v1/account-summary", "/api/v1/summary",
    "/api/v1/portfolio", "/api/v1/deposit",
    # 손익
    "/api/v1/profit-loss", "/api/v1/profit-loss/realized", "/api/v1/realized-profit-loss",
    "/api/v1/realized-pnl", "/api/v1/pnl", "/api/v1/returns", "/api/v1/performance",
    # 체결 / 거래내역
    "/api/v1/orders", "/api/v1/order-history", "/api/v1/executions", "/api/v1/fills",
    "/api/v1/trades", "/api/v1/trade-history",
    # 입출금 / 정산
    "/api/v1/transactions", "/api/v1/transaction-history", "/api/v1/cash-transactions",
    "/api/v1/deposits", "/api/v1/deposit-withdrawal", "/api/v1/transfers",
    "/api/v1/settlements", "/api/v1/ledger",
    # v2 스펙 가능성
    "/api/v2/accounts", "/api/v2/holdings", "/api/v2/balance",
]

print()
print("=" * 70)
print("[2] 엔드포인트 순회 — 200 OK 만 내용 표시")
print("=" * 70)
hits = []
for path in CANDIDATES:
    try:
        r = requests.get(BASE + path, headers=H, timeout=12)
    except Exception as e:
        print(f"  ✗ {path:38s} 요청실패 {str(e)[:60]}")
        continue
    if r.status_code == 200:
        hits.append(path)
        print(f"\n  ✅ {path}  →  200")
        print("     " + (r.text[:1200] or "(빈 응답)"))
    else:
        print(f"  ✗ {path:38s} {r.status_code}")

print()
print("=" * 70)
if hits:
    print(f"쓸 수 있는 엔드포인트 {len(hits)}개: {', '.join(hits)}")
    print("→ 이 출력을 그대로 클로드에게 붙여넣으면 원금 계산에 연결해 드립니다.")
else:
    print("계좌요약/실현손익 엔드포인트를 못 찾았습니다.")
    print("→ [1]의 holdings 전문에 총손익 관련 필드가 있는지 확인이 필요합니다.")
    print("→ developers.tossinvest.com 문서의 엔드포인트 목록을 캡처해 주셔도 됩니다.")
print("=" * 70)
