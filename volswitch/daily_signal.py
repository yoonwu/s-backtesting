#!/usr/bin/env python3
"""볼스위칭 데일리 신호 계산기 (GitHub Actions에서 장 마감 ~30분 전 실행).

출력: stdout에 사람이 읽는 리포트, signal_state.json 갱신,
      상태 변경 시 signal_changed.txt 생성 (워크플로가 알림 발송에 사용).
"""
import json
import os
import sys
from datetime import datetime, timezone

import numpy as np
import pandas as pd
import yfinance as yf

HERE = os.path.dirname(os.path.abspath(__file__))
STATE = os.path.join(HERE, "signal_state.json")

MA_AGG, VOL_AGG = 150, 32.0      # 공격형 (운영 기준)
MA_DEF, VOL_DEF = 200, 28.0      # 방어형 (참고 표시)
EX_MA, EX_RSI, EX_DD = 400, 30.0, -0.40  # 예외매수 트리거


def rsi_wilder(close, n=14):
    d = close.diff()
    up = d.clip(lower=0).ewm(alpha=1 / n, adjust=False).mean()
    dn = (-d.clip(upper=0)).ewm(alpha=1 / n, adjust=False).mean()
    return 100 - 100 / (1 + up / dn.replace(0, np.nan))


def compute_state():
    """QQQ 데이터를 받아 현재 신호 상태 dict를 반환 (트레이더에서도 재사용)."""
    df = yf.download("QQQ", period="3y", auto_adjust=True, progress=False)
    df.columns = [c[0] if isinstance(c, tuple) else c for c in df.columns]
    close = df["Close"].dropna()
    if len(close) < EX_MA + 5:
        sys.exit("QQQ 데이터 부족")

    px = float(close.iloc[-1])
    ma_agg = float(close.rolling(MA_AGG).mean().iloc[-1])
    ma_def = float(close.rolling(MA_DEF).mean().iloc[-1])
    ma_ex = float(close.rolling(EX_MA).mean().iloc[-1])
    vol20 = float(close.pct_change().rolling(20).std().iloc[-1] * np.sqrt(252) * 100)
    rsi14 = float(rsi_wilder(close).iloc[-1])
    dd = px / float(close.cummax().iloc[-1]) - 1

    sig_agg = px > ma_agg and vol20 < VOL_AGG
    sig_def = px > ma_def and vol20 < VOL_DEF
    exception = (px < ma_ex and rsi14 < EX_RSI) or (dd <= EX_DD)

    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    return dict(
        asof=str(close.index[-1].date()), computed_at=now,
        qqq=round(px, 2), ma150=round(ma_agg, 2), ma200=round(ma_def, 2),
        ma400=round(ma_ex, 2), vol20=round(vol20, 1), rsi14=round(rsi14, 1),
        dd_from_ath=round(dd * 100, 1),
        signal_aggressive="HOLD" if sig_agg else "CASH",
        signal_defensive="HOLD" if sig_def else "CASH",
        exception_buy=bool(exception),
    )


def main():
    state = compute_state()
    exception = state["exception_buy"]

    prev = {}
    if os.path.exists(STATE):
        with open(STATE) as f:
            prev = json.load(f)

    changed = (prev.get("signal_aggressive") != state["signal_aggressive"]
               or prev.get("exception_buy") != state["exception_buy"])

    with open(STATE, "w") as f:
        json.dump(state, f, indent=2, ensure_ascii=False)

    lines = [
        f"## 볼스위칭 신호 — {state['asof']} 기준",
        "",
        f"| 공격형(MA150, vol<32) | **{state['signal_aggressive']}** |",
        "|---|---|",
        f"| 방어형(MA200, vol<28) 참고 | {state['signal_defensive']} |",
        f"| 예외매수(400MA↓&RSI<30 or −40%) | {'⚠️ 발동' if exception else '미발동'} |",
        f"| QQQ | {state['qqq']} (MA150 {state['ma150']}, MA200 {state['ma200']}) |",
        f"| 20일 변동성 | {state['vol20']}% |",
        f"| RSI14 / 고점대비 | {state['rsi14']} / {state['dd_from_ath']}% |",
    ]
    if changed:
        old = prev.get("signal_aggressive", "?")
        action = ("장마감(MOC) 전량 매수" if state["signal_aggressive"] == "HOLD"
                  else "장마감(MOC) 전량 매도")
        if prev.get("exception_buy") != state["exception_buy"] and exception:
            action = "예외매수 트리거 발동 — 사전 결정된 비중만 매수"
        lines = [f"# 🚨 신호 변경: {old} → {state['signal_aggressive']}",
                 f"## 오늘 할 일: {action}", ""] + lines
        with open(os.path.join(HERE, "signal_changed.txt"), "w") as f:
            f.write(f"{old} -> {state['signal_aggressive']}"
                    + (" +EXCEPTION" if exception else ""))
    report = "\n".join(lines)
    print(report)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a") as f:
            f.write(report + "\n")


if __name__ == "__main__":
    main()
