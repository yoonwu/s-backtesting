#!/usr/bin/env python3
"""텔레그램 알림 연결 (실행: python telegram_setup.py <봇토큰>)

1) 토큰을 .env의 TELEGRAM_BOT_TOKEN에 저장 (인자로 준 경우)
2) 내 봇에게 보낸 메시지에서 chat id를 찾아 TELEGRAM_CHAT_ID에 저장
3) 테스트 메시지 발송 → 폰에 오면 연결 완료
토큰은 이 PC의 .env에만 저장된다 (저장소에 올라가지 않음 — .gitignore).
"""
import os
import re
import sys

import requests

HERE = os.path.dirname(os.path.abspath(__file__))
ENV = os.path.join(HERE, ".env")
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


def read_env() -> str:
    return open(ENV, encoding="utf-8").read() if os.path.exists(ENV) else ""


def set_key(text: str, key: str, val: str) -> str:
    if re.search(rf"(?m)^{key}=", text):
        return re.sub(rf"(?m)^{key}=.*$", f"{key}={val}", text)
    return text.rstrip("\n") + f"\n{key}={val}\n"


def get_key(text: str, key: str):
    m = re.search(rf"(?m)^{key}=(.*)$", text)
    return m.group(1).strip().strip('"').strip("'") if m else None


text = read_env()
token = sys.argv[1].strip() if len(sys.argv) > 1 else get_key(text, "TELEGRAM_BOT_TOKEN")
if not token or ":" not in token:
    sys.exit("봇 토큰이 없습니다 → python telegram_setup.py 123456:ABC... 형식으로 실행")

api = f"https://api.telegram.org/bot{token}"
me = requests.get(f"{api}/getMe", timeout=15).json()
if not me.get("ok"):
    sys.exit(f"토큰이 올바르지 않습니다: {me.get('description')}")
text = set_key(text, "TELEGRAM_BOT_TOKEN", token)
open(ENV, "w", encoding="utf-8").write(text)
print(f"✅ 봇 확인: @{me['result']['username']} (토큰 저장 완료)")

upd = requests.get(f"{api}/getUpdates", timeout=15).json().get("result", [])
chats = [u.get("message", {}).get("chat", {}).get("id") for u in upd if u.get("message")]
chats = [c for c in chats if c]
if not chats:
    sys.exit(f"아직 메시지가 없습니다 → 텔레그램에서 @{me['result']['username']} 에게 아무 말이나 "
             f"보낸 뒤 이 명령을 다시 실행하세요")
chat_id = str(chats[-1])
text = set_key(text, "TELEGRAM_CHAT_ID", chat_id)
open(ENV, "w", encoding="utf-8").write(text)
print(f"✅ chat id 저장: {chat_id}")

r = requests.post(f"{api}/sendMessage", timeout=15, data={
    "chat_id": chat_id,
    "text": "✅ 볼스위칭 봇 알림 연결 완료\n매매·주문 실패·설정 경고가 이제 여기로 옵니다."}).json()
print("✅ 테스트 메시지 발송 — 폰을 확인하세요" if r.get("ok") else f"발송 실패: {r}")
