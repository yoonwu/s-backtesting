"""토스증권 Open API 클라이언트 (볼스위칭 트레이더용 최소 구현).

인증: OAuth2 client_credentials → Bearer 토큰.
스펙 근거: developers.tossinvest.com 공개 문서 + 공식 openapi 스펙 미러.
⚠️ TOSS_API_BASE는 키 발급 후 개발자센터 문서의 실제 host로 반드시 확인할 것.
"""
import os
import time

import requests


class TossClient:
    def __init__(self):
        self.base = os.environ.get("TOSS_API_BASE", "https://openapi.tossinvest.com")
        self.cid = os.environ["TOSS_CLIENT_ID"]
        self.secret = os.environ["TOSS_CLIENT_SECRET"]
        self.account = os.environ["TOSS_ACCOUNT_SEQ"]
        self._tok, self._exp = None, 0.0

    # --- auth ---
    def _token(self) -> str:
        if self._tok and time.time() < self._exp - 60:
            return self._tok
        r = requests.post(
            f"{self.base}/oauth2/token",
            data={"grant_type": "client_credentials",
                  "client_id": self.cid, "client_secret": self.secret},
            timeout=15,
        )
        r.raise_for_status()
        j = r.json()
        self._tok = j["access_token"]
        self._exp = time.time() + float(j.get("expires_in", 600))
        return self._tok

    def _req(self, method: str, path: str, **kw):
        headers = {
            "Authorization": f"Bearer {self._token()}",
            "X-Tossinvest-Account": self.account,
        }
        r = requests.request(method, self.base + path, headers=headers,
                             timeout=15, **kw)
        if r.status_code >= 400:
            raise RuntimeError(f"{method} {path} → {r.status_code}: {r.text[:300]}")
        return r.json() if r.text else {}

    # --- endpoints ---
    def price(self, symbol: str) -> dict:
        return self._req("GET", f"/api/v1/stocks/{symbol}/price")

    def holdings(self) -> dict:
        return self._req("GET", "/api/v1/holdings")

    def usd_cash(self) -> float:
        """주문가능 USD 현금. TODO: probe_cash.ps1로 실제 endpoint 확인 후 확정."""
        raise RuntimeError("현금 조회 endpoint 미확정 — probe_cash.ps1을 실행해 결과를 공유해 주세요")

    def order(self, symbol: str, side: str, *, order_type: str = "MARKET",
              qty=None, amount=None, price=None, tif: str = "CLS") -> dict:
        """side: BUY/SELL. 기본은 MOC(MARKET+CLS).

        qty: 수량 기반 주문. amount: 금액 기반(US MARKET 전용, 소수점 매수).
        """
        body = {"symbol": symbol, "side": side,
                "orderType": order_type, "timeInForce": tif}
        if qty is not None:
            body["quantity"] = qty
        if amount is not None:
            body["orderAmount"] = round(float(amount), 2)
        if price is not None:
            body["price"] = price
        return self._req("POST", "/api/v1/orders", json=body)
