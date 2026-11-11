"""Synchronisation Strava (Coros envoie automatiquement tes courses vers Strava).

Configuration : copie config.example.json en data/config.json et remplis
client_id / client_secret depuis https://www.strava.com/settings/api
(champ « Authorization Callback Domain » : localhost).
"""
from __future__ import annotations

import json
import time
from datetime import datetime
from pathlib import Path
from urllib.parse import urlencode

import requests

from game import make_run

DATA = Path(__file__).parent / "data"
CONFIG = DATA / "config.json"
TOKENS = DATA / "strava_tokens.json"

AUTH_URL = "https://www.strava.com/oauth/authorize"
TOKEN_URL = "https://www.strava.com/oauth/token"
API = "https://www.strava.com/api/v3"
RUN_TYPES = {"Run", "TrailRun", "VirtualRun"}


def config() -> dict:
    if CONFIG.exists():
        return json.loads(CONFIG.read_text())
    return {}


def configured() -> bool:
    c = config()
    return bool(c.get("strava_client_id") and c.get("strava_client_secret"))


def connected() -> bool:
    return TOKENS.exists()


def authorize_url(redirect_uri: str) -> str:
    return AUTH_URL + "?" + urlencode({
        "client_id": config()["strava_client_id"],
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "approval_prompt": "auto",
        "scope": "activity:read_all",
    })


def _save_tokens(t: dict) -> None:
    TOKENS.write_text(json.dumps({k: t[k] for k in ("access_token", "refresh_token", "expires_at")}))


def exchange_code(code: str) -> None:
    c = config()
    r = requests.post(TOKEN_URL, data={
        "client_id": c["strava_client_id"], "client_secret": c["strava_client_secret"],
        "code": code, "grant_type": "authorization_code",
    }, timeout=20)
    r.raise_for_status()
    _save_tokens(r.json())


def _access_token() -> str:
    t = json.loads(TOKENS.read_text())
    if t["expires_at"] - 60 < time.time():
        c = config()
        r = requests.post(TOKEN_URL, data={
            "client_id": c["strava_client_id"], "client_secret": c["strava_client_secret"],
            "refresh_token": t["refresh_token"], "grant_type": "refresh_token",
        }, timeout=20)
        r.raise_for_status()
        t = r.json()
        _save_tokens(t)
    return t["access_token"]


def fetch_runs(after: datetime | None = None, max_pages: int = 10) -> list[dict]:
    headers = {"Authorization": f"Bearer {_access_token()}"}
    params = {"per_page": 100}
    if after:
        params["after"] = int(after.timestamp())
    runs = []
    for page in range(1, max_pages + 1):
        r = requests.get(f"{API}/athlete/activities", headers=headers,
                         params={**params, "page": page}, timeout=20)
        r.raise_for_status()
        acts = r.json()
        if not acts:
            break
        for a in acts:
            if a.get("sport_type", a.get("type")) not in RUN_TYPES and a.get("type") not in RUN_TYPES:
                continue
            start = datetime.fromisoformat(a["start_date_local"].replace("Z", ""))
            runs.append(make_run(start, a["distance"] / 1000, a["moving_time"],
                                 a.get("total_elevation_gain", 0), source="strava",
                                 name=a.get("name", "Course Strava"), ext_id=f"strava-{a['id']}"))
    return runs
