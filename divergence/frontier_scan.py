#!/usr/bin/env python3
"""프론티어 전수조사 — 기존 시스템(더블비/MA눌림목/다이버전스/넥라인)과 겹치지 않는
6개 신규 전략군을 동일 하네스로 백테스트.

  A orb      세션 개장 레인지 돌파(NY 16:30 / 런던 10:00), 당일 청산
  B gap      캐시 개장 갭 페이드/팔로우 (US100 16:30 앵커, 주말갭 포함)
  C vwap     일중 VWAP σ밴드 반전 / VWAP 눌림 (tickvol 가중)
  D squeeze  NR+인사이드바 변동성 압축 OCO 돌파
  E ignite   모멘텀 점화(레인지≥x×ATR & 종가 상단 마감) 연속 진입
  F level    골드 라운드넘버($50/$100)·일간 플로어피벗 리젝션

공통: 혼합TF 트리밍 · 보수 체결(SL 우선/갭손절 시가) · 동시 1포지션 ·
      0.05% 왕복 실비용 R(net05) · 전/후반 · 4분기 양수 개수.
시간대: MT5 서버시간(EET, GMT+2/+3) — NY 캐시 개장=16:30, 런던=10:00.
"""
import itertools
import os
import numpy as np
import pandas as pd
import gridsearch as g
from neckline_scan import TF_MIN

HERE = os.path.dirname(os.path.abspath(__file__))
COST = 0.0005          # 왕복 0.05%
MAX_HOLD_DEF = 300


def load_vt(path, mins):
    """혼합TF 트리밍 로드 + tickvol + 시각(분단위)/일자ID."""
    df = pd.read_csv(path, sep="\t")
    df.columns = [c.strip("<>").lower() for c in df.columns]
    dt = pd.to_datetime(df["date"] + " " + df["time"], format="%Y.%m.%d %H:%M:%S")
    d = dt.diff().dt.total_seconds().to_numpy() / 60
    start, run, run_start = 0, 0, 0
    for i in range(1, len(df)):
        if d[i] == mins:
            if run == 0:
                run_start = i - 1
            run += 1
            if run >= 50:
                start = run_start
                break
        elif d[i] >= 2000 or d[i] % mins == 0:
            pass
        else:
            run = 0
    df = df.iloc[start:]
    dt = dt.iloc[start:]
    mod = (dt.dt.hour * 60 + dt.dt.minute).to_numpy()
    day = dt.dt.normalize().to_numpy()
    dow = dt.dt.dayofweek.to_numpy()
    return (df["open"].to_numpy(float), df["high"].to_numpy(float),
            df["low"].to_numpy(float), df["close"].to_numpy(float),
            df["tickvol"].to_numpy(float), dt.to_numpy(), mod, day, dow)


def day_bounds(day):
    """일자별 (시작idx, 끝idx) 목록"""
    idx = np.flatnonzero(day[1:] != day[:-1]) + 1
    starts = np.concatenate(([0], idx))
    ends = np.concatenate((idx - 1, [len(day) - 1]))
    return list(zip(starts, ends))


def flip(o, h, l, c, d):
    return (o, h, l, c) if d == "long" else (-o, -l, -h, -c)


def sim(oo, hh, ll, cc, e, px, sl, tp, end_bar):
    """부호통일 좌표계. end_bar 종가 강제청산(None=MAX_HOLD)."""
    n = len(cc)
    risk = px - sl
    if risk <= 0 or e >= n:
        return None
    last = min(e + MAX_HOLD_DEF, n) - 1 if end_bar is None else min(end_bar, n - 1)
    for i in range(e, last + 1):
        if ll[i] <= sl:
            p = min(oo[i], sl) if i > e else sl
            if i == e and oo[i] < sl:
                p = oo[i]
            return (e, i, (p - px) / risk, risk)
        if tp is not None and hh[i] >= tp:
            return (e, i, (tp - px) / risk, risk)
    return (e, last, (cc[last] - px) / risk, risk)


