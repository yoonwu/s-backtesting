#!/usr/bin/env python3
"""계좌 현금 잔고 즉시 확인 — 원화·달러 (실행: python cash.py)"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
env = os.path.join(HERE, ".env")
if os.path.exists(env):
    for line in open(env, encoding="utf-8"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

from toss_client import TossClient  # noqa: E402

c = TossClient()
krw = usd = None
try:
    krw = c.krw_cash()
except Exception as e:
    print(f"원화 조회 실패: {str(e)[:120]}")
try:
    usd = c.usd_cash()
except Exception as e:
    print(f"달러 조회 실패: {str(e)[:120]}")

if krw is not None:
    print(f"원화 현금 : ₩{krw:,.0f}")
if usd is not None:
    print(f"달러 현금 : ${usd:,.2f}")

try:
    sys.path.insert(0, HERE)
    from panel import usdkrw
    fx, src, at = usdkrw()
except Exception:
    fx = None
if fx and krw is not None and usd is not None:
    print(f"\n환율 ₩{fx:,.2f}/$  [{src} {at}]")
    print(f"합계(달러환산) : ${usd + krw / fx:,.2f}   (₩{round((usd * fx) + krw):,})")

if krw and krw >= 100000:
    print(f"\n※ 원화 ₩{krw:,.0f}는 봇이 매수에 못 씁니다 — 토스 앱에서 달러로 환전하세요.")
elif krw is not None:
    print("\n※ 환전 대기 원화 없음 — 봇이 달러로 정상 운용 중.")
