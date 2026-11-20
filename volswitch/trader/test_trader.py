"""봇 주문 경로 시나리오 테스트 — 가짜 토스 계좌로 run_trader.main()의 모든 분기를 돌린다.

실행: python -m unittest discover -s volswitch/trader -p "test_*.py" -v
네트워크·실계좌 접근 없음 (TossClient와 신호 계산을 가짜로 바꿔 끼움).
"""
import json
import os
import shutil
import sys
import tempfile
import unittest
from datetime import datetime as RealDT, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))
os.environ.update(TOSS_CLIENT_ID="test", TOSS_CLIENT_SECRET="test", TOSS_ACCOUNT_SEQ="1")
for k in ("TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"):
    os.environ.pop(k, None)

import run_trader as rt  # noqa: E402

INSUFFICIENT = ('POST /api/v1/orders → 422: {"error":{"code":"insufficient-buying-power"}}')


class FakeToss:
    def __init__(self, qty=0.0, cash=20000.0, price=50.0, avg=None,
                 reject_first=0, reject_msg=INSUFFICIENT, holdings_raw=None):
        self.qty, self.cash, self.px, self.avg = qty, cash, price, avg or price
        self.reject_left, self.reject_msg = reject_first, reject_msg
        self.holdings_raw = holdings_raw
        self.orders, self.calls = [], 0

    def holdings(self):
        self.calls += 1
        if self.holdings_raw is not None:
            return self.holdings_raw
        items = [] if self.qty == 0 else [{
            "symbol": "TQQQ", "quantity": str(self.qty),
            "lastPrice": str(self.px), "averagePurchasePrice": str(self.avg)}]
        return {"result": {"items": items}}

    def usd_cash(self):
        return self.cash

    def krw_cash(self):
        return 0

    def price(self, _sym):
        return {"result": [{"price": self.px}]}

    def order(self, sym, side, order_type, qty, price, tif):
        if self.reject_left > 0:
            self.reject_left -= 1
            raise RuntimeError(self.reject_msg)
        # 토스처럼 증거금(지정가×수량)이 매수가능금액을 넘으면 거절
        if side == "BUY" and qty * price > self.cash:
            raise RuntimeError(INSUFFICIENT)
        self.orders.append(dict(side=side, qty=qty, price=price, tif=tif, type=order_type))
        return {"result": {"orderId": f"T{len(self.orders)}"}}


def weekday_utc(iso):
    class FakeDT(RealDT):
        @classmethod
        def now(cls, tz=None):
            d = RealDT.fromisoformat(iso).replace(tzinfo=timezone.utc)
            return d if tz else d.replace(tzinfo=None)
    return FakeDT


