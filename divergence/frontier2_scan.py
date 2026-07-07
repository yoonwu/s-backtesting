#!/usr/bin/env python3
"""프론티어 2차 — 점화/압축을 넘어설 후보 탐색.

  G donch   돈치안 N봉 신고가 돌파 + 샹들리에 ATR 트레일 (장기 추세추종, H4/H8/D1)
  H ignpb   점화 후 첫 눌림 리밋 진입 (검증된 점화 엣지에 더 싼 가격으로)
  I regime  압축·점화 + MA 레짐 게이트 (승자 강화 스윕)

공통 하네스: frontier_scan(혼합TF 트리밍 · 보수 체결 · net05 · 전후반 · 4분기).
"""
import itertools
import os
import numpy as np
import pandas as pd
import gridsearch as g
from frontier_scan import load_vt, flip, sim, stats, riskfrac

HERE = os.path.dirname(os.path.abspath(__file__))

TFMIN2 = {"H4": 240, "H8": 480, "D1": 1440}


# ---------------- G. 돈치안 + 샹들리에 트레일 ----------------
def scan_donch(sym, tf, data, rows):
    o, h, l, c, v, dt, mod, day, dow = data
    n = len(c)
    atr = g.atr14(h, l, c)
    for N, trailK, d in itertools.product([20, 55], [2.0, 3.0], ["long", "short"]):
        sgn = 1 if d == "long" else -1
        oo, hh, ll, cc = flip(o, h, l, c, d)
        trades = []
        last = -1
        i = N + 15
        while i < n - 2:
            # 종가가 직전 N봉(자신 제외) 신고가 돌파
            ref = hh[i - N:i].max()
            if cc[i] > ref:
                e = i + 1
                if e <= last:
                    i += 1
                    continue
                px = oo[e]
                trail = px - trailK * atr[i]         # 초기 스톱
                risk0 = px - trail
                if risk0 <= 0:
                    i += 1
                    continue
                hiwater = cc[e]
                x = None
                for j in range(e, min(e + 600, n)):
                    # 트레일 갱신은 봉 마감 기준(전봉까지), 체크는 당일 저가
                    if ll[j] <= trail:
                        pxx = min(oo[j], trail) if j > e else trail
                        x = (j, (pxx - px) / risk0)
                        break
                    if cc[j] > hiwater:
                        hiwater = cc[j]
                    nt = hiwater - trailK * atr[j]
                    if nt > trail:
                        trail = nt
                if x is None:
                    j = min(e + 600, n) - 1
                    x = (j, (cc[j] - px) / risk0)
                last = x[0]
                trades.append((e, x[1], riskfrac(risk0, px, d)))
                i = x[0] + 1
                continue
            i += 1
        st = stats(trades, n)
        if st:
            rows.append(dict(family="G.DONCH", symbol=sym, tf=tf, direction=d,
                             p1=f"N{N}", p2=f"tr{trailK}", p3="", p4="", p5="", **st))


# ---------------- H. 점화 후 첫 눌림 ----------------
def scan_ignpb(sym, tf, data, rows):
    o, h, l, c, v, dt, mod, day, dow = data
    n = len(c)
    atr = g.atr14(h, l, c)
    tr = h - l
    for pb, slm, xm, d in itertools.product(
            [0.4, 0.8], ["mid", "low"], ["t20", "2.5R", "3.5R"], ["long", "short"]):
        sgn = 1 if d == "long" else -1
        oo, hh, ll, cc = flip(o, h, l, c, d)
        trades = []
        last = -1
        for i in range(15, n - 3):
            if tr[i] < 1.5 * atr[i] or tr[i] <= 0:
                continue
            pos = (c[i] - l[i]) / tr[i]
            posd = pos if d == "long" else 1 - pos
            brk = c[i] > h[i - 1] if d == "long" else c[i] < l[i - 1]
            if posd < 0.8 or not brk:
                continue
            lim = sgn * c[i] - pb * atr[i]        # 신호봉 종가 아래 pb×ATR 리밋
            sl = sgn * ((h[i] + l[i]) / 2) if slm == "mid" else sgn * (l[i] if d == "long" else h[i])
            # 5봉 내 리밋 체결 대기
            e = -1; px = None
            for j in range(i + 1, min(i + 6, n - 1)):
                if ll[j] <= lim:
                    e = j
                    px = min(oo[j], lim)
                    break
                if ll[j] <= sl:                   # 체결 전 SL 관통 → 셋업 취소
                    break
            if e < 0 or e <= last:
                continue
            risk = px - sl
            if risk <= 0:
                continue
            if xm == "t20":
                res = sim(oo, hh, ll, cc, e, px, sl, None, e + 20)
            else:
                res = sim(oo, hh, ll, cc, e, px, sl, px + float(xm[:-1]) * risk, None)
            if res:
                e_, x_, r_, rk = res
                last = x_
                trades.append((e_, r_, riskfrac(rk, px, d)))
        st = stats(trades, n)
        if st:
            rows.append(dict(family="H.IGNPB", symbol=sym, tf=tf, direction=d,
                             p1=f"pb{pb}", p2=slm, p3=xm, p4="", p5="", **st))


