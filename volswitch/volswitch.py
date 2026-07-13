#!/usr/bin/env python3
"""볼스위칭(Vol-Switching) 백테스트 엔진.

규칙 (이진 스위칭):
    신호자산(기본 QQQ)의 종가가 MA(ma) 위에 있고,
    최근 vol_win일 실현변동성(연율화)이 vol_th% 미만이면
        → 매매자산(기본 TQQQ) 100% 보유
    아니면 → 현금 (기본 0% 수익)

체결 모델:
    signal[t]는 t일 종가까지의 데이터로 계산.
    lag=1(기본): t일 종가에 체결(MOC) → t+1일 수익률부터 반영.
    lag=2: 다음날 종가 체결 (보수적 검증용).

사용 예:
    python volswitch.py                          # 방어형 프리셋 (MA200, vol<28)
    python volswitch.py --preset aggressive      # 공격형 (MA150, vol<32)
    python volswitch.py --trade SOXL --signal SOXX
    python volswitch.py --grid                   # 파라미터 능선 스캔
    python volswitch.py --synthetic              # QQQ로 합성 3x를 만들어 닷컴 구간 포함 검증
    python volswitch.py --start 2018-01-01 --end 2022-12-31
"""
import argparse
import os
import sys

import numpy as np
import pandas as pd

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")

PRESETS = {
    # 이전 리서치(mumae-data)의 능선 중심값들
    "defensive":  dict(ma=200, vol_th=28.0),
    "aggressive": dict(ma=150, vol_th=32.0),
}

TRADING_DAYS = 252


def load(name: str) -> pd.Series:
    """조정 종가 시리즈 로드. data/{name}.csv (Date,Open,High,Low,Close,Volume)"""
    path = os.path.join(DATA_DIR, f"{name.lower()}.csv")
    if not os.path.exists(path):
        sys.exit(f"데이터 없음: {path}\n→ GitHub Actions 'fetch-market-data' 워크플로를 먼저 실행하세요.")
    df = pd.read_csv(path, parse_dates=["Date"]).set_index("Date").sort_index()
    s = df["Close"].astype(float)
    return s[s > 0].dropna()


def synthetic_3x(base: pd.Series, annual_drag_pct: float = 3.0) -> pd.Series:
    """기초지수 일수익률×3 − 비용드래그로 합성 3x 시리즈 생성.

    drag는 운용보수(~0.95%) + 스왑/자금조달 비용의 근사 상수. 실제 TQQQ와
    2010~ 구간에서 궤적이 대체로 일치하지만 금리 국면에 따라 ±는 있다.
    닷컴 구간 '강건성 확인'용이지 정밀 시뮬레이션이 아니다.
    """
    r = base.pct_change().fillna(0.0)
    r3 = 3.0 * r - (annual_drag_pct / 100.0) / TRADING_DAYS
    r3 = r3.clip(lower=-1.0)  # 하루 -33.3% 초과 하락 시 상장폐지(–100%) 근사
    return (1.0 + r3).cumprod() * 100.0


def realized_vol(close: pd.Series, win: int) -> pd.Series:
    """win일 실현변동성, 연율화 %"""
    return close.pct_change().rolling(win).std() * np.sqrt(TRADING_DAYS) * 100.0


def build_signal(sig_close: pd.Series, ma: int, vol_th: float, vol_win: int) -> pd.Series:
    sma = sig_close.rolling(ma).mean()
    vol = realized_vol(sig_close, vol_win)
    return ((sig_close > sma) & (vol < vol_th)).astype(float)


def run(trade_close: pd.Series, sig_close: pd.Series, ma: int, vol_th: float,
        vol_win: int = 20, lag: int = 1, cost_bps: float = 5.0,
        cash_rate: float = 0.0, start=None, end=None) -> dict:
    sig = build_signal(sig_close, ma, vol_th, vol_win)

    idx = trade_close.index.intersection(sig.index)
    # 신호 지표(MA) 워밍업 이후부터
    warm = sig_close.index[max(ma, vol_win)]
    idx = idx[idx >= warm]
    if start:
        idx = idx[idx >= pd.Timestamp(start)]
    if end:
        idx = idx[idx <= pd.Timestamp(end)]
    if len(idx) < 60:
        raise ValueError("구간이 너무 짧습니다")

    ret = trade_close.pct_change().reindex(idx).fillna(0.0)
    pos = sig.reindex(idx).ffill().shift(lag).fillna(0.0)

    switches = pos.diff().abs().fillna(0.0)
    daily_cash = (1.0 + cash_rate / 100.0) ** (1 / TRADING_DAYS) - 1.0
    strat_ret = pos * ret + (1.0 - pos) * daily_cash - switches * (cost_bps / 1e4)

    eq = (1.0 + strat_ret).cumprod()
    bh = (1.0 + ret).cumprod()
    years = (idx[-1] - idx[0]).days / 365.25

    def stats(curve):
        total = curve.iloc[-1]
        cagr = total ** (1 / years) - 1.0 if total > 0 else -1.0
        mdd = (curve / curve.cummax() - 1.0).min()
        mar = cagr / abs(mdd) if mdd < 0 else float("inf")
        return dict(mult=total, cagr=cagr * 100, mdd=mdd * 100, mar=mar)

    st, bs = stats(eq), stats(bh)
    yearly = pd.DataFrame({
        "strategy": (1 + strat_ret).groupby(idx.year).prod() - 1,
        "buy&hold": (1 + ret).groupby(idx.year).prod() - 1,
    }) * 100

    return dict(
        start=idx[0].date(), end=idx[-1].date(), years=years,
        strat=st, bh=bs,
        time_in=pos.mean() * 100,
        switches_per_yr=switches.sum() / 2 / years,  # 진입+청산 = 1회전
        yearly=yearly, equity=eq, bh_curve=bh,
    )


