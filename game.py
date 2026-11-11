"""Logique de jeu de RunQuest : transforme des courses en stats, butin et combats.

Tout est calculé à partir de la liste des courses + d'un petit état de progression,
ce qui permet de modifier les formules sans casser la sauvegarde.
"""
from __future__ import annotations

import hashlib
import math
import random
import statistics
from datetime import datetime, timedelta

# --------------------------------------------------------------------------
# Monde : zones, km à parcourir, boss
# --------------------------------------------------------------------------
ZONES = [
    {
        "id": "prairie", "name": "Prairie des Débuts", "km": 5, "tile": "grass",
        "boss": {"name": "Gelée Verte", "sprite": "slime", "hp": 500, "atk": 4, "speed": 1.6},
        "reward": {"name": "Bâton noueux", "slot": "arme", "force": 2},
        "intro": "Une gelée géante bloque le chemin vers la forêt.",
    },
    {
        "id": "foret", "name": "Forêt Murmurante", "km": 15, "tile": "forest",
        "boss": {"name": "Loup Cendré", "sprite": "wolf", "hp": 1400, "atk": 8, "speed": 1.2},
        "reward": {"name": "Tunique de cuir", "slot": "armure", "armure": 3, "pv": 30},
        "intro": "Des hurlements résonnent entre les arbres…",
    },
    {
        "id": "marais", "name": "Marais Brumeux", "km": 25, "tile": "swamp",
        "boss": {"name": "Crapaud Titan", "sprite": "toad", "hp": 3000, "atk": 13, "speed": 1.4},
        "reward": {"name": "Amulette de brume", "slot": "bijou", "crit": 0.05, "force": 3},
        "intro": "Le sol tremble à chaque coassement.",
    },
    {
        "id": "collines", "name": "Collines de Pierre", "km": 40, "tile": "hills",
        "boss": {"name": "Golem Ancien", "sprite": "golem", "hp": 5500, "atk": 19, "speed": 1.8},
        "reward": {"name": "Épée runique", "slot": "arme", "force": 8},
        "intro": "Un tas de rochers se lève et te regarde.",
    },
    {
        "id": "volcan", "name": "Mont Ardent", "km": 60, "tile": "lava",
        "boss": {"name": "Wyverne de Braise", "sprite": "wyvern", "hp": 8500, "atk": 26, "speed": 1.1},
        "reward": {"name": "Cotte d'écailles", "slot": "armure", "armure": 10, "pv": 80},
        "intro": "L'air brûle. Des ailes immenses masquent le soleil.",
    },
    {
        "id": "citadelle", "name": "Citadelle d'Ombre", "km": 80, "tile": "castle",
        "boss": {"name": "Seigneur Sans-Souffle", "sprite": "lord", "hp": 12000, "atk": 34, "speed": 1.0},
        "reward": {"name": "Couronne du Coureur", "slot": "bijou", "crit": 0.1, "force": 10, "pv": 100},
        "intro": "Celui qui a volé le souffle du royaume t'attend.",
    },
]

COMBAT_DURATION = 30  # secondes
MAX_POTIONS = 5
CARRY_RATIO = 0.5     # km en trop reportés sur la zone suivante (max 50 % de sa distance)
ENRAGE_AT = 20        # le boss frappe deux fois plus fort après 20 s


def new_state() -> dict:
    return {
        "hero_name": "Théo",
        "runs": [],
        "zone_index": 0,
        "carry_km": 0.0,
        "potions_used": 0,
        "bonus_xp": 0,
        "items": [],
        "equipped": {},
        "log": [],
        "fights": 0,
        # Les courses antérieures au début de l'aventure comptent pour le niveau,
        # mais pas pour le chemin (sinon ton historique ferait sauter toutes les zones).
        "start": datetime.now().replace(microsecond=0).isoformat(),
    }


# --------------------------------------------------------------------------
# Outils sur les courses
# --------------------------------------------------------------------------
def pace(run: dict) -> float:
    """Allure en secondes par km."""
    return run["duration_s"] / max(run["distance_km"], 0.01)


def fmt_pace(sec_per_km: float) -> str:
    m, s = divmod(int(round(sec_per_km)), 60)
    return f"{m}:{s:02d}/km"


def run_dt(run: dict) -> datetime:
    return datetime.fromisoformat(run["date"])


def is_night(run: dict) -> bool:
    h = run_dt(run).hour
    return h >= 20 or h < 6


def is_dawn(run: dict) -> bool:
    return 5 <= run_dt(run).hour < 8


def reference(runs: list[dict]) -> dict:
    """Références personnelles : on compare chaque course à TES habitudes."""
    valid = [r for r in runs if r["distance_km"] >= 1]
    if not valid:
        return {"pace": 360.0, "distance": 8.0}
    return {
        "pace": statistics.median(pace(r) for r in valid),
        "distance": statistics.median(r["distance_km"] for r in valid),
    }