# ---------------- I. 승자 + MA 레짐 게이트 ----------------
def scan_regime(sym, tf, data, rows):
    o, h, l, c, v, dt, mod, day, dow = data
    n = len(c)
    atr = g.atr14(h, l, c)
    tr = h - l
    mas = {p: pd.Series(c).rolling(p).mean().to_numpy() for p in [50, 100]}
    # 점화 롱 + 게이트
    for maP in [0, 50, 100]:
        ma = mas.get(maP)
        trades = []
        last = -1
        for i in range(15, n - 2):
            if tr[i] < 1.5 * atr[i] or tr[i] <= 0:
                continue
            if (c[i] - l[i]) / tr[i] < 0.8 or not c[i] > h[i - 1]:
                continue
            if ma is not None and (np.isnan(ma[i]) or c[i] <= ma[i]):
                continue
            e = i + 1
            if e <= last:
                continue
            px = o[e]
            sl = (h[i] + l[i]) / 2
            if px - sl <= 0:
                continue
            res = sim(o, h, l, c, e, px, sl, None, e + 20)
            if res:
                e_, x_, r_, rk = res
                last = x_
                trades.append((e_, r_, abs(rk) / px))
        st = stats(trades, n)
        if st:
            rows.append(dict(family="I.IGN+MA", symbol=sym, tf=tf, direction="long",
                             p1=f"ma{maP}", p2="t20", p3="", p4="", p5="", **st))
    # 압축 롱 + 게이트
    for nrN in [5, 7]:
        for maP in [0, 50, 100]:
            ma = mas.get(maP)
            trades = []
            last = -1
            for i in range(nrN + 1, n - 2):
                inside = h[i] < h[i - 1] and l[i] > l[i - 1]
                if not (inside and tr[i] > 0 and tr[i] == tr[i - nrN + 1:i + 1].min()):
                    continue
                if ma is not None and (np.isnan(ma[i]) or c[i] <= ma[i]):
                    continue
                for j in range(i + 1, min(i + 11, n - 1)):
                    if l[j] <= l[i]:
                        break
                    if h[j] >= h[i]:
                        px = max(o[j], h[i])
                        risk = px - l[i]
                        if risk <= 0 or j <= last:
                            break
                        res = sim(o, h, l, c, j, px, l[i], px + 3.5 * risk, None)
                        if res:
                            e_, x_, r_, rk = res
                            last = x_
                            trades.append((e_, r_, abs(rk) / px))
                        break
            st = stats(trades, n)
            if st:
                rows.append(dict(family="I.SQZ+MA", symbol=sym, tf=tf, direction="long",
                                 p1=f"nr{nrN}", p2=f"ma{maP}", p3="3.5R", p4="", p5="",
                                 **st))


def main():
    rows = []
    DS = [
        ("US100", "H4", "US100.b_H4_202407010000_202606290000.csv"),
        ("US100", "H8", "US100.b_H8_202407010000_202606290000.csv"),
        ("US100", "D1", "US100.b_Daily_202407010000_202606290000.csv"),
        ("XAUUSD", "H4", "XAUUSD.b_H4_202407010000_202606290000.csv"),
        ("XAUUSD", "H8", "XAUUSD.b_H8_202407010000_202606290000.csv"),
        ("XAUUSD", "D1", "XAUUSD.b_Daily_202407010000_202606290000.csv"),
    ]
    for sym, tf, fname in DS:
        data = load_vt(os.path.join(g.ROOT, fname), TFMIN2[tf])
        scan_donch(sym, tf, data, rows)
        if tf == "H4":
            scan_ignpb(sym, tf, data, rows)
            scan_regime(sym, tf, data, rows)
        print(f"{sym} {tf}: 완료 (누적 {len(rows)})", flush=True)

    df = pd.DataFrame(rows)
    df.to_csv(os.path.join(HERE, "results", "frontier2_by_cell.csv"), index=False)
    pd.set_option("display.width", 320)
    ok = df[(df.trades >= 20) & (df.net05 > 0) & (df.h1 > 0) & (df.h2 > 0) & (df.q_pos >= 3)]
    print(f"\n견고 필터(거래20+) 통과: {len(ok)}/{len(df)}")
    cols = ["family", "symbol", "tf", "direction", "p1", "p2", "p3",
            "trades", "winrate", "avg_r", "net05", "pf", "h1", "h2", "q_pos", "risk_pct"]
    print("\n=== 통과 셀 전체 (net05 순) ===")
    print(ok.sort_values("net05", ascending=False)[cols].to_string(index=False))
    print("\n=== 전체 셀 상위 25 (필터 무관) ===")
    print(df.sort_values("net05", ascending=False).head(25)[cols].to_string(index=False))


if __name__ == "__main__":
    main()