def fmt_report(r: dict, title: str) -> str:
    s, b = r["strat"], r["bh"]
    lines = [
        f"## {title}",
        f"구간: {r['start']} ~ {r['end']} ({r['years']:.1f}년)",
        "",
        "|  | 볼스위칭 | Buy&Hold |",
        "|---|---|---|",
        f"| 총 배수 | ×{s['mult']:.2f} | ×{b['mult']:.2f} |",
        f"| CAGR | {s['cagr']:.1f}% | {b['cagr']:.1f}% |",
        f"| MDD | {s['mdd']:.1f}% | {b['mdd']:.1f}% |",
        f"| MAR | {s['mar']:.2f} | {b['mar']:.2f} |",
        f"| 시장노출 | {r['time_in']:.0f}% | 100% |",
        f"| 회전/년 | {r['switches_per_yr']:.1f} | 0 |",
        "",
        "연도별 수익률(%):",
        "```",
        r["yearly"].round(1).to_string(),
        "```",
        "",
    ]
    return "\n".join(lines)


def grid_scan(trade_close, sig_close, args):
    rows = []
    for ma in [100, 125, 150, 175, 200, 225, 250]:
        for vt in [20, 24, 28, 32, 36, 40]:
            try:
                r = run(trade_close, sig_close, ma, vt, args.vol_win, args.lag,
                        args.cost_bps, args.cash_rate, args.start, args.end)
            except ValueError:
                continue
            rows.append(dict(ma=ma, vol=vt, cagr=round(r["strat"]["cagr"], 1),
                             mdd=round(r["strat"]["mdd"], 1),
                             mar=round(r["strat"]["mar"], 2)))
    df = pd.DataFrame(rows)
    for metric in ["cagr", "mar"]:
        print(f"\n=== {metric.upper()} (행=MA, 열=vol threshold %) ===")
        print(df.pivot(index="ma", columns="vol", values=metric).to_string())
    return df


def main():
    p = argparse.ArgumentParser(description="볼스위칭 백테스트")
    p.add_argument("--trade", default="TQQQ", help="매매자산 (TQQQ/SOXL/...)")
    p.add_argument("--signal", default="QQQ", help="신호자산 (QQQ/SOXX/NDX)")
    p.add_argument("--preset", choices=PRESETS, default=None)
    p.add_argument("--ma", type=int, default=200)
    p.add_argument("--vol-th", type=float, default=28.0)
    p.add_argument("--vol-win", type=int, default=20)
    p.add_argument("--lag", type=int, default=1, help="1=신호일 종가 체결(MOC), 2=다음날 종가")
    p.add_argument("--cost-bps", type=float, default=5.0, help="편도 체결비용 bp")
    p.add_argument("--cash-rate", type=float, default=0.0, help="현금 수익률 연 %")
    p.add_argument("--start", default=None)
    p.add_argument("--end", default=None)
    p.add_argument("--grid", action="store_true", help="파라미터 능선 스캔")
    p.add_argument("--synthetic", action="store_true",
                   help="신호자산으로 합성 3x를 만들어 매매 (닷컴 구간 포함 장기 검증)")
    p.add_argument("--drag", type=float, default=3.0, help="합성 3x 연간 비용드래그 %")
    p.add_argument("--md", default=None, help="결과를 markdown 파일로 저장")
    args = p.parse_args()

    if args.preset:
        args.ma = PRESETS[args.preset]["ma"]
        args.vol_th = PRESETS[args.preset]["vol_th"]

    sig_close = load(args.signal)
    if args.synthetic:
        trade_close = synthetic_3x(sig_close, args.drag)
        trade_name = f"synthetic 3x({args.signal}, drag {args.drag}%/yr)"
    else:
        trade_close = load(args.trade)
        trade_name = args.trade

    if args.grid:
        grid_scan(trade_close, sig_close, args)
        return

    r = run(trade_close, sig_close, args.ma, args.vol_th, args.vol_win,
            args.lag, args.cost_bps, args.cash_rate, args.start, args.end)
    title = (f"{trade_name} 볼스위칭 — {args.signal}>MA{args.ma} & "
             f"{args.vol_win}일 vol<{args.vol_th:.0f}% (lag={args.lag}, cost={args.cost_bps}bp)")
    report = fmt_report(r, title)
    print(report)
    if args.md:
        with open(args.md, "a") as f:
            f.write(report + "\n")


if __name__ == "__main__":
    main()
