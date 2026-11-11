// Import de courses depuis des fichiers exportés par Coros / Garmin (.fit, .gpx, .tcx).

// ---------------------------------------------------------------- FIT
// Lecteur FIT minimal : on ne garde que les messages « session » (n° 18), qui résument l'activité.
const FIT_EPOCH = 631065600; // 1989-12-31T00:00:00Z en secondes Unix
const SESSION = { start_time: 2, sport: 5, total_elapsed_time: 7, total_timer_time: 8, total_distance: 9, total_ascent: 22 };

function parseFit(buffer, name) {
  const v = new DataView(buffer);
  const headerSize = v.getUint8(0);
  const dataSize = v.getUint32(4, true);
  if (String.fromCharCode(v.getUint8(8), v.getUint8(9), v.getUint8(10), v.getUint8(11)) !== ".FIT") {
    throw new Error("ce n'est pas un fichier FIT valide");
  }
  const end = Math.min(headerSize + dataSize, buffer.byteLength);
  const defs = {};
  const sessions = [];
  let p = headerSize;

  const readField = (off, size, baseType, little) => {
    const t = baseType & 0x1f;
    if (size === 1) { const x = v.getUint8(off); return x === 0xff ? null : x; }
    if (size === 2) { const x = v.getUint16(off, little); return (x === 0xffff && t !== 3) ? null : x; }
    if (size === 4) { const x = v.getUint32(off, little); return x === 0xffffffff ? null : x; }
    return null;
  };

  while (p < end) {
    const h = v.getUint8(p++);
    if (h & 0x80) { // en-tête compressé (timestamp) → message de données
      const def = defs[(h >> 5) & 0x3];
      if (!def) throw new Error("fichier FIT corrompu");
      p += def.size;
      continue;
    }
    const local = h & 0x0f;
    if (h & 0x40) { // définition
      const little = v.getUint8(p + 1) === 0;
      const global = v.getUint16(p + 2, little);
      const n = v.getUint8(p + 4);
      p += 5;
      const fields = [];
      let size = 0;
      for (let i = 0; i < n; i++) {
        const f = { num: v.getUint8(p), size: v.getUint8(p + 1), type: v.getUint8(p + 2), offset: size };
        fields.push(f); size += f.size; p += 3;
      }
      if (h & 0x20) { // champs développeur
        const nd = v.getUint8(p++);
        for (let i = 0; i < nd; i++) { size += v.getUint8(p + 1); p += 3; }
      }
      defs[local] = { global, little, fields, size };
    } else { // données
      const def = defs[local];
      if (!def) throw new Error("fichier FIT corrompu");
      if (def.global === 18) {
        const rec = {};
        for (const f of def.fields) {
          for (const [k, num] of Object.entries(SESSION)) {
            if (f.num === num) rec[k] = readField(p + f.offset, f.size, f.type, def.little);
          }
        }
        sessions.push(rec);
      }
      p += def.size;
    }
  }

  const runs = [];
  for (const s of sessions) {
    if (s.sport != null && s.sport !== 1) continue; // 1 = course à pied
    if (!s.start_time || !s.total_distance) continue;
    const dur = (s.total_timer_time ?? s.total_elapsed_time ?? 0) / 1000;
    runs.push(makeRun(new Date((s.start_time + FIT_EPOCH) * 1000), s.total_distance / 100000, dur,
      s.total_ascent || 0, "fit", name));
  }
  return runs;
}

// ---------------------------------------------------------------- GPX / TCX
function haversine(a, b) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Dénivelé positif avec hystérésis pour ignorer le bruit du GPS.
function elevationGain(eles, threshold = 3) {
  let gain = 0, ref = null;
  for (const e of eles) {
    if (ref === null) ref = e;
    else if (e - ref >= threshold) { gain += e - ref; ref = e; }
    else if (ref - e >= threshold) ref = e;
  }
  return gain;
}

const byTag = (node, tag) => Array.from(node.getElementsByTagNameNS("*", tag));
const text = (node, tag) => { const e = byTag(node, tag)[0]; return e ? e.textContent.trim() : null; };

function parseGpx(str, name) {
  const doc = new DOMParser().parseFromString(str, "application/xml");
  const pts = byTag(doc, "trkpt").map((pt) => ({
    lat: +pt.getAttribute("lat"), lon: +pt.getAttribute("lon"),
    ele: text(pt, "ele") != null ? +text(pt, "ele") : null,
    time: text(pt, "time") ? new Date(text(pt, "time")) : null,
  }));
  if (pts.length < 2) return [];
  let dist = 0;
  for (let i = 1; i < pts.length; i++) dist += haversine(pts[i - 1], pts[i]);
  const times = pts.filter((x) => x.time).map((x) => x.time);
  if (times.length < 2) return [];
  return [makeRun(times[0], dist / 1000, (times[times.length - 1] - times[0]) / 1000,
    elevationGain(pts.filter((x) => x.ele != null).map((x) => x.ele)), "gpx", name)];
}

function parseTcx(str, name) {
  const doc = new DOMParser().parseFromString(str, "application/xml");
  const runs = [];
  for (const act of byTag(doc, "Activity")) {
    if (!(act.getAttribute("Sport") || "Running").toLowerCase().includes("run")) continue;
    let dist = 0, dur = 0, start = null;
    const eles = [];
    for (const lap of byTag(act, "Lap")) {
      start = start || new Date(lap.getAttribute("StartTime"));
      const d = Array.from(lap.children).find((c) => c.localName === "DistanceMeters");
      const t = Array.from(lap.children).find((c) => c.localName === "TotalTimeSeconds");
      dist += d ? +d.textContent : 0;
      dur += t ? +t.textContent : 0;
      eles.push(...byTag(lap, "AltitudeMeters").map((e) => +e.textContent));
    }
    if (start && dist > 0) runs.push(makeRun(start, dist / 1000, dur, elevationGain(eles), "tcx", name));
  }
  return runs;
}

async function parseFile(file) {
  const lower = file.name.toLowerCase();
  const name = file.name.replace(/\.[^.]+$/, "");
  if (lower.endsWith(".fit")) return parseFit(await file.arrayBuffer(), name);
  if (lower.endsWith(".gpx")) return parseGpx(await file.text(), name);
  if (lower.endsWith(".tcx")) return parseTcx(await file.text(), name);
  throw new Error("format non reconnu (.fit, .gpx ou .tcx)");
}
