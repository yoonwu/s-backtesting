#!/usr/bin/env python3
"""볼스위칭 조종석 v2 — 토스 앱 없이 계좌·신호·주문·봇 상태를 한 화면에.

실행: panel.bat 더블클릭. 조회 전용 (주문 기능 없음). 10분마다 자동 새로고침.
"""
import os
import re
import subprocess
import sys
import threading
import tkinter as tk
from tkinter import messagebox

HERE = os.path.dirname(os.path.abspath(__file__))
ENV_PATH = os.path.join(HERE, ".env")
LOG_PATH = os.path.join(HERE, "trader.log")
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))

BG, FG, DIM = "#161a1e", "#e8e8e8", "#8a9199"
GREEN, RED, ORANGE = "#2e7d32", "#b03a3a", "#c98a00"


def read_env() -> dict:
    d = {}
    if os.path.exists(ENV_PATH):
        for line in open(ENV_PATH, encoding="utf-8"):
            m = re.match(r"^\s*([^#][^=]*)=(.*)$", line)
            if m:
                d[m.group(1).strip()] = m.group(2).strip()
    return d


def set_env_key(key: str, val: str):
    lines = open(ENV_PATH, encoding="utf-8").read().splitlines()
    out, done = [], False
    for ln in lines:
        if re.match(rf"^\s*{key}\s*=", ln):
            out.append(f"{key}={val}")
            done = True
        else:
            out.append(ln)
    if not done:
        out.append(f"{key}={val}")
    open(ENV_PATH, "w", encoding="utf-8").write("\n".join(out) + "\n")


def last_run_line() -> str:
    if not os.path.exists(LOG_PATH):
        return "실행 기록 없음"
    lines = [ln.strip() for ln in
             open(LOG_PATH, encoding="utf-8", errors="ignore") if ln.strip()]
    for ln in reversed(lines):
        if "----- 실행" in ln:
            return ln.replace("----- 실행 -----", "").strip("[] -")
    return "실행 기록 없음"


def fnum(v, default=0.0):
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