class TraderScenarios(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self._saved = {k: getattr(rt, k) for k in
                       ("HERE", "STATE_FILE", "TossClient", "compute_state",
                        "DRY", "EX_STOP", "EX_FRAC", "datetime")}
        rt.HERE = self.tmp
        rt.STATE_FILE = os.path.join(self.tmp, "trader_state.json")
        rt.DRY, rt.EX_STOP, rt.EX_FRAC = False, 0.30, 1.0
        rt.datetime = weekday_utc("2026-11-23T19:40")  # 미국 월요일 장중 (KST 화 04:40)
        os.environ["TRADER_ENABLED"] = "1"
        self.sig("CASH", False)

    def tearDown(self):
        for k, v in self._saved.items():
            setattr(rt, k, v)
        shutil.rmtree(self.tmp, ignore_errors=True)

    # --- helpers ---
    def sig(self, regular, exception):
        rt.compute_state = lambda prev: dict(
            asof="2026-11-23", signal_aggressive=regular, exception_buy=exception)

    def run_bot(self, state=None, **acct):
        with open(rt.STATE_FILE, "w") as f:
            json.dump(state or {"last_run": ""}, f)
        fake = FakeToss(**acct)
        rt.TossClient = lambda: fake
        err = None
        try:
            rt.main()
        except Exception as e:  # noqa: BLE001
            err = e
        with open(rt.STATE_FILE) as f:
            st = json.load(f)
        return fake, st, err

    def journal(self):
        p = os.path.join(self.tmp, "journal.jsonl")
        return [json.loads(l) for l in open(p, encoding="utf-8")] if os.path.exists(p) else []

    def assertMarginOK(self, fake, cash):
        o = fake.orders[-1]
        self.assertLessEqual(o["qty"] * o["price"], cash * 0.995 + 1e-6)

    # --- 정규 신호 ---
    def test_regular_entry_buys_all_cash(self):
        self.sig("HOLD", False)
        fake, st, err = self.run_bot(qty=0, cash=20000, price=50)
        self.assertIsNone(err)
        self.assertEqual([o["side"] for o in fake.orders], ["BUY"])
        self.assertEqual(fake.orders[0]["tif"], "CLS")
        self.assertMarginOK(fake, 20000)
        self.assertGreater(fake.orders[0]["qty"] * 50, 20000 * 0.94)  # 현금 94%+ 투입

    def test_regular_exit_sells_all(self):
        fake, st, err = self.run_bot(qty=300, cash=10, price=50)
        self.assertIsNone(err)
        self.assertEqual(fake.orders, [dict(side="SELL", qty=300.0, price=45.0, tif="CLS", type="LIMIT")])
        self.assertEqual(st["position"], "CASH")

    def test_regular_topup_only_above_minimum(self):
        self.sig("HOLD", False)
        fake, _, _ = self.run_bot(qty=300, cash=5000, price=50)
        self.assertEqual([o["side"] for o in fake.orders], ["BUY"])
        fake, _, _ = self.run_bot(qty=300, cash=500, price=50)
        self.assertEqual(fake.orders, [])

    def test_hold_signal_clears_exception_flags(self):
        self.sig("HOLD", False)
        _, st, _ = self.run_bot({"last_run": "", "exception_latch": True,
                                 "exception_blocked": True, "exception_entry": 40},
                                qty=300, cash=10, price=50)
        self.assertFalse(st["exception_latch"])
        self.assertFalse(st["exception_blocked"])

    # --- 예외매수 ---
    def test_exception_buy_full_cash_within_margin(self):
        self.sig("CASH", True)
        fake, st, err = self.run_bot(qty=0, cash=27000, price=42.32)
        self.assertIsNone(err)
        self.assertEqual([o["side"] for o in fake.orders], ["BUY"])
        self.assertMarginOK(fake, 27000)  # 2026-11-20 수수료 여유 없는 100% 주문 거절 회귀 방지
        self.assertTrue(st["exception_latch"])
        self.assertAlmostEqual(st["exception_entry"], 42.32)

    def test_exception_blocked_after_stop(self):
        self.sig("CASH", True)
        fake, _, _ = self.run_bot({"last_run": "", "exception_blocked": True}, qty=0, cash=20000)
        self.assertEqual(fake.orders, [])

    def test_latch_position_is_not_sold_on_cash_signal(self):
        fake, st, _ = self.run_bot({"last_run": "", "exception_latch": True, "exception_entry": 42.32},
                                   qty=400, cash=300, price=40)
        self.assertEqual(fake.orders, [])
        self.assertTrue(st["exception_latch"])

    def test_latch_buys_leftover_cash(self):
        fake, st, _ = self.run_bot({"last_run": "", "exception_latch": True, "exception_entry": 42.32},
                                   qty=400, cash=10852.53, price=42)
        self.assertEqual([o["side"] for o in fake.orders], ["BUY"])
        self.assertMarginOK(fake, 10852.53)
        self.assertTrue(st["exception_latch"])

    def test_latch_leftover_buy_works_even_with_stop_off(self):
        rt.EX_STOP = 0.0
        fake, _, _ = self.run_bot({"last_run": "", "exception_latch": True, "exception_entry": 42.32},
                                  qty=400, cash=10852.53, price=42)
        self.assertEqual([o["side"] for o in fake.orders], ["BUY"])

    def test_latch_stop_loss_sells_and_blocks(self):
        fake, st, _ = self.run_bot({"last_run": "", "exception_latch": True, "exception_entry": 42.32},
                                   qty=400, cash=10852.53, price=29.5)
        self.assertEqual([o["side"] for o in fake.orders], ["SELL"])
        self.assertFalse(st["exception_latch"])
        self.assertTrue(st["exception_blocked"])

    def test_latch_just_above_stop_holds(self):
        fake, _, _ = self.run_bot({"last_run": "", "exception_latch": True, "exception_entry": 42.32},
                                  qty=400, cash=100, price=29.7)
        self.assertEqual(fake.orders, [])

    # --- 거절 재시도 ---
    def test_insufficient_buying_power_retries_with_fewer_shares(self):
        self.sig("CASH", True)
        fake, st, err = self.run_bot(qty=0, cash=27000, price=42.32, reject_first=2)
        self.assertIsNone(err)
        self.assertEqual(len(fake.orders), 1)
        trade = [j for j in self.journal() if j["type"] == "trade"][-1]
        self.assertEqual(trade["qty"], fake.orders[0]["qty"])
        self.assertIn("재주문", trade["desc"])
        self.assertTrue(st["exception_latch"])

    def test_other_errors_not_retried_and_state_kept(self):
        self.sig("CASH", True)
        fake, st, err = self.run_bot(qty=0, cash=27000, price=42.32, reject_first=1,
                                     reject_msg="POST /api/v1/orders → 500: timeout")
        self.assertIsNotNone(err)
        self.assertEqual(fake.orders, [])
        self.assertEqual(st["last_run"], "")          # 다음 실행에 다시 시도
        self.assertFalse(st.get("exception_latch", False))
        self.assertEqual(self.journal()[-1]["type"], "error")

    # --- 안전장치 ---
    def test_weekend_does_nothing(self):
        rt.datetime = weekday_utc("2026-11-21T19:40")  # 미국 토요일 (KST 일 04:40)
        self.sig("HOLD", True)
        fake, _, _ = self.run_bot(qty=0, cash=20000)
        self.assertEqual(fake.calls, 0)

    def test_duplicate_run_same_day_blocked(self):
        from datetime import date
        self.sig("HOLD", False)
        fake, _, _ = self.run_bot({"last_run": str(date.today())}, qty=0, cash=20000)
        self.assertEqual(fake.orders, [])

    def test_kill_switch(self):
        os.environ["TRADER_ENABLED"] = "0"
        self.sig("HOLD", False)
        fake, _, _ = self.run_bot(qty=0, cash=20000)
        self.assertEqual(fake.calls, 0)

    def test_dry_run_places_no_orders(self):
        rt.DRY = True
        self.sig("HOLD", False)
        fake, _, _ = self.run_bot(qty=0, cash=20000)
        self.assertEqual(fake.orders, [])

    def test_broken_holdings_response_aborts(self):
        fake, _, err = self.run_bot(holdings_raw={"weird": True})
        self.assertIsNotNone(err)
        self.assertEqual(fake.orders, [])

    # --- 설정 점검 ---
    def test_config_warns_on_stop_off_and_missing_telegram(self):
        os.environ["EXCEPTION_STOP"] = "0"
        try:
            w = " ".join(rt.config_warnings())
            self.assertIn("EXCEPTION_STOP=0", w)
            self.assertIn("텔레그램", w)
        finally:
            os.environ.pop("EXCEPTION_STOP")

    def test_config_clean_when_matching_spec(self):
        os.environ.update(EXCEPTION_STOP="0.30", EXCEPTION_FRACTION="1.0",
                          TELEGRAM_BOT_TOKEN="x", TELEGRAM_CHAT_ID="y")
        try:
            self.assertEqual(rt.config_warnings(), [])
        finally:
            for k in ("EXCEPTION_STOP", "EXCEPTION_FRACTION", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"):
                os.environ.pop(k)


if __name__ == "__main__":
    unittest.main(verbosity=2)
