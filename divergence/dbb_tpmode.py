#!/usr/bin/env python3
"""더블비 익절 기준 A/B: 돌파봉 TR vs 평단 TR — 확정 5종, 기간별(1/3/6개월/전체).

DoubleBB_EA.mq5 스펙 포팅:
  · 더블비 상단 = max(BB(시가,4,4σ), BB(종가,20,2σ)) 상단 (모집단 σ). 하단은 min.
  · 신호: 종가가 상단 첫 상향돌파 (c[i]>u[i] && c[i-1]<=u[i-1]). 숏 대칭.
  · MA필터: 롱=종가>SMA, 숏=<. 컨펌: cW봉 내 종가가 돌파봉 종가보다 유리.
  · 진입: TR분할(고가, 고가-TR, ...) 또는 등분N(고저 N등분). 지정가/스탑 배치.
  · SL = 최심 주문가 ∓ SLx×TR(돌파봉 TR, 고정).
  · TP = [breakout] 돌파봉가 ± TPx×TR  /  [avg] 평단 ± TPx×TR(체결마다 갱신).
  · 손절 우선(동시 도달), 갭 SL은 시가. 미체결 50봉 만료. 동시 1셋업.
  · 수익률 = 차수 균등 랏 가정, (청산가/체결가-1) 평균. 복리.

주의: 절대 수치는 웹 백테스터와 엔진 차이로 다를 수 있음 — 두 모드가 '같은
엔진'을 통과하므로 상대 비교(A/B)가 목적. 무비용.
"""
import numpy as np
import pandas as pd
import os
import gridsearch as g

HERE = os.path.dirname(os.path.abspath(__file__))


def load(path):
    df = pd.read_csv(path, sep="\t")
    df.columns = [c.strip("<>").lower() for c in df.columns]
    dt = pd.to_datetime(df["date"] + " " + df.get("time", "00:00:00"), format="%Y.%m.%d %H:%M:%S")
    return (df["open"].to_numpy(float), df["high"].to_numpy(float),
            df["low"].to_numpy(float), df["close"].to_numpy(float), dt.to_numpy())


def bb_side(arr, period, mult, upper):
    s = pd.Series(arr)
    m = s.rolling(period).mean()
    sd = s.rolling(period).std(ddof=0)
    return (m + (mult if upper else -mult) * sd).to_numpy()


def run_dbb(o, h, l, c, dt, direction, ma_period, entry_mode, n_split,
            sl_x, tp_x, tp_mode, confirm_w=0, expiry=50):
    """반환: 트레이드 리스트 (entry_time, ret)"""
    n = len(c)
    u = np.maximum(bb_side(o, 4, 4.0, True), bb_side(c, 20, 2.0, True))
    d = np.minimum(bb_side(o, 4, 4.0, False), bb_side(c, 20, 2.0, False))
    ma = pd.Series(c).rolling(ma_period).mean().to_numpy() if ma_period > 0 else None
    short = direction == "short"

    trades = []
    i = 25
    state = "IDLE"
    while i < n - 1:
        if state == "IDLE":
            band, band_p = (d[i], d[i - 1]) if short else (u[i], u[i - 1])
            sig = (c[i] < band and c[i - 1] >= band_p) if short else (c[i] > band and c[i - 1] <= band_p)
            ok = sig and not np.isnan(band) and not np.isnan(band_p)
            if ok and ma is not None and not np.isnan(ma[i]):
                ok = c[i] < ma[i] if short else c[i] > ma[i]
            tr = h[i] - l[i]
            if ok and tr > 0:
                brkH, brkL, brkC, brkTR = h[i], l[i], c[i], tr
                # 컨펌 대기
                place = i
                if confirm_w > 0:
                    place = -1
                    for j in range(i + 1, min(i + 1 + confirm_w, n)):
                        better = c[j] < brkC if short else c[j] > brkC
                        if better:
                            place = j
                            break
                    if place < 0:
                        i += 1
                        continue
                # 주문가 산출
                if entry_mode == "tr":
                    prices = [brkL + k * brkTR if short else brkH - k * brkTR for k in range(n_split)]
                else:
                    if n_split == 1:
                        prices = [brkL if short else brkH]
                    else:
                        prices = [(brkL + (brkH - brkL) * k / (n_split - 1)) if short
                                  else (brkH - (brkH - brkL) * k / (n_split - 1)) for k in range(n_split)]
                ref = c[place]
                kinds = [("limit" if (p >= ref if short else p <= ref) else "stop") for p in prices]
                extreme = max(prices) if short else min(prices)
                sl = extreme + sl_x * brkTR if short else extreme - sl_x * brkTR
                fills = []          # (price)
                filled = [False] * n_split
                j = place + 1
                end = min(n, j + 5000)
                exited = False
                while j < end:
                    # ① 체결 처리
                    for k2 in range(n_split):
                        if filled[k2]:
                            continue
                        p = prices[k2]
                        if kinds[k2] == "limit":
                            hit = h[j] >= p if short else l[j] <= p
                            px = max(o[j], p) if short else min(o[j], p)
                        else:
                            hit = l[j] <= p if short else h[j] >= p
                            px = min(o[j], p) if short else max(o[j], p)
                        if hit:
                            filled[k2] = True
                            fills.append(px)
                    if fills:
                        # ② 청산 체크 (SL 우선)
                        avg = float(np.mean(fills))
                        anchor = (brkL if short else brkH) if tp_mode == "breakout" else avg
                        tp = anchor - tp_x * brkTR if short else anchor + tp_x * brkTR
                        sl_hit = (h[j] >= sl) if short else (l[j] <= sl)
                        tp_hit = (l[j] <= tp) if short else (h[j] >= tp)
                        if sl_hit:
                            px = max(o[j], sl) if short else min(o[j], sl)
                            ret = float(np.mean([(f - px) / f if short else (px - f) / f for f in fills]))
                            trades.append((dt[fills and j], ret) if False else (dt[j], ret))
                            exited = True
                        elif tp_hit:
                            ret = float(np.mean([(f - tp) / f if short else (tp - f) / f for f in fills]))
                            trades.append((dt[j], ret))
                            exited = True
                    else:
                        if j - place >= expiry:
                            break        # 미체결 만료
                    if exited:
                        break
                    j += 1
                i = j
                continue
        i += 1
    return trades


