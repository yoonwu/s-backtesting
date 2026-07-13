#!/usr/bin/env python3
"""TQQQ 후보 검증: QQQ>SMA200 + TQQQ RSI(3)<=30 눌림목 매수.

규칙:
  진입: t일 종가 기준 QQQ종가>SMA200(QQQ) AND RSI(3,TQQQ)<=30 → t+1 시가 매수
  청산: 15거래일 보유 도달 OR QQQ 종가<SMA200 → t+1 시가 매도
  과매수 청산 없음. 전량 진입/청산.

사용:
  python3 rsi_pullback.py                     # 기본 (Wilder RSI)
  python3 rsi_pullback.py --sens              # 민감도 스캔
  python3 rsi_pullback.py --synthetic         # 합성 3x로 1999~ (닷컴 포함)
"""
import argparse
import os

import numpy as np
import pandas as pd

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
TRADING_DAYS = 252


def load_ohlc(name):
    df = pd.read_csv(os.path.join(DATA_DIR, f"{name.lower()}.csv"),
                     parse_dates=["Date"]).set_index("Date").sort_index()
    return df[["Open", "Close"]].astype(float).dropna()


def rsi_wilder(close, n):
    d = close.diff()
    up = d.clip(lower=0).ewm(alpha=1 / n, adjust=False).mean()
    dn = (-d.clip(upper=0)).ewm(alpha=1 / n, adjust=False).mean()
    rs = up / dn.replace(0, np.nan)
    return (100 - 100 / (1 + rs)).fillna(100)


def rsi_cutler(close, n):
    d = close.diff()
    up = d.clip(lower=0).rolling(n).mean()
    dn = (-d.clip(upper=0)).rolling(n).mean()
    rs = up / dn.replace(0, np.nan)
    return (100 - 100 / (1 + rs)).fillna(100)


def run(trade, qqq_close, rsi_n=3, rsi_th=30, hold_days=15, ma=200,
        rsi_fn=rsi_wilder, cost_bps=0.0, start=None, end=None):
    sma = qqq_close.rolling(ma).mean()
    rsi = rsi_fn(trade["Close"], rsi_n)

    idx = trade.index.intersection(qqq_close.index)
    idx = idx[idx >= qqq_close.index[ma]]
    if start:
        idx = idx[idx >= pd.Timestamp(start)]
    if end:
        idx = idx[idx <= pd.Timestamp(end)]

    o = trade["Open"].reindex(idx).to_numpy()
    c = trade["Close"].reindex(idx).to_numpy()
    trend = (qqq_close > sma).reindex(idx).to_numpy()
    r = rsi.reindex(idx).to_numpy()
    cost = cost_bps / 1e4

    equity = np.empty(len(idx))
    cash, shares = 1.0, 0.0
    holding, held, pend_buy, pend_sell = False, 0, False, False
    n_trades, in_days = 0, 0

    for t in range(len(idx)):
        # 전날 신호 체결 (시가)
        if pend_buy and not holding:
            shares = cash * (1 - cost) / o[t]
            cash, holding, held, n_trades = 0.0, True, 0, n_trades + 1
        elif pend_sell and holding:
            cash = shares * o[t] * (1 - cost)
            shares, holding = 0.0, False
        pend_buy = pend_sell = False

        if holding:
            held += 1
            in_days += 1

        # 당일 종가 신호
        if holding and (held >= hold_days or not trend[t]):
            pend_sell = True
        elif not holding and trend[t] and r[t] <= rsi_th:
            pend_buy = True

        equity[t] = cash + shares * c[t]

    eq = pd.Series(equity, index=idx)
    years = (idx[-1] - idx[0]).days / 365.25
    cagr = eq.iloc[-1] ** (1 / years) - 1
    mdd = (eq / eq.cummax() - 1).min()
    bh = c[-1] / c[0]
    bh_cagr = bh ** (1 / years) - 1
    bh_mdd = (pd.Series(c, index=idx) / pd.Series(c, index=idx).cummax() - 1).min()
    return dict(start=idx[0].date(), end=idx[-1].date(), years=years,
                mult=eq.iloc[-1], cagr=cagr * 100, mdd=mdd * 100,
                mar=cagr / abs(mdd), exposure=in_days / len(idx) * 100,
                trades_per_yr=n_trades / years,
                bh_cagr=bh_cagr * 100, bh_mdd=bh_mdd * 100, equity=eq)


def line(tag, r):
    print(f"{tag:38s} CAGR {r['cagr']:6.1f}%  MDD {r['mdd']:6.1f}%  "
          f"MAR {r['mar']:5.2f}  노출 {r['exposure']:5.1f}%  "
          f"매매 {r['trades_per_yr']:4.1f}/년  ×{r['mult']:.1f}")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--sens", action="store_true")
    p.add_argument("--synthetic", action="store_true")
    p.add_argument("--cost-bps", type=float, default=0.0)
    p.add_argument("--start", default=None)
    p.add_argument("--end", default=None)
    args = p.parse_args()

    qqq = load_ohlc("qqq")
    if args.synthetic:
        r3 = (3 * qqq["Close"].pct_change().fillna(0)
              - 0.03 / TRADING_DAYS).clip(lower=-1)
        sc = (1 + r3).cumprod() * 100
        # 합성 시가: QQQ 시가/종가 비율로 근사
        so = sc.shift(1) * (1 + 3 * (qqq["Open"] / qqq["Close"].shift(1) - 1))
        trade = pd.DataFrame({"Open": so, "Close": sc}).dropna()
        label = "synthetic3x 1999~"
    else:
        trade = load_ohlc("tqqq")
        label = "TQQQ"

    base = run(trade, qqq["Close"], cost_bps=args.cost_bps,
               start=args.start, end=args.end)
    print(f"구간 {base['start']} ~ {base['end']} ({base['years']:.1f}년)  "
          f"B&H: CAGR {base['bh_cagr']:.1f}% / MDD {base['bh_mdd']:.1f}%")
    line(f"{label} RSI3<=30 +SMA200, 15일보유", base)

    if args.sens:
        print("\n--- 민감도 ---")
        for n in [2, 3, 4]:
            for th in [25, 30, 35]:
                line(f"RSI({n})<={th}",
                     run(trade, qqq["Close"], rsi_n=n, rsi_th=th,
                         cost_bps=args.cost_bps, start=args.start, end=args.end))
        for hd in [5, 10, 15, 20, 25]:
            line(f"보유 {hd}일",
                 run(trade, qqq["Close"], hold_days=hd,
                     cost_bps=args.cost_bps, start=args.start, end=args.end))
        line("Cutler RSI(단순평균)",
             run(trade, qqq["Close"], rsi_fn=rsi_cutler,
                 cost_bps=args.cost_bps, start=args.start, end=args.end))
        line("MA150", run(trade, qqq["Close"], ma=150,
                          cost_bps=args.cost_bps, start=args.start, end=args.end))


if __name__ == "__main__":
    main()