class Panel(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("볼스위칭 조종석")
        self.geometry("640x600")
        self.configure(bg=BG)

        self.sig = self._lbl("신호 확인 중...", 22, DIM)
        self.sig.pack(pady=(14, 2), fill="x", padx=16)
        self.sig_detail = self._lbl("", 10, DIM)
        self.sig_detail.pack()

        self._section("내 계좌")
        self.acct = self._lbl("조회 중...", 12, FG)
        self.acct.pack(pady=2)
        self.pnl = self._lbl("", 14, FG)
        self.pnl.pack(pady=2)
        self.cash = self._lbl("", 11, FG)
        self.cash.pack(pady=2)

        self._section("진행 중 주문")
        self.orders = self._lbl("조회 중...", 10, DIM)
        self.orders.pack(pady=2)

        self._section("봇")
        self.bot = self._lbl("", 11, FG)
        self.bot.pack(pady=2)

        btns = tk.Frame(self, bg=BG)
        btns.pack(pady=12)
        self.toggle_btn = self._btn(btns, "", self.toggle_enabled, 0)
        self.mode_btn = self._btn(btns, "", self.toggle_dry, 1)
        self._btn(btns, "새로고침", self.refresh, 2)
        self._btn(btns, "로그", self.open_log, 3)

        self._lbl("10분마다 자동 새로고침 · 조회 전용(이 창은 주문 못 냄) · "
                  "멈추려면 [봇 끄기] 하나면 끝", 9, DIM).pack(side="bottom", pady=8)

        self.refresh()
        self.after(600_000, self._auto)

    # ---------- UI helpers ----------
    def _lbl(self, text, size, fg):
        return tk.Label(self, text=text, font=("Malgun Gothic", size, "bold"),
                        fg=fg, bg=BG, justify="center")

    def _section(self, title):
        f = tk.Frame(self, bg=BG)
        f.pack(fill="x", padx=24, pady=(12, 2))
        tk.Label(f, text=f"─ {title} ", font=("Malgun Gothic", 9), fg=DIM,
                 bg=BG).pack(side="left")

    def _btn(self, parent, text, cmd, col):
        b = tk.Button(parent, text=text, command=cmd, width=12, height=2,
                      font=("Malgun Gothic", 10, "bold"),
                      bg="#2c3138", fg="white", activebackground="#444")
        b.grid(row=0, column=col, padx=5)
        return b

    def _auto(self):
        self.refresh()
        self.after(600_000, self._auto)

    # ---------- 데이터 ----------
    def refresh(self):
        env = read_env()
        enabled = env.get("TRADER_ENABLED", "0") == "1"
        dry = env.get("DRY_RUN", "1") != "0"
        self.toggle_btn.config(text="봇 끄기" if enabled else "봇 켜기",
                               bg="#7a2727" if enabled else GREEN)
        self.mode_btn.config(text=f"모드: {'모의' if dry else '⚡실전'}",
                             bg="#2c3138" if dry else "#8a6d00")
        self.bot.config(
            text=f"{'● 켜짐' if enabled else '○ 꺼짐'} · "
                 f"{'모의(주문 안 나감)' if dry else '⚡ 실전'} · "
                 f"마지막 실행 {last_run_line()} · 다음 실행 매일 04:40",
            fg="#9fdc9f" if enabled else "#dc9f9f")
        threading.Thread(target=self._fetch, daemon=True).start()

    def _fetch(self):
        os.environ.update(read_env())
        symbol = os.environ.get("SYMBOL", "TQQQ")

        # 1) 신호
        try:
            from daily_signal import compute_state
            s = compute_state(None)
            hold = s["signal_aggressive"] == "HOLD"
            txt = "HOLD — TQQQ 보유 구간" if hold else "CASH — 현금 대기 구간"
            if s.get("exception_buy"):
                txt += "  ⚠예외매수 발동!"
            det = (f"QQQ {s['qqq']} · MA150 {s['ma150']} (버퍼 ±0.5%) · "
                   f"변동성 {s['vol20']}% (진입<32/청산>36) · RSI {s['rsi14']} · "
                   f"고점대비 {s['dd_from_ath']}% · 기준일 {s['asof']}")
            self.after(0, lambda: (self.sig.config(text=txt, fg="white",
                       bg=GREEN if hold else RED),
                       self.sig_detail.config(text=det)))
        except Exception as e:
            self.after(0, lambda e=e: self.sig.config(
                text=f"신호 계산 실패: {str(e)[:60]}", fg="#dc9f9f", bg=BG))

        # 2) 계좌 (holdings에 손익까지 다 있음)
        try:
            from toss_client import TossClient
            c = TossClient()
            raw = c.holdings()
            res = raw.get("result", {}) or {}
            items = res.get("items", [])
            it = next((i for i in items if i.get("symbol") == symbol), {})
            qty = fnum(it.get("quantity"))
            avg = fnum(it.get("averagePurchasePrice"))
            last = fnum(it.get("lastPrice"))
            mv = fnum((it.get("marketValue") or {}).get("amount"))
            pl = it.get("profitLoss") or {}
            pl_amt, pl_rate = fnum(pl.get("amount")), fnum(pl.get("rate")) * 100
            dpl = it.get("dailyProfitLoss") or {}
            d_amt, d_rate = fnum(dpl.get("amount")), fnum(dpl.get("rate")) * 100
            acct = (f"{symbol} {qty:.4g}주 · 평단 ${avg:,.2f} · 현재 ${last:,.2f}"
                    f" · 평가 ${mv:,.2f}")
            sign = "+" if pl_amt >= 0 else ""
            pnl = (f"손익 {sign}${pl_amt:,.2f} ({sign}{pl_rate:.1f}%)   "
                   f"오늘 {'+' if d_amt >= 0 else ''}${d_amt:,.2f} "
                   f"({'+' if d_rate >= 0 else ''}{d_rate:.2f}%)")
            pnl_color = "#7fdc7f" if pl_amt >= 0 else "#dc7f7f"
            try:
                usd = c.usd_cash()
            except Exception:
                usd = None
            cash_txt = f"달러 현금 ${usd:,.2f}" if usd is not None else "달러 현금 조회 실패"
            try:
                krw = c.krw_cash()
                if krw >= 100000:
                    cash_txt += f"   ⚠원화 ₩{krw:,.0f} — 앱에서 환전 필요"
            except Exception:
                pass
            self.after(0, lambda: (self.acct.config(text=acct),
                       self.pnl.config(text=pnl, fg=pnl_color),
                       self.cash.config(text=cash_txt)))
        except Exception as e:
            self.after(0, lambda e=e: self.acct.config(
                text=f"계좌 조회 실패: {str(e)[:70]}"))
            return

        # 3) 진행 중 주문
        try:
            odata = None
            for q in ("?status=OPEN", ""):
                try:
                    odata = c._req("GET", f"/api/v1/orders{q}")
                    break
                except Exception:
                    continue
            lines = []
            if odata:
                olist = odata.get("result", odata)
                if isinstance(olist, dict):
                    olist = olist.get("items") or olist.get("orders") or []
                for o in (olist or [])[:5]:
                    side = o.get("side", "?")
                    stt = (o.get("status") or o.get("orderStatus") or "?")
                    q_ = o.get("quantity") or o.get("qty") or "?"
                    p_ = o.get("price") or "-"
                    lines.append(f"{o.get('symbol','?')} {side} {q_}주 @ {p_} · {stt}")
            self.after(0, lambda: self.orders.config(
                text="\n".join(lines) if lines else "진행 중 주문 없음",
                fg=FG if lines else DIM))
        except Exception as e:
            self.after(0, lambda e=e: self.orders.config(
                text=f"주문 조회 실패: {str(e)[:60]}"))

    # ---------- 버튼 ----------
    def toggle_enabled(self):
        enabled = read_env().get("TRADER_ENABLED", "0") == "1"
        if enabled and not messagebox.askyesno(
                "봇 끄기", "봇을 끄면 신호가 와도 아무것도 하지 않습니다.\n"
                "(서약의 중단 기준에 해당하나요?)\n\n정말 끌까요?"):
            return
        set_env_key("TRADER_ENABLED", "0" if enabled else "1")
        self.refresh()

    def toggle_dry(self):
        dry = read_env().get("DRY_RUN", "1") != "0"
        if dry and not messagebox.askyesno(
                "실전 전환", "⚡ 다음 실행부터 실제 주문이 나갑니다.\n"
                "검증(주문테스트+스케줄 확인)을 마쳤나요?\n\n전환할까요?"):
            return
        set_env_key("DRY_RUN", "1" if not dry else "0")
        self.refresh()

    def open_log(self):
        if os.path.exists(LOG_PATH):
            subprocess.Popen(["notepad.exe", LOG_PATH])
        else:
            messagebox.showinfo("로그", "아직 실행 기록이 없습니다.")


if __name__ == "__main__":
    Panel().mainloop()
