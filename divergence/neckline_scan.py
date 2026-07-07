#!/usr/bin/env python3
"""넥라인 눌림 (다중바닥 → 넥라인 돌파 → 리테스트 매수) 전수조사.

전략 정의 (롱, 숏은 다중천장 대칭):
  ① 다중바닥 클러스터: k봉 피벗저점들이 클러스터 최저점 ±tol×ATR14 안에 모임.
     - 저점 간격 k+1 ~ 60봉, 저점 사이 중간 반등이 minBounce×ATR 이상(질질 흐름 제외)
     - 클러스터 최저점을 maxBreak×ATR 이상 하회하는 저점 → 클러스터 무효, 새로 시작
  ② 넥라인 = 첫 저점~마지막 저점 사이 최고가. 바닥 2개(또는 3개) 이상 + 마지막
     저점 확정(k봉 뒤) 시 무장.
  ③ 돌파: 무장 후 brkWin봉 내 종가 > 넥라인. (대기 중 새 in-band 저점 확정 시
     클러스터 확장·넥라인 갱신·창 리셋)
  ④ 리테스트: 돌파 후 rtWin봉 내 저가 <= 넥라인 + touchTol×ATR (돌파봉 제외).
     - 그 전에 종가 < 넥라인 − failTol×ATR → 가짜 돌파, 취소
     - 리테스트 없이 가버리면 놓침(이 스타일의 비용)
  ⑤ 진입:
     - 터치(공격형): 넥라인 지정가 — 터치봉에서 min(시가, 넥라인) 체결
     - 확인형: 터치 후 5봉 내 양봉이 넥라인 위 마감 → 다음봉 시가
  ⑥ SL = 클러스터 최저점 − slATR×ATR. TP = RR×리스크 또는 패턴목표(넥라인+높이).
  ⑦ 보수적 체결(SL·TP 동시=SL, 갭손절 시가), 최대 300봉, 동시 1포지션.
"""
import itertools
import os
import numpy as np
import pandas as pd
import gridsearch as g
from combo_scan import load_full

HERE = os.path.dirname(os.path.abspath(__file__))

DATASETS = [
    ("US100", "M10", "US100.b_M10_202407010100_202606290340.csv"),
    ("US100", "M15", "US100.b_M15_202407010100_202606290345.csv"),
    ("US100", "M30", "US100.b_M30_202407010100_202606290330.csv"),
    ("US100", "H1",  "US100.b_H1_202407010100_202606290300.csv"),
    ("US100", "H2",  "US100.b_H2_202407010000_202606290200.csv"),
    ("US100", "H4",  "US100.b_H4_202407010000_202606290000.csv"),
    ("XAUUSD", "M10", "XAUUSD.b_M10_202407010000_202606290350.csv"),
    ("XAUUSD", "M15", "XAUUSD.b_M15_202407010000_202606290345.csv"),
    ("XAUUSD", "M30", "XAUUSD.b_M30_202407010000_202606290330.csv"),
    ("XAUUSD", "H1",  "XAUUSD.b_H1_202407010000_202606290300.csv"),
    ("XAUUSD", "H2",  "XAUUSD.b_H2_202407010000_202606290200.csv"),
    ("XAUUSD", "H4",  "XAUUSD.b_H4_202407010000_202606290000.csv"),
]
DIRS = ["long", "short"]
KS = [3, 5]
TOLS = [0.5, 1.0]
BOTTOMS = [2, 3]
ENTRIES = ["touch", "confirm"]
TPS = ["1.5R", "2.5R", "3.5R", "measured"]

MIN_BOUNCE = 1.0     # ×ATR — 저점 사이 최소 반등
MAX_BREAK = 0.3      # ×ATR — 클러스터 최저점 하회 허용
MAX_GAP = 60         # 저점 간 최대 봉수
BRK_WIN = 40         # 무장 후 돌파 대기(봉)
RT_WIN = 30          # 돌파 후 리테스트 대기(봉)
TOUCH_TOL = 0.2      # ×ATR — 리테스트 터치 허용
FAIL_TOL = 0.5       # ×ATR — 넥라인 아래 마감 시 가짜 돌파 취소
CONF_WIN = 5         # 확인형: 터치 후 양봉 대기(봉)
SL_ATR = 0.5         # SL = 최저점 − 이 값×ATR
MAX_HOLD = 300


