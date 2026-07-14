"""토스증권 Open API 클라이언트 (볼스위칭 트레이더용 최소 구현).

인증: OAuth2 client_credentials → Bearer 토큰.
스펙 근거: developers.tossinvest.com 공개 문서 + 공식 openapi 스펙 미러.
⚠️ TOSS_API_BASE는 키 발급 후 개발자센터 문서의 실제 host로 반드시 확인할 것.
"""
import json
import os
import time

import requests

_TOKEN_CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "token.json")


class TossClient:
    def __init__(self):
        self.base = os.environ.get("TOSS_API_BASE", "https://openapi.tossinvest.com")
        self.cid = os.environ["TOSS_CLIENT_ID"]
        self.secret = os.environ["TOSS_CLIENT_SECRET"]
        self.account = os.environ["TOSS_ACCOUNT_SEQ"]
        self._tok, self._exp = None, 0.0

    # --- auth ---
    # 토스는 새 토큰 발급 시 기존 토큰이 무효화되는 것으로 보임 → 프로세스들
    # (봇/조종석/테스트)이 token.json 파일 하나를 공유해 재발급을 최소화한다.
    def _token(self, force: bool = False) -> str:
        now = time.time()
        if not force:
            if self._tok and now < self._exp - 60:
                return self._tok
            try:
                with open(_TOKEN_CACHE) as f:
                    c = json.load(f)
                if now < float(c["exp"]) - 60:
                    self._tok, self._exp = c["token"], float(c["exp"])
                    return self._tok
            except Exception:
                pass
        r = requests.post(
            f"{self.base}/oauth2/token",
            data={"grant_type": "client_credentials",
                  "client_id": self.cid, "client_secret": self.secret},
            timeout=15,
        )
        r.raise_for_status()
        j = r.json()
        self._tok = j["access_token"]
        self._exp = now + float(j.get("expires_in", 600))
        try:
            with open(_TOKEN_CACHE, "w") as f:
                json.dump({"token": self._tok, "exp": self._exp}, f)
        except Exception:
            pass
        return self._tok

    def _req(self, method: str, path: str, **kw):
        for attempt in (1, 2):
            headers = {
                "Authorization": f"Bearer {self._token(force=(attempt == 2))}",
                "X-Tossinvest-Account": self.account,
            }
            r = requests.request(method, self.base + path, headers=headers,
                                 timeout=15, **kw)
            if r.status_code == 401 and attempt == 1:
                continue  # 토큰 무효화됨 → 강제 재발급 후 1회 재시도
            if r.status_code >= 400:
                raise RuntimeError(f"{method} {path} → {r.status_code}: {r.text[:300]}")
            return r.json() if r.text else {}

    # --- endpoints (공식 문서 확인: 2026-07) ---
    def price(self, symbol: str) -> dict:
        return self._req("GET", f"/api/v1/prices?symbols={symbol}")

    def holdings(self) -> dict:
        return self._req("GET", "/api/v1/holdings")

    def usd_cash(self) -> float:
        """매수 가능 USD 현금.

        실응답: {"result": {"currency": "USD", "cashBuyingPower": "3.64"}}
        """
        raw = self._req("GET", "/api/v1/buying-power?currency=USD")
        res = raw.get("result", raw) or {}
        v = res.get("cashBuyingPower")
        if v is None:
            raise RuntimeError(f"buying-power 응답에서 cashBuyingPower 없음: {str(raw)[:300]}")
        return float(v)

    def krw_cash(self) -> float:
        """원화 매수가능금액 (환전 대기 자금 감지용 — API에 환전 기능은 없음)."""
        raw = self._req("GET", "/api/v1/buying-power?currency=KRW")
        res = raw.get("result", raw) or {}
        return float(res.get("cashBuyingPower") or 0)

    def order(self, symbol: str, side: str, *, order_type: str = "MARKET",
              qty=None, amount=None, price=None, tif: str = "CLS") -> dict:
        """side: BUY/SELL. 기본은 MOC(MARKET+CLS).

        qty: 수량 기반 주문. amount: 금액 기반(US, 정규장 한정, 소수점 가능).
        """
        body = {"symbol": symbol, "side": side,
                "orderType": order_type, "timeInForce": tif,
                "confirmHighValueOrder": True}  # 1억원 이상 주문 사전 확인 플래그
        if qty is not None:
            body["quantity"] = qty
        if amount is not None:
            body["orderAmount"] = round(float(amount), 2)
        if price is not None:
            body["price"] = price
        return self._req("POST", "/api/v1/orders", json=body)