def is_fast(run: dict, ref: dict) -> bool:
    return run["distance_km"] >= 2 and pace(run) <= ref["pace"] * 0.97


def is_long(run: dict, ref: dict) -> bool:
    return run["distance_km"] >= max(10.0, ref["distance"] * 1.4)


def is_hilly(run: dict) -> bool:
    return run["distance_km"] > 0 and run["elevation_m"] / run["distance_km"] >= 15


def week_streak(runs: list[dict], today: datetime | None = None) -> int:
    """Nombre de semaines consécutives avec au moins 2 sorties (semaine en cours tolérée)."""
    today = today or datetime.now()
    weeks: dict[tuple, int] = {}
    for r in runs:
        y, w, _ = run_dt(r).isocalendar()
        weeks[(y, w)] = weeks.get((y, w), 0) + 1
    def count(d: datetime) -> int:
        y, w, _ = d.isocalendar()
        return weeks.get((y, w), 0)

    cursor = today
    if count(cursor) < 2:  # la semaine en cours n'est pas finie : on ne la compte pas contre toi
        cursor -= timedelta(days=7)
    streak = 0
    while count(cursor) >= 2:
        streak += 1
        cursor -= timedelta(days=7)
    return streak


# --------------------------------------------------------------------------
# Personnage
# --------------------------------------------------------------------------
def xp_total(state: dict) -> int:
    km = sum(r["distance_km"] for r in state["runs"])
    elev = sum(r["elevation_m"] for r in state["runs"])
    return int(km * 100 + elev * 2 + state["bonus_xp"])


def level_from_xp(xp: int) -> int:
    return int(math.sqrt(xp / 150)) + 1


def xp_for_level(level: int) -> int:
    return int(150 * (level - 1) ** 2)


def equipped_items(state: dict) -> list[dict]:
    return [state["items"][i] for i in state["equipped"].values() if i < len(state["items"])]


def hero_stats(state: dict) -> dict:
    runs = state["runs"]
    ref = reference(runs)
    xp = xp_total(state)
    lvl = level_from_xp(xp)
    fast_km = sum(r["distance_km"] for r in runs if is_fast(r, ref))
    long_km = sum(r["distance_km"] for r in runs if is_long(r, ref))
    elev = sum(r["elevation_m"] for r in runs)
    streak = week_streak(runs)
    items = equipped_items(state)

    stats = {
        "niveau": lvl,
        "xp": xp,
        "xp_niveau": xp_for_level(lvl),
        "xp_suivant": xp_for_level(lvl + 1),
        "pv": round(100 + 12 * (lvl - 1) + 2 * long_km + sum(i.get("pv", 0) for i in items)),
        "force": round(2 + 0.6 * (lvl - 1) + 0.15 * fast_km + sum(i.get("force", 0) for i in items), 1),
        "armure": round(elev / 100 + sum(i.get("armure", 0) for i in items), 1),
        "crit": round(min(0.40, 0.05 + 0.03 * streak + sum(i.get("crit", 0) for i in items)), 2),
        "charge": 4 + streak,
        "serie": streak,
        "km_total": round(sum(r["distance_km"] for r in runs), 1),
        "km_rapides": round(fast_km, 1),
        "km_longs": round(long_km, 1),
        "denivele": round(elev),
        "allure_ref": fmt_pace(ref["pace"]),
        "sorties": len(runs),
    }
    return stats


# --------------------------------------------------------------------------
# Exploration : le chemin vers le prochain boss
# --------------------------------------------------------------------------
def current_zone(state: dict) -> dict | None:
    if state["zone_index"] >= len(ZONES):
        return None
    return ZONES[state["zone_index"]]


def segment_runs(state: dict) -> list[dict]:
    return [r for r in state["runs"] if r.get("segment") == state["zone_index"]]


def segment_progress(state: dict) -> dict:
    zone = current_zone(state)
    km = state["carry_km"] + sum(r["distance_km"] for r in segment_runs(state))
    need = zone["km"] if zone else 0
    return {"km": round(km, 2), "need": need, "ready": zone is not None and km >= need}


def _rng_for(run: dict) -> random.Random:
    seed = hashlib.md5(run["id"].encode()).hexdigest()
    return random.Random(int(seed[:8], 16))


