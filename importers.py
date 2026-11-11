"""Import de courses depuis des fichiers exportés par Coros / Garmin (.fit, .gpx, .tcx)."""
from __future__ import annotations

import io
import math
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

from game import make_run

RUN_SPORTS = {"running", "trail_running", "treadmill_running", "run", "trail", "track"}


def _local(dt: datetime) -> datetime:
    """Convertit en heure locale naïve (pour les bonus nuit/aube)."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone().replace(tzinfo=None)


# ---------------------------------------------------------------- FIT
def parse_fit(data: bytes, filename: str = "") -> list[dict]:
    import fitdecode

    runs = []
    with fitdecode.FitReader(io.BytesIO(data)) as fit:
        for frame in fit:
            if not isinstance(frame, fitdecode.FitDataMessage) or frame.name != "session":
                continue

            def get(field, default=None):
                try:
                    v = frame.get_value(field)
                    return default if v is None else v
                except KeyError:
                    return default

            sport = str(get("sport", "running")).lower()
            if sport not in RUN_SPORTS and "run" not in sport:
                continue
            start = get("start_time")
            dist = get("total_distance", 0) / 1000
            dur = get("total_timer_time") or get("total_elapsed_time", 0)
            asc = get("total_ascent", 0)
            if not start or dist <= 0:
                continue
            runs.append(make_run(_local(start), dist, dur, asc, source="fit", name=filename or "Course Coros"))
    return runs


# ---------------------------------------------------------------- GPX / TCX
def _haversine(a, b) -> float:
    lat1, lon1, lat2, lon2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(h))


def _parse_time(s: str) -> datetime:
    return datetime.fromisoformat(s.strip().replace("Z", "+00:00"))


def _elevation_gain(eles: list[float], threshold: float = 3.0) -> float:
    """Dénivelé positif avec hystérésis pour ignorer le bruit du GPS."""
    gain, ref = 0.0, None
    for e in eles:
        if ref is None:
            ref = e
        elif e - ref >= threshold:
            gain += e - ref
            ref = e
        elif ref - e >= threshold:
            ref = e
    return gain


def parse_gpx(data: bytes, filename: str = "") -> list[dict]:
    root = ET.fromstring(data)
    pts = []
    for el in root.iter():
        if el.tag.endswith("trkpt"):
            lat, lon = float(el.get("lat")), float(el.get("lon"))
            ele = t = None
            for c in el:
                if c.tag.endswith("ele") and c.text:
                    ele = float(c.text)
                elif c.tag.endswith("time") and c.text:
                    t = _parse_time(c.text)
            pts.append((lat, lon, ele, t))
    if len(pts) < 2:
        return []
    dist = sum(_haversine(pts[i], pts[i + 1]) for i in range(len(pts) - 1)) / 1000
    times = [p[3] for p in pts if p[3]]
    if len(times) < 2:
        return []
    dur = (times[-1] - times[0]).total_seconds()
    gain = _elevation_gain([p[2] for p in pts if p[2] is not None])
    return [make_run(_local(times[0]), dist, dur, gain, source="gpx", name=filename or "Course GPX")]


def parse_tcx(data: bytes, filename: str = "") -> list[dict]:
    root = ET.fromstring(data)
    runs = []
    for act in root.iter():
        if not act.tag.endswith("Activity"):
            continue
        if "run" not in (act.get("Sport") or "running").lower():
            continue
        dist = dur = 0.0
        start = None
        eles = []
        for lap in act:
            if not lap.tag.endswith("Lap"):
                continue
            start = start or _parse_time(lap.get("StartTime"))
            for c in lap:
                if c.tag.endswith("DistanceMeters") and c.text:
                    dist += float(c.text)
                elif c.tag.endswith("TotalTimeSeconds") and c.text:
                    dur += float(c.text)
            eles += [float(e.text) for e in lap.iter() if e.tag.endswith("AltitudeMeters") and e.text]
        if start and dist > 0:
            runs.append(make_run(_local(start), dist / 1000, dur, _elevation_gain(eles),
                                 source="tcx", name=filename or "Course TCX"))
    return runs


def parse_file(filename: str, data: bytes) -> list[dict]:
    name = filename.lower()
    label = filename.rsplit(".", 1)[0]
    if name.endswith(".fit"):
        return parse_fit(data, label)
    if name.endswith(".gpx"):
        return parse_gpx(data, label)
    if name.endswith(".tcx"):
        return parse_tcx(data, label)
    raise ValueError(f"Format non reconnu : {filename} (formats acceptés : .fit, .gpx, .tcx)")
