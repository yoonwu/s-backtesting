#!/usr/bin/env python3
"""토스 API 계좌 식별자 조회 도구.

계좌 목록 엔드포인트 후보들을 순서대로 호출해서 응답을 출력한다.
출력에서 계좌 식별자(accountSeq/accountId/id 등)를 찾아 .env의
TOSS_ACCOUNT_SEQ에 넣으면 된다.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("TOSS_ACCOUNT_SEQ", "-")  # 계좌 없이도 클라이언트 생성되게
from toss_client import TossClient  # noqa: E402

client = TossClient()
candidates = ["/api/v1/accounts", "/api/v1/account", "/api/v1/accounts/me",
              "/api/v1/users/me/accounts", "/api/v1/me/accounts"]
for path in candidates:
    try:
        res = client._req("GET", path)
        print(f"✅ {path} 응답:")
        print(json.dumps(res, ensure_ascii=False, indent=2)[:2000])
        break
    except Exception as e:
        print(f"✗ {path}: {str(e)[:120]}")
else:
    print("\n전부 실패 — 개발자센터 문서에서 '계좌 목록/조회' API의 경로를 확인해 주세요.")