FLAVOR = {
    "potion": ["une fiole rouge cachée sous une racine", "une potion oubliée près d'un feu de camp",
               "un flacon brillant dans les hautes herbes", "un élixir offert par un marchand ambulant"],
    "rage": ["Ton allure rapide attise ta rage de combattant", "Le vent de la vitesse aiguise ta lame",
             "Ton cœur bat fort : tu te sens invincible"],
    "shield": ["La longue route forge ta résistance", "Des heures de marche endurcissent ta peau",
               "Ta patience devient un bouclier"],
    "hill": ["Les côtes renforcent tes jambes comme de la pierre", "Du sommet, tu repères les faiblesses du boss"],
    "night": ["Courir sous les étoiles t'apprend à frapper dans l'ombre"],
    "dawn": ["L'aube te bénit : premiers rayons, premiers coups"],
}


def segment_loot(state: dict) -> dict:
    """Tout ce qui a été accumulé sur le chemin, converti en bonus pour le combat."""
    ref = reference(state["runs"])
    runs = sorted(segment_runs(state), key=run_dt)
    prog = segment_progress(state)

    potions_found = int(prog["km"] // 5)
    rage = 0.0
    shield = 0
    armor_bonus = 0.0
    crit_bonus = 0.0
    events = []
    km_cursor = state["carry_km"]
    for r in runs:
        rng = _rng_for(r)
        km_before = km_cursor
        km_cursor += r["distance_km"]
        tags = []
        for _ in range(int(km_cursor // 5) - int(km_before // 5)):
            if sum(e["type"] == "potion" for e in events) >= MAX_POTIONS:
                break
            events.append({"run": r["id"], "type": "potion", "text": f"Tu trouves {rng.choice(FLAVOR['potion'])}."})
        if is_fast(r, ref):
            rage += 0.08
            tags.append("rapide")
            events.append({"run": r["id"], "type": "rage", "text": f"{rng.choice(FLAVOR['rage'])} (+8 % dégâts)."})
        if is_long(r, ref):
            s = int(r["distance_km"] * 3)
            shield += s
            tags.append("longue")
            events.append({"run": r["id"], "type": "shield", "text": f"{rng.choice(FLAVOR['shield'])} (bouclier +{s})."})
        if is_hilly(r):
            a = round(r["elevation_m"] / 50, 1)
            armor_bonus += a
            tags.append("vallonnée")
            events.append({"run": r["id"], "type": "hill", "text": f"{rng.choice(FLAVOR['hill'])} (armure +{a})."})
        if is_night(r):
            crit_bonus += 0.05
            tags.append("nocturne")
            events.append({"run": r["id"], "type": "night", "text": f"{FLAVOR['night'][0]} (+5 % critique)."})
        elif is_dawn(r):
            crit_bonus += 0.03
            tags.append("aube")
            events.append({"run": r["id"], "type": "dawn", "text": f"{FLAVOR['dawn'][0]} (+3 % critique)."})
        r["_tags"] = tags

    extra_km = max(0.0, prog["km"] - prog["need"])
    prep = min(0.5, 0.02 * extra_km)
    return {
        "potions": max(0, min(MAX_POTIONS, potions_found) - state["potions_used"]),
        "rage": round(min(rage, 0.6), 2),
        "bouclier": shield,
        "armure": round(armor_bonus, 1),
        "crit": round(min(crit_bonus, 0.15), 2),
        "preparation": round(prep, 2),
        "events": events,
        "runs": [{**r, "tags": r.pop("_tags", [])} for r in runs],
    }


# --------------------------------------------------------------------------
# Combat
# --------------------------------------------------------------------------
def combat_setup(state: dict) -> dict:
    zone = current_zone(state)
    if zone is None:
        raise ValueError("Toutes les zones sont terminées.")
    if not segment_progress(state)["ready"]:
        raise ValueError("Il te reste du chemin avant d'atteindre le boss !")
    st = hero_stats(state)
    loot = segment_loot(state)
    dmg_mult = (1 + loot["rage"]) * (1 + loot["preparation"])
    return {
        "zone": {k: zone[k] for k in ("id", "name", "tile", "intro")},
        "boss": zone["boss"],
        "duree": COMBAT_DURATION,
        "enrage": ENRAGE_AT,
        "hero": {
            "pv": st["pv"],
            "degats": round(st["force"] * dmg_mult, 1),
            "crit": round(min(0.6, st["crit"] + loot["crit"]), 2),
            "armure": round(st["armure"] + loot["armure"], 1),
            "reduction": round(1 - 50 / (50 + st["armure"] + loot["armure"]), 2),
            "bouclier": loot["bouclier"],
            "potions": loot["potions"],
            "charge": st["charge"],
            "special": round(st["force"] * dmg_mult * 20),
        },
        "bonus": {k: loot[k] for k in ("rage", "preparation", "bouclier", "armure", "crit", "potions")},
    }


def combat_end(state: dict, won: bool, potions_used: int) -> dict:
    zone = current_zone(state)
    if zone is None:
        raise ValueError("Aucun combat en cours.")
    state["fights"] += 1
    potions_used = max(0, int(potions_used))
    if not won:
        state["potions_used"] += potions_used
        state["log"].append(f"Défaite contre {zone['boss']['name']}. Cours encore pour revenir plus fort !")
        return {"won": False}

    prog = segment_progress(state)
    item = dict(zone["reward"])
    state["items"].append(item)
    idx = len(state["items"]) - 1
    state["equipped"][item["slot"]] = idx  # les récompenses de boss sont toujours meilleures
    xp_gain = 250 * (state["zone_index"] + 1)
    state["bonus_xp"] += xp_gain
    state["carry_km"] = 0.0
    state["potions_used"] = 0
    state["zone_index"] += 1
    nxt_zone = current_zone(state)
    if nxt_zone:
        state["carry_km"] = round(min(max(0.0, prog["km"] - prog["need"]), nxt_zone["km"] * CARRY_RATIO), 2)
    state["log"].append(f"Victoire sur {zone['boss']['name']} ! Tu obtiens {item['name']} et {xp_gain} XP.")
    nxt = current_zone(state)
    return {"won": True, "item": item, "xp": xp_gain, "next": nxt["name"] if nxt else None}


# --------------------------------------------------------------------------
# Ajout de courses
# --------------------------------------------------------------------------
def add_runs(state: dict, new_runs: list[dict], ignore_start: bool = False) -> list[dict]:
    """Ajoute des courses en évitant les doublons. Renvoie celles réellement ajoutées."""
    existing = {(r["date"][:16], round(r["distance_km"], 1)) for r in state["runs"]}
    existing_ids = {r["id"] for r in state["runs"]}
    added = []
    for r in new_runs:
        key = (r["date"][:16], round(r["distance_km"], 1))
        if key in existing or r["id"] in existing_ids or r["distance_km"] <= 0:
            continue
        before_start = r["date"] < state.get("start", "")
        r["segment"] = -1 if (before_start and not ignore_start) else state["zone_index"]
        state["runs"].append(r)
        existing.add(key)
        existing_ids.add(r["id"])
        added.append(r)
    road = [r for r in added if r["segment"] >= 0]
    hist = [r for r in added if r["segment"] < 0]
    if road:
        km = sum(r["distance_km"] for r in road)
        state["log"].append(f"{len(road)} course(s) ajoutée(s) : +{km:.1f} km sur la route.")
    if hist:
        km = sum(r["distance_km"] for r in hist)
        state["log"].append(f"{len(hist)} course(s) d'historique ({km:.0f} km) : elles renforcent ton héros.")
    return added


def make_run(date: datetime, distance_km: float, duration_s: float, elevation_m: float = 0,
             source: str = "manuel", name: str = "", ext_id: str | None = None) -> dict:
    rid = ext_id or hashlib.md5(f"{date.isoformat()}-{distance_km:.3f}".encode()).hexdigest()[:12]
    return {
        "id": str(rid),
        "date": date.replace(microsecond=0).isoformat(),
        "distance_km": round(float(distance_km), 3),
        "duration_s": int(duration_s),
        "elevation_m": round(float(elevation_m)),
        "source": source,
        "name": name or "Course",
    }


def full_view(state: dict) -> dict:
    """Tout ce dont l'interface a besoin, en un seul appel."""
    ref = reference(state["runs"])
    zones = []
    for i, z in enumerate(ZONES):
        zones.append({
            "id": z["id"], "name": z["name"], "km": z["km"], "tile": z["tile"],
            "boss": z["boss"]["name"], "sprite": z["boss"]["sprite"],
            "status": "done" if i < state["zone_index"] else ("current" if i == state["zone_index"] else "locked"),
        })
    runs = sorted(state["runs"], key=run_dt, reverse=True)
    return {
        "hero_name": state["hero_name"],
        "stats": hero_stats(state),
        "zones": zones,
        "zone_index": state["zone_index"],
        "progress": segment_progress(state) if current_zone(state) else None,
        "loot": segment_loot(state) if current_zone(state) else None,
        "items": [{**it, "equipped": state["equipped"].get(it["slot"]) == i} for i, it in enumerate(state["items"])],
        "runs": [{
            **r, "allure": fmt_pace(pace(r)),
            "tags": [t for t, ok in (("rapide", is_fast(r, ref)), ("longue", is_long(r, ref)),
                                      ("vallonnée", is_hilly(r)), ("nocturne", is_night(r)),
                                      ("historique", r.get("segment", 0) < 0)) if ok],
        } for r in runs[:30]],
        "log": state["log"][-12:][::-1],
        "finished": state["zone_index"] >= len(ZONES),
    }
