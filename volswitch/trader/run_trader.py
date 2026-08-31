#!/usr/bin/env python3
"""볼스위칭 자동매매 (토스증권 Open API).

매 거래일 15:40 ET(장 마감 20분 전)에 cron으로 1회 실행:
  1. QQQ로 신호 계산 (공격형 MA169/vol32 + 예외매수 트리거)
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
from datetime import date, datetime

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
    """/api/v1/prices 응답에서 현재가 추출."""
    if isinstance(raw, (int, float)):
        return float(raw)
    res = raw.get("result", raw) if isinstance(raw, dict) else raw
    if isinstance(res, list) and res:
        res = res[0]
    if isinstance(res, dict):
        for k in ("price", "last", "close", "tradePrice", "currentPrice", "lastPrice"):
            v = res.get(k)
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


def journal(entry: dict):
    """자체 장부(journal.jsonl): 일일 스냅샷 + 매매 이벤트 영구 기록."""
    entry["ts"] = datetime.now().isoformat(timespec="seconds")
    try:
        with open(os.path.join(HERE, "journal.jsonl"), "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except Exception as e:
        print(f"(장부 기록 실패: {e})")


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
    if not isinstance(res, dict) or ("items" not in res and "holdings" not in res):
        # 응답 형식이 깨졌는데 qty=0으로 진행하면 (1) 보유 중인데 매도 신호를 놓치고
        # (2) 장부에 '전량 청산'처럼 기록돼 원금 계산이 망가진다 → 즉시 중단.
        raise RuntimeError(f"보유 조회 응답 형식 이상 — 매매·기록 중단: {str(raw)[:200]}")
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
    krw = None
    try:
        krw = client.krw_cash()
        if krw >= 500000:  # 환전 안 된 원화 발견 → 알림 (API에 환전 기능 없음)
            notify(f"⚠ 토스 계좌에 원화 ₩{krw:,.0f}가 환전 대기 중 — 앱에서 달러로 환전해야 봇이 매수에 사용합니다")
    except Exception:
        pass

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
    snap = dict(type="snapshot", asof=sig["asof"], signal=sig["signal_aggressive"],
                qty=qty, cash=cash, krw=krw, price=last_price,
                holdings_ok=True,          # 조회 성공분만 원금 재구성에 사용
                mode="dry" if DRY else "live",
                action=(action[0] if action else None))
    if action is None:
        print(line + " → 변경 없음")
        journal(snap)
        st["last_run"] = today
        save_state(st)
        return

    side, desc = action
    msg = line + f"\n→ {desc}"
    if DRY:
        notify("(DRY-RUN) " + msg)
    else:
        try:
            # 토스 API는 MOC 미지원 → LOC(지정가+CLS)로 종가 체결.
            # 공격적 지정가(매도 -10%/매수 +10%)라 사실상 항상 종가에 체결되며,
            # 종가가 지정가보다 불리하게 폭주한 날만 미체결(다음날 재시도)된다.
            px = parse_price(client.price(SYMBOL))
            if side in ("SELL", "EXSTOP"):
                limit = round(px * 0.90, 2)
                res = client.order(SYMBOL, "SELL", order_type="LIMIT",
                                   qty=qty, price=limit, tif="CLS")
                if side == "EXSTOP":
                    st["exception_latch"] = False
                    st["exception_blocked"] = True  # 정규 재점등까지 재발동 금지
            else:
                if cash is None:
                    raise RuntimeError("현금(buying-power) 조회 실패 — 주문 불가")
                amt = cash * (EX_FRAC if side == "EXBUY" else 0.995)
                limit = round(px * 1.10, 2)
                q = int(amt / limit)
                if q < 1:
                    raise RuntimeError(f"현금 ${amt:,.0f}로 1주(${limit}) 매수 불가")
                res = client.order(SYMBOL, "BUY", order_type="LIMIT",
                                   qty=q, price=limit, tif="CLS")
            if side == "EXBUY":
                st["exception_latch"] = True
                st["exception_entry"] = parse_price(client.price(SYMBOL))
            st["position"] = "CASH" if side in ("SELL", "EXSTOP") else SYMBOL
            oid = (res.get("result", res) or {}).get("orderId")
            journal(dict(type="trade", side=side, symbol=SYMBOL,
                         qty=(qty if side in ("SELL", "EXSTOP") else q),
                         limit=limit, ref_price=px, order_id=oid, desc=desc))
            notify("✅ " + msg + f"\n주문응답: {json.dumps(res, ensure_ascii=False)[:300]}")
        except Exception as e:
            journal(dict(type="error", side=side, error=str(e)[:200]))
            notify(f"🚨 주문 실패 — 수동 확인 필요!\n{msg}\n오류: {e}")
            raise

    journal(snap)
    st["last_run"] = today
    save_state(st)


if __name__ == "__main__":
    main()
