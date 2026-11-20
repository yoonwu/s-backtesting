#!/usr/bin/env python3
"""수동으로 산 TQQQ를 '예외매수 포지션'으로 봇에 등록 (실행: python mark_exception.py)

정규 신호가 CASH인데 보유가 있으면 봇은 정규 청산(전량 매도)으로 본다.
예외매수 트리거 자리에서 손으로 샀다면 이 스크립트로 latch를 켜야
봇이 그 보유를 지키고(정규 재점등까지 유지) −30% 손절선을 관리한다.
손절 기준가 = 현재 보유 평단가 (TQQQ_ENTRY=가격 으로 직접 지정 가능).
"""
import json
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
from run_trader import (EX_STOP, STATE_FILE, SYMBOL, load_state,  # noqa: E402
                        parse_holdings, save_state)

c = TossClient()
qty, last, avg = parse_holdings(c.holdings(), SYMBOL)
if qty <= 0:
    sys.exit(f"{SYMBOL} 보유가 없습니다 — 등록할 포지션 없음")
entry = float(os.environ.get("TQQQ_ENTRY") or avg or last)

st = load_state()
st.update(exception_latch=True, exception_blocked=False,
          exception_entry=round(entry, 2), position=SYMBOL)
save_state(st)

try:
    usd = c.usd_cash()
except Exception:
    usd = None
print(f"✅ 예외매수 포지션 등록 완료 ({STATE_FILE})")
if EX_STOP <= 0:
    print("⚠ .env의 EXCEPTION_STOP이 0 → 손절 꺼짐! 운영 결정값은 0.30 (README 4절)")
print(f"   보유 {SYMBOL} {qty:g}주 · 손절 기준가 ${entry:,.2f}"
      f" → 손절선 ${entry * (1 - EX_STOP):,.2f} (−{EX_STOP:.0%})")
if usd is not None:
    print(f"   남은 달러 현금 ${usd:,.2f}"
          + (" → 다음 실행에 봇이 잔여분 매수" if usd >= float(os.environ.get("MIN_TOPUP_USD", "1000"))
             else " (적립 최소액 미만 — 대기)"))
print(json.dumps(st, ensure_ascii=False, indent=1))
