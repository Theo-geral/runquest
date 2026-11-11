"""RunQuest — serveur local. Lance `python app.py` puis ouvre http://localhost:5000
(ou http://<IP-de-ton-PC>:5000 depuis ton téléphone sur le même Wi-Fi)."""
from __future__ import annotations

import json
import random
import threading
from datetime import datetime, timedelta
from pathlib import Path

from flask import Flask, jsonify, redirect, render_template, request, url_for

import game
import importers
import strava

DATA = Path(__file__).parent / "data"
DATA.mkdir(exist_ok=True)
SAVE = DATA / "save.json"
_lock = threading.Lock()

app = Flask(__name__)


def load() -> dict:
    if SAVE.exists():
        state = json.loads(SAVE.read_text(encoding="utf-8"))
        return {**game.new_state(), **state}
    return game.new_state()


def save(state: dict) -> None:
    tmp = SAVE.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(SAVE)


def view(state: dict, **extra) -> dict:
    v = game.full_view(state)
    v["strava"] = {"configured": strava.configured(), "connected": strava.connected()}
    v.update(extra)
    return v


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/api/state")
def api_state():
    return jsonify(view(load()))


@app.post("/api/runs")
def api_add_run():
    d = request.get_json(force=True)
    try:
        date = datetime.fromisoformat(d.get("date") or datetime.now().isoformat())
        dist = float(d["distance_km"])
        dur = float(d["duration_min"]) * 60
        elev = float(d.get("elevation_m") or 0)
    except (KeyError, ValueError):
        return jsonify(error="Champs invalides"), 400
    with _lock:
        s = load()
        added = game.add_runs(s, [game.make_run(date, dist, dur, elev, name=d.get("name") or "Course")],
                              ignore_start=True)
        save(s)
    return jsonify(view(s, added=len(added)))


@app.delete("/api/runs/<run_id>")
def api_delete_run(run_id):
    with _lock:
        s = load()
        s["runs"] = [r for r in s["runs"] if r["id"] != run_id]
        save(s)
    return jsonify(view(s))


@app.post("/api/import")
def api_import():
    files = request.files.getlist("files")
    runs, errors = [], []
    for f in files:
        try:
            runs += importers.parse_file(f.filename, f.read())
        except Exception as e:  # noqa: BLE001 — on remonte l'erreur à l'utilisateur
            errors.append(f"{f.filename} : {e}")
    with _lock:
        s = load()
        added = game.add_runs(s, runs)
        save(s)
    return jsonify(view(s, added=len(added), errors=errors))


@app.post("/api/demo")
def api_demo():
    """Ajoute deux semaines de courses fictives pour tester le jeu."""
    rng = random.Random()
    now = datetime.now().replace(second=0, microsecond=0)
    runs = []
    for i in range(6):
        day = now - timedelta(days=13 - i * 2 - rng.randint(0, 1))
        kind = i % 3
        if kind == 0:  # footing
            dist, pace, elev, hour = rng.uniform(7, 9), rng.uniform(320, 345), rng.uniform(20, 60), 18
        elif kind == 1:  # séance rapide
            dist, pace, elev, hour = rng.uniform(5, 7), rng.uniform(270, 290), rng.uniform(10, 40), 7
        else:  # sortie longue vallonnée
            dist, pace, elev, hour = rng.uniform(13, 16), rng.uniform(335, 360), rng.uniform(220, 320), 21
        runs.append(game.make_run(day.replace(hour=hour, minute=rng.randint(0, 59)), dist, dist * pace, elev,
                                  source="démo", name=["Footing", "Fractionné", "Sortie longue"][kind]))
    with _lock:
        s = load()
        added = game.add_runs(s, runs, ignore_start=True)
        save(s)
    return jsonify(view(s, added=len(added)))


@app.post("/api/reset")
def api_reset():
    with _lock:
        s = game.new_state()
        save(s)
    return jsonify(view(s))


@app.post("/api/combat/start")
def api_combat_start():
    s = load()
    try:
        return jsonify(game.combat_setup(s))
    except ValueError as e:
        return jsonify(error=str(e)), 400


@app.post("/api/combat/end")
def api_combat_end():
    d = request.get_json(force=True)
    with _lock:
        s = load()
        try:
            res = game.combat_end(s, bool(d.get("won")), d.get("potions_used", 0))
        except ValueError as e:
            return jsonify(error=str(e)), 400
        save(s)
    return jsonify(view(s, result=res))


# ------------------------------------------------------------------ Strava
def _redirect_uri() -> str:
    return url_for("strava_callback", _external=True)


@app.get("/strava/connect")
def strava_connect():
    if not strava.configured():
        return "Strava n'est pas configuré : voir le README (data/config.json).", 400
    return redirect(strava.authorize_url(_redirect_uri()))


@app.get("/strava/callback")
def strava_callback():
    code = request.args.get("code")
    if not code:
        return redirect("/?strava=refuse")
    strava.exchange_code(code)
    return redirect("/?strava=ok")


@app.post("/api/strava/sync")
def api_strava_sync():
    if not strava.connected():
        return jsonify(error="Strava n'est pas connecté."), 400
    s = load()
    last = max((datetime.fromisoformat(r["date"]) for r in s["runs"] if r["source"] == "strava"), default=None)
    after = (last - timedelta(days=1)) if last else datetime.now() - timedelta(days=90)
    try:
        runs = strava.fetch_runs(after)
    except Exception as e:  # noqa: BLE001
        return jsonify(error=f"Erreur Strava : {e}"), 502
    with _lock:
        s = load()
        added = game.add_runs(s, runs)
        save(s)
    return jsonify(view(s, added=len(added)))


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