def detect_events(o, h, l, c, atr, k, tol, d):
    """상태기계 → 이벤트 목록. 이벤트: dict(entry_touch, px_touch, entry_conf,
    px_conf, sl, neck, nbottoms, lows(list), measured_tp)"""
    n = len(c)
    lo = l if d == "long" else -h        # 숏은 부호 반전으로 '저점' 통일
    hi = h if d == "long" else -l
    op = o if d == "long" else -o
    cl = c if d == "long" else -c

    plo, _ = g.pivots(lo.reshape(-1) if False else np.asarray(lo), np.asarray(hi), k)
    piv_set = {p: p + k for p in plo}          # 피벗 → 확정봉

    events = []
    # 클러스터 상태
    cl_lows = []          # (bar, price)
    cl_min = None
    state = "SCAN"        # SCAN / ARMED / BROKE
    neck = None
    deadline = -1
    brk_bar = -1
    piv_sorted = sorted(plo)
    pi = 0
    i = 0
    while i < n - 1:
        # 이번 봉에서 확정되는 피벗 저점?
        new_piv = None
        while pi < len(piv_sorted) and piv_sorted[pi] + k <= i:
            new_piv = piv_sorted[pi]
            pi += 1
            break                     # 봉당 하나만 (연속 확정은 다음 루프에서)
        if new_piv is not None:
            p, px = new_piv, lo[new_piv]
            a = atr[p]
            if cl_lows and p - cl_lows[-1][0] <= MAX_GAP:
                if px < cl_min - MAX_BREAK * a:
                    cl_lows = [(p, px)]; cl_min = px; state = "SCAN"; neck = None
                elif abs(px - cl_min) <= tol * a:
                    # 중간 반등 확인
                    seg_hi = hi[cl_lows[-1][0]:p + 1].max()
                    if seg_hi - max(cl_lows[-1][1], px) >= MIN_BOUNCE * a:
                        cl_lows.append((p, px))
                        cl_min = min(cl_min, px)
                        if state in ("SCAN", "ARMED"):
                            neck = hi[cl_lows[0][0]:p + 1].max()
                            state = "ARMED"
                            deadline = i + BRK_WIN
                    # 반등 부족 → 무시(같은 바닥 노이즈)
                # 밴드 밖(위쪽) 저점 → 무시
            else:
                cl_lows = [(p, px)]; cl_min = px; state = "SCAN"; neck = None

        if state == "ARMED":
            if lo[i] < cl_min - MAX_BREAK * atr[i]:
                cl_lows = []; cl_min = None; state = "SCAN"; neck = None
            elif cl[i] > neck:
                state = "BROKE"; brk_bar = i; deadline = i + RT_WIN
            elif i >= deadline:
                state = "SCAN"           # 돌파 못 함 — 클러스터는 유지(새 저점 오면 재무장)
        elif state == "BROKE":
            a = atr[i]
            if cl[i] < neck - FAIL_TOL * a or lo[i] < cl_min:
                state = "SCAN"; cl_lows = []; cl_min = None; neck = None
            elif i > brk_bar and lo[i] <= neck + TOUCH_TOL * a:
                # ---- 리테스트 터치 ----
                px_touch = min(op[i], neck + TOUCH_TOL * a)
                e_conf = -1; px_conf = None
                for cc in range(i, min(i + CONF_WIN + 1, n - 1)):
                    if cl[cc] > op[cc] and cl[cc] > neck:
                        e_conf = cc + 1
                        px_conf = op[cc + 1]
                        break
                    if cl[cc] < neck - FAIL_TOL * atr[cc] or lo[cc] < cl_min:
                        break
                sl = cl_min - SL_ATR * atr[i]
                events.append(dict(
                    e_touch=i, px_touch=px_touch, e_conf=e_conf, px_conf=px_conf,
                    sl=sl, neck=neck, nbottoms=len(cl_lows),
                    lows=[b for b, _ in cl_lows],
                    measured=neck + (neck - cl_min)))
                state = "SCAN"; cl_lows = []; cl_min = None; neck = None
            elif i >= deadline:
                state = "SCAN"; cl_lows = []; cl_min = None; neck = None   # 안 눌러주고 감
        i += 1
    return events


def simulate_px(o, h, l, c, e, entry, sl, tp, d, sign):
    """부호 통일 좌표계(sign=1 롱 / -1 숏 반전값 그대로)에서 시뮬"""
    n = len(c)
    risk = entry - sl
    if risk <= 0 or e >= n:
        return None
    for i in range(e, min(e + MAX_HOLD, n)):
        if l[i] <= sl:
            px = min(o[i], sl) if i > e else sl
            if i == e and o[i] < sl:
                px = o[i]
            return (e, i, (px - entry) / risk, risk)
        if h[i] >= tp:
            return (e, i, (tp - entry) / risk, risk)
    i = min(e + MAX_HOLD, n) - 1
    return (e, i, (c[i] - entry) / risk, risk)