def stats(trades, n):
    """trades: (e, r, riskfrac)"""
    if len(trades) < 20:
        return None
    rs = np.array([t[1] for t in trades])
    es = np.array([t[0] for t in trades])
    rf = np.array([t[2] for t in trades])
    half = n // 2
    r1, r2 = rs[es < half], rs[es >= half]
    q = np.minimum((es * 4) // n, 3)
    qpos = int(sum(rs[q == j].sum() > 0 for j in range(4) if (q == j).any()))
    gw = rs[rs > 0].sum(); gl = -rs[rs < 0].sum()
    rn = rs - COST / np.maximum(rf, 1e-9)
    return dict(trades=len(rs), winrate=float((rs > 0).mean()),
                avg_r=float(rs.mean()), sum_r=float(rs.sum()),
                pf=float(gw / max(gl, 1e-9)), net05=float(rn.mean()),
                risk_pct=float(rf.mean()),
                h1=float(r1.mean()) if len(r1) else np.nan,
                h2=float(r2.mean()) if len(r2) else np.nan,
                q_pos=qpos)


def riskfrac(risk, px, d):
    real = px if d == "long" else -px
    return abs(risk) / abs(real)


# ---------------- A. 세션 ORB ----------------
def scan_orb(sym, data, rows):
    o, h, l, c, v, dt, mod, day, dow = data
    n = len(c)
    atr = g.atr14(h, l, c)
    bounds = day_bounds(day)
    sessions = [("NY", 16 * 60 + 30)] + ([("LDN", 10 * 60)] if sym == "XAUUSD" else [])
    for (sname, anchor), orw, buf, slm, tpm, d in itertools.product(
            sessions, [30, 60], [0.0, 0.1], ["opp", "half"],
            ["1.5R", "2.5R", "3.5R", "eod"], ["long", "short"]):
        oo, hh, ll, cc = flip(o, h, l, c, d)
        sgn = 1 if d == "long" else -1
        trades = []
        for s0, s1 in bounds:
            m = mod[s0:s1 + 1]
            in_or = (m >= anchor) & (m < anchor + orw)
            if not in_or.any():
                continue
            oi = np.flatnonzero(in_or) + s0
            orh, orl = h[oi].max(), l[oi].min()
            rng = orh - orl
            a = atr[oi[-1]]
            if rng < 0.3 * a or rng <= 0:
                continue
            trig = (orh if d == "long" else orl) + sgn * buf * a
            trig_s = sgn * trig
            first = oi[-1] + 1
            for i in range(first, s1 + 1):
                if hh[i] >= trig_s:
                    px = max(oo[i], trig_s)
                    sl = sgn * (orl if d == "long" else orh) if slm == "opp" \
                        else sgn * ((orh + orl) / 2 if d == "long" else (orh + orl) / 2)
                    if slm == "half":
                        sl = sgn * ((orl + rng / 2) if d == "long" else (orh - rng / 2))
                    risk = px - sl
                    if risk <= 0:
                        break
                    tp = None if tpm == "eod" else px + float(tpm[:-1]) * risk
                    res = sim(oo, hh, ll, cc, i, px, sl, tp, s1)
                    if res:
                        e_, x_, r_, rk = res
                        trades.append((e_, r_, riskfrac(rk, px, d)))
                    break                      # 하루 1회
        st = stats(trades, n)
        if st:
            rows.append(dict(family="A.ORB", symbol=sym, tf=data[-1] if False else None,
                             direction=d, p1=f"{sname}", p2=f"or{orw}", p3=f"buf{buf}",
                             p4=slm, p5=tpm, **st))


# ---------------- B. 캐시 갭 ----------------
def scan_gap(sym, data, rows):
    o, h, l, c, v, dt, mod, day, dow = data
    n = len(c)
    atr = g.atr14(h, l, c)
    bounds = day_bounds(day)
    # 앵커: cash(16:30 vs 전일 23:00 마감) / week(월요일 첫봉 vs 금요일 마지막봉)
    for anchor_m, ming, slx, side, tpm in itertools.product(
            ["cash", "week"], [0.5, 1.0], [0.75, 1.5], ["fade", "follow"],
            ["fill", "half", "1.5R", "2.5R"]):
        if side == "fade" and tpm in ("1.5R", "2.5R"):
            continue
        if side == "follow" and tpm in ("fill", "half"):
            continue
        trades = []
        for bi in range(1, len(bounds)):
            s0, s1 = bounds[bi]
            p0, p1 = bounds[bi - 1]
            if anchor_m == "cash":
                mm = mod[s0:s1 + 1]
                cand = np.flatnonzero(mm >= 16 * 60 + 30)
                if not len(cand):
                    continue
                e = s0 + cand[0]
                pm = mod[p0:p1 + 1]
                pc_idx = np.flatnonzero(pm <= 23 * 60)
                if not len(pc_idx):
                    continue
                ref = c[p0 + pc_idx[-1]]
            else:
                if dow[s0] != 0:               # 월요일만
                    continue
                e = s0
                ref = c[p1]
            gap = o[e] - ref
            a = atr[e]
            if a <= 0 or abs(gap) < ming * a:
                continue
            up = gap > 0
            if side == "fade":
                d = "short" if up else "long"
            else:
                d = "long" if up else "short"
            sgn = 1 if d == "long" else -1
            oo, hh, ll, cc = flip(o, h, l, c, d)
            px = sgn * o[e]
            if side == "fade":
                tp_real = ref if tpm == "fill" else ref + gap / 2
                tp = sgn * tp_real
                sl = sgn * (o[e] + (slx * abs(gap)) * (1 if up else -1))
            else:
                sl = sgn * (o[e] - (slx * abs(gap)) * (1 if up else -1))
                risk0 = px - sl
                tp = px + float(tpm[:-1]) * risk0
            risk = px - sl
            if risk <= 0 or tp <= px:
                continue
            res = sim(oo, hh, ll, cc, e, px, sl, tp, s1)
            if res:
                e_, x_, r_, rk = res
                trades.append((e_, r_, riskfrac(rk, px, d)))
        st = stats(trades, n)
        if st:
            rows.append(dict(family="B.GAP", symbol=sym, tf=None, direction=side,
                             p1=anchor_m, p2=f"g{ming}", p3=f"sl{slx}", p4=tpm, p5="",
                             **st))


# ---------------- C. VWAP 밴드 ----------------
def vwap_day(o, h, l, c, v, bounds):
    n = len(c)
    vw = np.full(n, np.nan)
    sd = np.full(n, np.nan)
    tp = (h + l + c) / 3
    for s0, s1 in bounds:
        cv = np.cumsum(v[s0:s1 + 1])
        cpv = np.cumsum(tp[s0:s1 + 1] * v[s0:s1 + 1])
        cv = np.maximum(cv, 1e-9)
        m = cpv / cv
        cp2 = np.cumsum(tp[s0:s1 + 1] ** 2 * v[s0:s1 + 1])
        var = np.maximum(cp2 / cv - m * m, 0)
        vw[s0:s1 + 1] = m
        sd[s0:s1 + 1] = np.sqrt(var)
    return vw, sd


def scan_vwap(sym, data, rows):
    o, h, l, c, v, dt, mod, day, dow = data
    n = len(c)
    atr = g.atr14(h, l, c)
    bounds = day_bounds(day)
    vw, sd = vwap_day(o, h, l, c, v, bounds)
    day_start = {}
    for s0, s1 in bounds:
        for i in range(s0, s1 + 1):
            day_start[i] = (s0, s1)
    # (a) 밴드 이탈 반전
    for k, tpm, d in itertools.product([2.0, 3.0], ["vwap", "half"], ["long", "short"]):
        sgn = 1 if d == "long" else -1
        oo, hh, ll, cc = flip(o, h, l, c, d)
        trades = []
        last = -1
        for i in range(1, n - 1):
            if np.isnan(vw[i]) or np.isnan(vw[i - 1]) or sd[i] <= 0:
                continue
            s0, s1 = day_start[i]
            if i - s0 < 12 or i >= s1:
                continue
            band_p = vw[i - 1] - sgn * k * sd[i - 1]
            band = vw[i] - sgn * k * sd[i]
            out_p = sgn * c[i - 1] < sgn * band_p
            back = sgn * c[i] >= sgn * band
            if not (out_p and back):
                continue
            e = i + 1
            if e > s1 or e <= last:
                continue
            px = oo[e]
            ext = min(sgn * l[i - 1], sgn * l[i]) if d == "long" else min(-h[i - 1], -h[i])
            sl = ext - 0.5 * atr[i]
            risk = px - sl
            if risk <= 0:
                continue
            tgt = vw[i] if tpm == "vwap" else (vw[i] + (vw[i] - sgn * band) * -0.5)
            tp_s = sgn * vw[i] if tpm == "vwap" else px + (sgn * vw[i] - px) * 0.5
            if tp_s <= px:
                continue
            res = sim(oo, hh, ll, cc, e, px, sl, tp_s, s1)
            if res:
                e_, x_, r_, rk = res
                last = x_
                trades.append((e_, r_, riskfrac(rk, px, d)))
        st = stats(trades, n)
        if st:
            rows.append(dict(family="C.VWAP", symbol=sym, tf=None, direction=d,
                             p1="fade", p2=f"k{k}", p3=tpm, p4="", p5="", **st))
    # (b) VWAP 눌림 (추세 유지 중 첫 터치)
    for hold_n, tpx, d in itertools.product([12, 24], [1.5, 2.5], ["long", "short"]):
        sgn = 1 if d == "long" else -1
        oo, hh, ll, cc = flip(o, h, l, c, d)
        trades = []
        last = -1
        for s0, s1 in bounds:
            run = 0
            done = False
            for i in range(s0 + 1, s1):
                if np.isnan(vw[i]):
                    continue
                if sgn * c[i] > sgn * vw[i]:
                    run += 1
                else:
                    run = 0
                if done or run < hold_n:
                    continue
                if sgn * l[i + 1] if d == "long" else False:
                    pass
                nxt = i + 1
                touch = (l[nxt] <= vw[nxt] if d == "long" else h[nxt] >= vw[nxt])
                if not touch or np.isnan(vw[nxt]):
                    continue
                px = min(oo[nxt], sgn * vw[nxt])
                sl = sgn * vw[nxt] - 1.0 * atr[nxt]
                risk = px - sl
                if risk <= 0 or nxt <= last:
                    done = True
                    continue
                tp = px + tpx * risk
                res = sim(oo, hh, ll, cc, nxt, px, sl, tp, s1)
                if res:
                    e_, x_, r_, rk = res
                    last = x_
                    trades.append((e_, r_, riskfrac(rk, px, d)))
                done = True                    # 하루 1회
        st = stats(trades, n)
        if st:
            rows.append(dict(family="C.VWAP", symbol=sym, tf=None, direction=d,
                             p1="pull", p2=f"hold{hold_n}", p3=f"{tpx}R", p4="", p5="",
                             **st))


# ---------------- D. 변동성 압축 OCO ----------------
def scan_squeeze(sym, tf, data, rows):
    o, h, l, c, v, dt, mod, day, dow = data
    n = len(c)
    atr = g.atr14(h, l, c)
    tr = h - l
    for nrN, cancel, tpm in itertools.product([5, 7], [10], ["1.5R", "2.5R", "3.5R"]):
        sigs = []
        for i in range(nrN + 1, n - 2):
            inside = h[i] < h[i - 1] and l[i] > l[i - 1]
            if inside and tr[i] > 0 and tr[i] == tr[i - nrN + 1:i + 1].min():
                sigs.append(i)
        for d in ["long", "short"]:
            sgn = 1 if d == "long" else -1
            oo, hh, ll, cc = flip(o, h, l, c, d)
            trades = []
            last = -1
            for i in sigs:
                trig = sgn * (h[i] if d == "long" else l[i])
                slv = sgn * (l[i] if d == "long" else h[i])
                done = False
                for j in range(i + 1, min(i + 1 + cancel, n - 1)):
                    # 반대편 먼저 터치 → 이 방향 취소 (보수: 같은봉 양쪽=취소)
                    if ll[j] <= slv:
                        break
                    if hh[j] >= trig:
                        px = max(oo[j], trig)
                        risk = px - slv
                        if risk <= 0 or j <= last:
                            break
                        tp = px + float(tpm[:-1]) * risk
                        res = sim(oo, hh, ll, cc, j, px, slv, tp, None)
                        if res:
                            e_, x_, r_, rk = res
                            last = x_
                            trades.append((e_, r_, riskfrac(rk, px, d)))
                        break
            st = stats(trades, n)
            if st:
                rows.append(dict(family="D.SQZ", symbol=sym, tf=tf, direction=d,
                                 p1=f"nr{nrN}", p2=f"c{cancel}", p3=tpm, p4="", p5="",
                                 **st))


# ---------------- E. 모멘텀 점화 ----------------
def scan_ignite(sym, tf, data, rows):
    o, h, l, c, v, dt, mod, day, dow = data
    n = len(c)
    atr = g.atr14(h, l, c)
    tr = h - l
    for bigx, slm, xm, d in itertools.product(
            [1.5, 2.0], ["mid", "atr"], ["1.5R", "2.5R", "t10", "t20"], ["long", "short"]):
        sgn = 1 if d == "long" else -1
        oo, hh, ll, cc = flip(o, h, l, c, d)
        trades = []
        last = -1
        for i in range(15, n - 2):
            if tr[i] < bigx * atr[i] or tr[i] <= 0:
                continue
            pos = (c[i] - l[i]) / tr[i]
            posd = pos if d == "long" else 1 - pos
            brk = c[i] > h[i - 1] if d == "long" else c[i] < l[i - 1]
            if posd < 0.8 or not brk:
                continue
            e = i + 1
            if e <= last:
                continue
            px = oo[e]
            sl = sgn * ((h[i] + l[i]) / 2) if slm == "mid" else px - 1.0 * atr[i]
            risk = px - sl
            if risk <= 0:
                continue
            if xm.startswith("t"):
                res = sim(oo, hh, ll, cc, e, px, sl, None, e + int(xm[1:]))
            else:
                res = sim(oo, hh, ll, cc, e, px, sl, px + float(xm[:-1]) * risk, None)
            if res:
                e_, x_, r_, rk = res
                last = x_
                trades.append((e_, r_, riskfrac(rk, px, d)))
        st = stats(trades, n)
        if st:
            rows.append(dict(family="E.IGN", symbol=sym, tf=tf, direction=d,
                             p1=f"x{bigx}", p2=slm, p3=xm, p4="", p5="", **st))


# ---------------- F. 정적 레벨 (XAU) ----------------
def scan_level(sym, tf, data, rows):
    o, h, l, c, v, dt, mod, day, dow = data
    n = len(c)
    atr = g.atr14(h, l, c)
    bounds = day_bounds(day)
    # 일간 플로어 피벗
    piv = {}
    for bi in range(1, len(bounds)):
        s0, s1 = bounds[bi]
        p0, p1 = bounds[bi - 1]
        H, L, C = h[p0:p1 + 1].max(), l[p0:p1 + 1].min(), c[p1]
        pp = (H + L + C) / 3
        piv[bi] = dict(PP=pp, R1=2 * pp - L, S1=2 * pp - H)
    bar_day = np.zeros(n, int)
    for bi, (s0, s1) in enumerate(bounds):
        bar_day[s0:s1 + 1] = bi

    def levels_near(mode, price, bi):
        if mode == "round50":
            base = round(price / 50) * 50
            return [base - 50, base, base + 50]
        if mode == "round100":
            base = round(price / 100) * 100
            return [base - 100, base, base + 100]
        p = piv.get(bi)
        return list(p.values()) if p else []

    for mode, tpm, d in itertools.product(
            ["round50", "round100", "pivot"], ["1.5R", "2.5R", "next"], ["long", "short"]):
        if mode == "pivot" and tpm == "next":
            continue
        sgn = 1 if d == "long" else -1
        oo, hh, ll, cc = flip(o, h, l, c, d)
        trades = []
        last = -1
        for i in range(15, n - 2):
            a = atr[i]
            if a <= 0:
                continue
            for lv in levels_near(mode, c[i], bar_day[i]):
                lo_ = l[i] if d == "long" else -h[i]
                cl_ = sgn * c[i]
                lvs = sgn * lv
                pierce = lo_ < lvs and lo_ >= lvs - 0.3 * a
                back = cl_ > lvs
                bull = (c[i] > o[i]) if d == "long" else (c[i] < o[i])
                if not (pierce and back and bull):
                    continue
                e = i + 1
                if e <= last:
                    break
                px = oo[e]
                sl = lo_ - 0.3 * a
                risk = px - sl
                if risk <= 0:
                    break
                if tpm == "next":
                    step = 50 if mode == "round50" else 100
                    tp = sgn * (lv + sgn * step)
                else:
                    tp = px + float(tpm[:-1]) * risk
                if tp <= px:
                    break
                res = sim(oo, hh, ll, cc, e, px, sl, tp, None)
                if res:
                    e_, x_, r_, rk = res
                    last = x_
                    trades.append((e_, r_, riskfrac(rk, px, d)))
                break
        st = stats(trades, n)
        if st:
            rows.append(dict(family="F.LVL", symbol=sym, tf=tf, direction=d,
                             p1=mode, p2=tpm, p3="", p4="", p5="", **st))


def main():
    rows = []
    # 분봉: ORB/GAP/VWAP
    for sym, tf, fname in [
            ("US100", "M5", "US100.b_M5_202501240655_202606290345.csv"),
            ("US100", "M15", "US100.b_M15_202407010100_202606290345.csv"),
            ("XAUUSD", "M5", "XAUUSD.b_M5_202407010000_202606291240.csv"),
            ("XAUUSD", "M15", "XAUUSD.b_M15_202407010000_202606290345.csv")]:
        data = load_vt(os.path.join(g.ROOT, fname), TF_MIN.get(tf, 5))
        for r in (scan_orb, scan_gap, scan_vwap):
            before = len(rows)
            r(sym, data, rows)
            for k in range(before, len(rows)):
                rows[k]["tf"] = tf
        print(f"{sym} {tf}: A/B/C 완료 (누적 {len(rows)})", flush=True)
    # 중상위 TF: SQZ/IGN/LVL
    for sym, tf, fname in [
            ("US100", "M30", "US100.b_M30_202407010100_202606290330.csv"),
            ("US100", "H1", "US100.b_H1_202407010100_202606290300.csv"),
            ("US100", "H4", "US100.b_H4_202407010000_202606290000.csv"),
            ("XAUUSD", "M15", "XAUUSD.b_M15_202407010000_202606290345.csv"),
            ("XAUUSD", "M30", "XAUUSD.b_M30_202407010000_202606290330.csv"),
            ("XAUUSD", "H1", "XAUUSD.b_H1_202407010000_202606290300.csv"),
            ("XAUUSD", "H4", "XAUUSD.b_H4_202407010000_202606290000.csv")]:
        data = load_vt(os.path.join(g.ROOT, fname), TF_MIN[tf])
        scan_squeeze(sym, tf, data, rows)
        scan_ignite(sym, tf, data, rows)
        if sym == "XAUUSD" and tf in ("M15", "M30"):
            scan_level(sym, tf, data, rows)
        print(f"{sym} {tf}: D/E/F 완료 (누적 {len(rows)})", flush=True)

    df = pd.DataFrame(rows)
    df.to_csv(os.path.join(HERE, "results", "frontier_by_cell.csv"), index=False)
    pd.set_option("display.width", 320)
    ok = df[(df.trades >= 25) & (df.net05 > 0) & (df.h1 > 0) & (df.h2 > 0) & (df.q_pos >= 3)]
    print(f"\n견고 필터 통과: {len(ok)}/{len(df)}")
    best = ok.sort_values("net05", ascending=False).groupby(
        ["family", "symbol", "tf", "direction"], as_index=False).first()
    cols = ["family", "symbol", "tf", "direction", "p1", "p2", "p3", "p4", "p5",
            "trades", "winrate", "avg_r", "net05", "pf", "h1", "h2", "q_pos", "risk_pct"]
    print("\n=== 군·슬롯별 베스트 ===")
    print(best.sort_values("net05", ascending=False)[cols].to_string(index=False))
    print("\n=== 군별 평균 net05 (전체 셀) ===")
    print(df.groupby("family").net05.agg(["mean", "count"]).sort_values("mean", ascending=False).to_string())


if __name__ == "__main__":
    main()
