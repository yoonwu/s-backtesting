#!/usr/bin/env python3
"""토스 API 계좌 식별자 조회 도구 (계좌 헤더 없이 토큰만으로 호출)."""
import json
import os
import sys

import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("TOSS_ACCOUNT_SEQ", "-")
from toss_client import TossClient  # noqa: E402

client = TossClient()
token = client._token()
print("토큰 발급 OK\n")

for path in ["/api/v1/accounts", "/api/v1/accounts/list", "/api/v1/account/list"]:
    r = requests.get(client.base + path,
                     headers={"Authorization": f"Bearer {token}"}, timeout=15)
    body = r.text[:2000]
    if r.status_code == 200:
        print(f"✅ {path} 응답:")
        try:
            print(json.dumps(r.json(), ensure_ascii=False, indent=2)[:2000])
        except Exception:
            print(body)
        break
    print(f"✗ {path} → {r.status_code}: {body[:150]}")
else:
    print("\n여전히 실패 — 개발자센터 문서의 '계좌' 섹션에서 정확한 경로를 알려주세요.")
