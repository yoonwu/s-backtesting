#!/usr/bin/env python3
"""볼스위칭 자동매매 (토스증권 Open API).

매 거래일 15:40 ET(장 마감 20분 전)에 cron으로 1회 실행:
  1. QQQ로 신호 계산 (공격형 MA150/vol32 + 예외매수 트리거)
  2. 계좌의 TQQQ 보유량과 비교
  3. 상태가 다르면 MOC(MARKET+CLS) 주문
  4. 행동/오류를 텔레그램으로 보고

전제: 이 계좌는 볼스위칭 슬리브 전용 (다른 종목 섞지 말 것).
안전장치:
  - TRADER_ENABLED=1 이 아니면 아무것도 안 함 (킬스위치)
  - DRY_RUN=1 (기본값)이면 주문 대신 로그만
  - 하루 1회 실행 전제, 같은 날 중복 주문 방지(state 파일)

환경변수:
  TOSS_CLIENT_ID / TOSS_CLIENT_SECRET / TOSS_ACCOUNT_SEQ / [TOSS_API_BASE]
  TRADER_ENABLED=1, DRY_RUN=1|0, SYMBOL=TQQQ
  EXCEPTION_FRACTION=0.5   # 예외매수 시 현금의 투입 비중 (0이면 예외매수 비활성)
  TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID (옵션)
"""
import json
import os
import sys
from datetime import date

import requests

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))  # volswitch/
from daily_signal import compute_state  # noqa: E402
from toss_client import TossClient  # noqa: E402

STATE_FILE = os.path.join(HERE, "trader_state.json")
SYMBOL = os.environ.get("SYMBOL", "TQQQ")
DRY = os.environ.get("DRY_RUN", "1") != "0"
EX_FRAC = float(os.environ.get("EXCEPTION_FRACTION", "0.5"))


def notify(msg: str):
    print(msg)
    tok, chat = os.environ.get("TELEGRAM_BOT_TOKEN"), os.environ.get("TELEGRAM_CHAT_ID")
    if tok and chat:
        try:
            requests.post(f"https://api.telegram.org/bot{tok}/sendMessage",
                          data={"chat_id": chat, "text": msg}, timeout=10)
        except Exception as e:
            print(f"(텔레그램 실패: {e})")


def load_state() -> dict:
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE) as f:
            return json.load(f)
    return {"position": "UNKNOWN", "exception_latch": False, "last_run": ""}


def save_state(st: dict):
    with open(STATE_FILE, "w") as f:
        json.dump(st, f, indent=2, ensure_ascii=False)


def parse_holdings(raw: dict, symbol: str):
    """보유 수량·현금(USD) 추출. 실 응답 스키마 확인 후 필요시 수정.

    dry-run 첫 실행 시 raw를 그대로 출력하므로, 그 출력을 보고
    아래 키 후보가 안 맞으면 고쳐서 쓸 것.
    """
    qty, cash = 0.0, None
    items = raw.get("holdings") or raw.get("items") or raw.get("data") or []
    if isinstance(items, dict):
        items = items.get("items", [])
    for it in items:
        sym = it.get("symbol") or it.get("ticker") or it.get("stockCode")
        if sym == symbol:
            qty = float(it.get("quantity") or it.get("qty")
                        or it.get("holdingQuantity") or 0)
    cash_obj = raw.get("cash") if isinstance(raw.get("cash"), dict) else {}
    for k in ("usdCash", "cashUsd", "availableCashUsd", "orderableAmountUsd",
              "depositUsd", "availableAmount"):
        v = raw.get(k, cash_obj.get(k))
        if v is not None:
            cash = float(v)
            break
    return qty, cash


def main():
    if os.environ.get("TRADER_ENABLED") != "1":
        print("TRADER_ENABLED != 1 → 종료 (킬스위치)")
        return

    st = load_state()
    today = str(date.today())
    if st.get("last_run") == today and not DRY:
        print("오늘 이미 실행됨 → 종료 (중복 주문 방지)")
        return

    sig = compute_state()
    hold = sig["signal_aggressive"] == "HOLD"
    exception = sig["exception_buy"] and EX_FRAC > 0

    client = TossClient()
    raw = client.holdings()
    qty, cash = parse_holdings(raw, SYMBOL)
    if DRY:
        print("--- holdings raw (스키마 확인용) ---")
        print(json.dumps(raw, ensure_ascii=False)[:1500])
    in_market = qty > 0

    # 예외매수 latch 해제: 정규 신호가 켜지면 정상 규칙에 인계
    if hold:
        st["exception_latch"] = False

    # latch=True인 보유는 예외매수 포지션 → 신호가 다시 켜질 때까지 매도하지 않음
    min_topup = float(os.environ.get("MIN_TOPUP_USD", "1000"))
    action = None
    if hold and not in_market:
        action = ("BUY", "정규 진입: 신호 HOLD, 현금 전량 매수(MOC)")
    elif hold and in_market and cash is not None and cash >= min_topup:
        action = ("BUY", f"적립 추가 매수: 신호 HOLD, 입금분 ${cash:,.0f} 매수(MOC)")
    elif not hold and in_market and not st.get("exception_latch"):
        action = ("SELL", "정규 청산: 신호 CASH, 전량 매도(MOC)")
    elif not hold and not in_market and exception and not st.get("exception_latch"):
        action = ("EXBUY", f"예외매수: 트리거 발동, 현금 {EX_FRAC:.0%} 매수(MOC)")

    line = (f"[볼스위칭 트레이더] {sig['asof']} 신호={sig['signal_aggressive']} "
            f"예외={sig['exception_buy']} 보유 {SYMBOL}={qty} 현금USD={cash}")
    if action is None:
        print(line + " → 변경 없음")
        st["last_run"] = today
        save_state(st)
        return

    side, desc = action
    msg = line + f"\n→ {desc}"
    if DRY:
        notify("(DRY-RUN) " + msg)
    else:
        try:
            if side == "SELL":
                res = client.order(SYMBOL, "SELL", order_type="MARKET",
                                   qty=qty, tif="CLS")
            else:
                if cash is None:
                    raise RuntimeError("현금 잔고 파싱 실패 — parse_holdings() 수정 필요")
                amt = cash * (EX_FRAC if side == "EXBUY" else 0.995)
                res = client.order(SYMBOL, "BUY", order_type="MARKET",
                                   amount=amt, tif="CLS")
            if side == "EXBUY":
                st["exception_latch"] = True
            st["position"] = "CASH" if side == "SELL" else SYMBOL
            notify("✅ " + msg + f"\n주문응답: {json.dumps(res, ensure_ascii=False)[:300]}")
        except Exception as e:
            notify(f"🚨 주문 실패 — 수동 확인 필요!\n{msg}\n오류: {e}")
            raise

    st["last_run"] = today
    save_state(st)


if __name__ == "__main__":
    main()