STRATS = [
    ("① US100 M5 롱 TR3",  "US100.b_M5_202501240655_202606290345.csv",  "long", 120, "tr", 3, 1.5, 3.0, 0, "breakout"),
    ("④ XAU M5 숏 4등분",  "XAUUSD.b_M5_202407010000_202606291240.csv", "short", 200, "eq", 4, 0.5, 3.0, 0, "avg"),
    ("⑤ US100 H1 롱 3등분", "US100.b_H1_202407010100_202606290300.csv", "long", 0,  "eq", 3, 1.0, 3.0, 3, "breakout"),
    ("⑥ XAU H2 롱 단일",   "XAUUSD.b_H2_202407010000_202606290200.csv", "long", 0,  "eq", 1, 1.0, 3.0, 0, "breakout"),
    ("⑦ XAU M5 롱 TR3",   "XAUUSD.b_M5_202407010000_202606291240.csv", "long", 120, "tr", 3, 1.25, 2.0, 5, "breakout"),
]


def stats(trades, since):
    t = [(ts, r) for ts, r in trades if ts >= since]
    if not t:
        return "–", "–", "–", "–"
    rs = np.array([r for _, r in t])
    eq = 1.0; peak = 1.0; mdd = 0.0
    for r in rs:
        eq *= 1 + r
        peak = max(peak, eq); mdd = min(mdd, eq / peak - 1)
    gw = rs[rs > 0].sum(); gl = -rs[rs < 0].sum()
    return len(rs), f"{100*(eq-1):+.1f}%", f"{gw/max(gl,1e-9):.2f}", f"{100*mdd:.1f}%"


def main():
    end = np.datetime64("2026-06-29")
    periods = [("1개월", end - np.timedelta64(30, "D")), ("3개월", end - np.timedelta64(90, "D")),
               ("6개월", end - np.timedelta64(180, "D")), ("전체", np.datetime64("2000-01-01"))]
    for name, fname, d, maP, em, ns, slx, tpx, cw, cur in STRATS:
        o, h, l, c, dt = load(os.path.join(g.ROOT, fname))
        print(f"\n===== {name} (현재 모드: {'돌파TR' if cur=='breakout' else '평단TR'}) =====")
        res = {}
        for mode in ("breakout", "avg"):
            res[mode] = run_dbb(o, h, l, c, dt, d, maP, em, ns, slx, tpx, mode, cw)
        print(f"{'기간':6s} | {'--- 돌파TR ---':>28s} | {'--- 평단TR ---':>28s}")
        print(f"{'':6s} | {'거래':>4s} {'수익':>8s} {'PF':>5s} {'MDD':>7s} | {'거래':>4s} {'수익':>8s} {'PF':>5s} {'MDD':>7s}")
        for pname, since in periods:
            b = stats(res["breakout"], since)
            a = stats(res["avg"], since)
            print(f"{pname:6s} | {str(b[0]):>4s} {b[1]:>8s} {b[2]:>5s} {b[3]:>7s} | {str(a[0]):>4s} {a[1]:>8s} {a[2]:>5s} {a[3]:>7s}")


if __name__ == "__main__":
    main()
