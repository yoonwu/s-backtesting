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
EX_FRAC = float(os.environ.get("EXCEPTION_FRACTION", "1.0"))
EX_STOP = float(os.environ.get("EXCEPTION_STOP", "0.30"))  # 예외 포지션 추가하락 손절 (0=끔)


def parse_price(raw) -> float:
    """시세 응답에서 현재가 추출. 실 응답 스키마 확인 후 필요시 키 추가."""
    if isinstance(raw, (int, float)):
        return float(raw)
    for k in ("price", "last", "close", "tradePrice", "currentPrice", "lastPrice"):
        v = raw.get(k) if isinstance(raw, dict) else None
        if v is not None:
            return float(v)
    raise RuntimeError(f"시세 파싱 실패: {str(raw)[:200]}")


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
    """보유 수량·최근가 추출 (토스 실응답: result.items[].quantity 문자열).

    현금(USD)은 이 엔드포인트에 없음 → 별도 엔드포인트(probe_cash로 확인)에서 조회.
    """
    qty, last = 0.0, None
    res = raw.get("result", raw) or {}
    items = res.get("items") or res.get("holdings") or []
    for it in items:
        sym = it.get("symbol") or it.get("ticker")
        if sym == symbol:
            qty = float(it.get("quantity") or 0)
            lp = it.get("lastPrice")
            last = float(lp) if lp else None
    return qty, last


def main():
    if os.environ.get("TRADER_ENABLED") != "1":
        print("TRADER_ENABLED != 1 → 종료 (킬스위치)")
        return

    st = load_state()
    today = str(date.today())
    if st.get("last_run") == today and not DRY:
        print("오늘 이미 실행됨 → 종료 (중복 주문 방지)")
        return

    client = TossClient()
    raw = client.holdings()
    qty, last_price = parse_holdings(raw, SYMBOL)
    try:
        cash = client.usd_cash()
    except Exception as e:
        cash = None
        print(f"(현금 조회 실패: {str(e)[:150]})")

    # 히스테리시스의 '이전 상태'는 실제 포지션이 진실의 원천
    # (예외매수 latch 보유는 정규 신호상 CASH였으므로 prev_hold=False)
    prev_hold = qty > 0 and not st.get("exception_latch")
    sig = compute_state(prev_hold)
    hold = sig["signal_aggressive"] == "HOLD"
    exception = sig["exception_buy"] and EX_FRAC > 0
    in_market = qty > 0

    # 예외매수 latch 해제: 정규 신호가 켜지면 정상 규칙에 인계 (손절 블록도 해제)
    if hold:
        st["exception_latch"] = False
        st["exception_blocked"] = False

    # latch=True인 보유는 예외매수 포지션 → 정규 재점등 또는 손절까지 유지
    min_topup = float(os.environ.get("MIN_TOPUP_USD", "1000"))
    action = None
    if hold and not in_market:
        action = ("BUY", "정규 진입: 신호 HOLD, 현금 전량 매수(MOC)")
    elif hold and in_market and cash is not None and cash >= min_topup:
        action = ("BUY", f"적립 추가 매수: 신호 HOLD, 입금분 ${cash:,.0f} 매수(MOC)")
    elif not hold and in_market and not st.get("exception_latch"):
        action = ("SELL", "정규 청산: 신호 CASH, 전량 매도(MOC)")
    elif not hold and in_market and st.get("exception_latch") and EX_STOP > 0:
        # 예외 포지션 손절 체크: 매수가 대비 추가 -EX_STOP 이탈 시 청산 + 재발동 금지
        entry = st.get("exception_entry")
        cur = last_price if last_price else parse_price(client.price(SYMBOL))
        if entry and cur < entry * (1 - EX_STOP):
            action = ("EXSTOP", f"예외 포지션 손절: ${cur:,.2f} < 매수가 ${entry:,.2f}×{1-EX_STOP:.2f} — 전량 매도(MOC)")
    elif (not hold and not in_market and exception
          and not st.get("exception_latch") and not st.get("exception_blocked")):
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
            if side in ("SELL", "EXSTOP"):
                res = client.order(SYMBOL, "SELL", order_type="MARKET",
                                   qty=qty, tif="CLS")
                if side == "EXSTOP":
                    st["exception_latch"] = False
                    st["exception_blocked"] = True  # 정규 재점등까지 재발동 금지
            else:
                if cash is None:
                    raise RuntimeError("현금 잔고 파싱 실패 — parse_holdings() 수정 필요")
                amt = cash * (EX_FRAC if side == "EXBUY" else 0.995)
                res = client.order(SYMBOL, "BUY", order_type="MARKET",
                                   amount=amt, tif="CLS")
            if side == "EXBUY":
                st["exception_latch"] = True
                st["exception_entry"] = parse_price(client.price(SYMBOL))
            st["position"] = "CASH" if side in ("SELL", "EXSTOP") else SYMBOL
            notify("✅ " + msg + f"\n주문응답: {json.dumps(res, ensure_ascii=False)[:300]}")
        except Exception as e:
            notify(f"🚨 주문 실패 — 수동 확인 필요!\n{msg}\n오류: {e}")
            raise

    st["last_run"] = today
    save_state(st)


if __name__ == "__main__":
    main()