def run_dataset(sym, tf, path):
    o, h, l, c, v = load_full(path)
    n = len(c)
    atr = g.atr14(h, l, c)
    rows = []
    for d, k, tol in itertools.product(DIRS, KS, TOLS):
        # 부호 통일 좌표계
        sign = 1 if d == "long" else -1
        oo, hh, ll, cc = (o, h, l, c) if d == "long" else (-o, -l, -h, -c)
        evs = detect_events(o, h, l, c, atr, k, tol, d)
        for nb, em, tpm in itertools.product(BOTTOMS, ENTRIES, TPS):
            trades = []
            last = -1
            for ev in evs:
                if ev["nbottoms"] < nb:
                    continue
                if em == "touch":
                    e, px = ev["e_touch"], ev["px_touch"]
                else:
                    if ev["e_conf"] < 0:
                        continue
                    e, px = ev["e_conf"], ev["px_conf"]
                risk = px - ev["sl"]
                if risk <= 0:
                    continue
                tp = ev["measured"] if tpm == "measured" else px + float(tpm[:-1]) * risk
                if tp <= px:
                    continue
                res = simulate_px(oo, hh, ll, cc, e, px, ev["sl"], tp, d, sign)
                if res is None:
                    continue
                e_, x_, r_, rk = res
                if e_ <= last:
                    continue
                last = x_
                # 리스크% (비용 환산용) — 실제 가격 기준
                real_px = px if d == "long" else -px
                trades.append((e_, r_, abs(rk) / abs(real_px)))
            if len(trades) < 5:
                continue
            rs = np.array([t[1] for t in trades])
            es = np.array([t[0] for t in trades])
            rf = np.array([t[2] for t in trades])
            half = n // 2
            r1, r2 = rs[es < half], rs[es >= half]
            gw = rs[rs > 0].sum(); gl = -rs[rs < 0].sum()
            rn = rs - 0.0005 / rf          # 왕복 0.05% 실측 반영
            rows.append(dict(
                symbol=sym, tf=tf, direction=d, k=k, tol=tol, bottoms=nb,
                entry=em, tp=tpm, trades=len(rs),
                winrate=float((rs > 0).mean()), avg_r=float(rs.mean()),
                sum_r=float(rs.sum()), pf=float(gw / max(gl, 1e-9)),
                net05_avg_r=float(rn.mean()), risk_pct=float(rf.mean()),
                h1_avg_r=float(r1.mean()) if len(r1) else np.nan,
                h2_avg_r=float(r2.mean()) if len(r2) else np.nan,
                h1_n=int(len(r1)), h2_n=int(len(r2))))
    return rows


def main():
    all_rows = []
    for sym, tf, fname in DATASETS:
        rows = run_dataset(sym, tf, os.path.join(g.ROOT, fname))
        all_rows.extend(rows)
        print(f"{sym} {tf}: {len(rows)} cells", flush=True)
    df = pd.DataFrame(all_rows)
    df.to_csv(os.path.join(HERE, "results", "neckline_by_dataset.csv"), index=False)

    key = ["direction", "k", "tol", "bottoms", "entry", "tp"]
    agg = []
    for kv, grp in df.groupby(key):
        tr = int(grp.trades.sum())
        w = grp.trades / tr
        h1 = (grp.h1_avg_r.fillna(0) * grp.h1_n).sum() / max(grp.h1_n.sum(), 1)
        h2 = (grp.h2_avg_r.fillna(0) * grp.h2_n).sum() / max(grp.h2_n.sum(), 1)
        agg.append(dict(zip(key, kv)) | dict(
            trades=tr, avg_r=float((grp.avg_r * w).sum()),
            net05=float((grp.net05_avg_r * w).sum()),
            winrate=float((grp.winrate * w).sum()),
            pf=float((grp.pf * w).sum()),
            h1_avg_r=float(h1), h2_avg_r=float(h2),
            pos_ds=int((grp.sum_r > 0).sum()), n_ds=len(grp)))
    agg = pd.DataFrame(agg).sort_values("net05", ascending=False)
    agg.to_csv(os.path.join(HERE, "results", "neckline_agg.csv"), index=False)

    pd.set_option("display.width", 260)
    ok = agg[(agg.trades >= 30) & (agg.h1_avg_r > 0) & (agg.h2_avg_r > 0)]
    print(f"\n=== EA필터 통과 {len(ok)}/{len(agg)} — 0.05% 비용 차감 랭킹 상위 15 ===")
    print(ok.head(15).to_string(index=False))
    print("\n=== 차원별 평균 avg_r (무비용) ===")
    for dim in key:
        print(agg.groupby(dim).avg_r.mean().sort_values(ascending=False).to_string(), "\n")


if __name__ == "__main__":
    main()
