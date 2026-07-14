#!/usr/bin/env python3
"""볼스위칭 조종석 — 상태 확인·정지·재개를 버튼으로 하는 관리 패널.

실행: panel.bat 더블클릭 (또는 python panel.py)
이 프로그램은 주문을 내지 않는다. 조회와 .env 스위치 변경만 한다.
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
    lines = [ln for ln in open(LOG_PATH, encoding="utf-8", errors="ignore")
             if ln.strip()]
    for ln in reversed(lines):
        if "볼스위칭 트레이더" in ln or "----- 실행" in ln:
            return ln.strip()[:110]
    return lines[-1].strip()[:110] if lines else "실행 기록 없음"


class Panel(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("볼스위칭 조종석")
        self.geometry("560x420")
        self.configure(bg="#1e1e1e")

        self.sig_label = self._label("신호 확인 중...", 26, "#888")
        self.sig_label.pack(pady=(18, 6), fill="x", padx=20)

        self.info = self._label("", 12, "#ddd")
        self.info.pack(pady=4)

        self.sw_label = self._label("", 13, "#ddd")
        self.sw_label.pack(pady=(12, 2))

        btns = tk.Frame(self, bg="#1e1e1e")
        btns.pack(pady=10)
        self.toggle_btn = self._button(btns, "", self.toggle_enabled, 0)
        self.mode_btn = self._button(btns, "", self.toggle_dry, 1)
        self._button(btns, "상태 새로고침", self.refresh, 2)
        self._button(btns, "로그 보기", self.open_log, 3)

        self.help = self._label(
            "멈추고 싶으면 [봇 끄기] 하나면 됩니다. 다시 하려면 [봇 켜기].\n"
            "실전 전환은 2주 모의 검증 후에만. 매일 볼 필요 없고,\n"
            "가끔 열어서 '마지막 실행'이 오늘/어제 날짜인지만 확인하세요.",
            10, "#999")
        self.help.pack(side="bottom", pady=12)

        self.refresh()

    def _label(self, text, size, fg):
        return tk.Label(self, text=text, font=("Malgun Gothic", size, "bold"),
                        fg=fg, bg="#1e1e1e", justify="center")

    def _button(self, parent, text, cmd, col):
        b = tk.Button(parent, text=text, command=cmd, width=14, height=2,
                      font=("Malgun Gothic", 10, "bold"),
                      bg="#333", fg="white", activebackground="#555")
        b.grid(row=0, column=col, padx=6)
        return b

    # ---- 상태 표시 ----
    def refresh(self):
        env = read_env()
        enabled = env.get("TRADER_ENABLED", "0") == "1"
        dry = env.get("DRY_RUN", "1") != "0"
        self.toggle_btn.config(text="봇 끄기" if enabled else "봇 켜기",
                               bg="#7a2727" if enabled else "#2e6b2e")
        self.mode_btn.config(text=f"모드: {'모의' if dry else '⚡실전'}",
                             bg="#333" if dry else "#8a6d00")
        self.sw_label.config(
            text=f"봇 스위치: {'● 켜짐' if enabled else '○ 꺼짐'}    "
                 f"모드: {'모의(주문 안 나감)' if dry else '⚡ 실전(실제 주문)'}\n"
                 f"마지막 실행: {last_run_line()}",
            fg="#7fdc7f" if enabled else "#dc7f7f")
        self.sig_label.config(text="신호 확인 중...", fg="#888", bg="#1e1e1e")
        threading.Thread(target=self._fetch, daemon=True).start()

    def _fetch(self):
        try:
            os.environ.update(read_env())
            from daily_signal import compute_state
            from toss_client import TossClient
            sig = compute_state(None)
            hold = sig["signal_aggressive"] == "HOLD"
            try:
                c = TossClient()
                raw = c.holdings()
                items = (raw.get("result", {}) or {}).get("items", [])
                qty = next((float(i.get("quantity") or 0) for i in items
                            if i.get("symbol") == os.environ.get("SYMBOL", "TQQQ")), 0.0)
                cash = c.usd_cash()
                acct = f"보유 TQQQ {qty:.4g}주  ·  현금 ${cash:,.2f}"
                try:
                    krw = c.krw_cash()
                    if krw >= 100000:
                        acct += f"  ·  ⚠원화 ₩{krw:,.0f} (앱에서 환전 필요!)"
                except Exception:
                    pass
            except Exception as e:
                acct = f"계좌 조회 실패: {str(e)[:60]}"
            txt = ("신호: HOLD — TQQQ 보유 구간" if hold
                   else "신호: CASH — 현금 대기 구간")
            if sig.get("exception_buy"):
                txt += "   ⚠ 예외매수 트리거 발동!"
            self.after(0, lambda: self.sig_label.config(
                text=txt, fg="white", bg="#2e6b2e" if hold else "#7a2727"))
            self.after(0, lambda: self.info.config(
                text=f"QQQ {sig['qqq']}  ·  MA150 {sig['ma150']}  ·  "
                     f"변동성 {sig['vol20']}% (진입<32 청산>36)\n{acct}\n"
                     f"기준일: {sig['asof']}"))
        except Exception as e:
            self.after(0, lambda: self.sig_label.config(
                text=f"신호 계산 실패: {str(e)[:70]}", fg="#dc7f7f", bg="#1e1e1e"))

    # ---- 버튼 동작 ----
    def toggle_enabled(self):
        env = read_env()
        enabled = env.get("TRADER_ENABLED", "0") == "1"
        if enabled:
            if not messagebox.askyesno("봇 끄기",
                    "봇을 끄면 매도/매수 신호가 와도 아무것도 하지 않습니다.\n"
                    "(서약의 중단 기준에 해당하는 상황인가요?)\n\n정말 끌까요?"):
                return
            set_env_key("TRADER_ENABLED", "0")
        else:
            set_env_key("TRADER_ENABLED", "1")
        self.refresh()

    def toggle_dry(self):
        env = read_env()
        dry = env.get("DRY_RUN", "1") != "0"
        if dry:
            if not messagebox.askyesno("실전 전환",
                    "⚡ 실전 모드로 바꾸면 다음 실행부터 실제 주문이 나갑니다.\n"
                    "2주 모의 검증을 마쳤나요?\n\n전환할까요?"):
                return
            set_env_key("DRY_RUN", "0")
        else:
            set_env_key("DRY_RUN", "1")
        self.refresh()

    def open_log(self):
        if os.path.exists(LOG_PATH):
            subprocess.Popen(["notepad.exe", LOG_PATH])
        else:
            messagebox.showinfo("로그", "아직 실행 기록이 없습니다.")


if __name__ == "__main__":
    Panel().mainloop()
