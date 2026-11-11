// RunQuest — logique de jeu : transforme des courses en stats, butin et combats.
// Tout est recalculé à partir de la liste des courses + d'un petit état de progression.

const ZONES = [
  { id: "prairie", name: "Prairie des Débuts", km: 5, tile: "grass",
    boss: { name: "Gelée Verte", sprite: "slime", hp: 500, atk: 4, speed: 1.6 },
    reward: { name: "Bâton noueux", slot: "arme", force: 2 },
    intro: "Une gelée géante bloque le chemin vers la forêt." },
  { id: "foret", name: "Forêt Murmurante", km: 15, tile: "forest",
    boss: { name: "Loup Cendré", sprite: "wolf", hp: 1400, atk: 8, speed: 1.2 },
    reward: { name: "Tunique de cuir", slot: "armure", armure: 3, pv: 30 },
    intro: "Des hurlements résonnent entre les arbres…" },
  { id: "marais", name: "Marais Brumeux", km: 25, tile: "swamp",
    boss: { name: "Crapaud Titan", sprite: "toad", hp: 3000, atk: 13, speed: 1.4 },
    reward: { name: "Amulette de brume", slot: "bijou", crit: 0.05, force: 3 },
    intro: "Le sol tremble à chaque coassement." },
  { id: "collines", name: "Collines de Pierre", km: 40, tile: "hills",
    boss: { name: "Golem Ancien", sprite: "golem", hp: 5500, atk: 19, speed: 1.8 },
    reward: { name: "Épée runique", slot: "arme", force: 8 },
    intro: "Un tas de rochers se lève et te regarde." },
  { id: "volcan", name: "Mont Ardent", km: 60, tile: "lava",
    boss: { name: "Wyverne de Braise", sprite: "wyvern", hp: 8500, atk: 26, speed: 1.1 },
    reward: { name: "Cotte d'écailles", slot: "armure", armure: 10, pv: 80 },
    intro: "L'air brûle. Des ailes immenses masquent le soleil." },
  { id: "citadelle", name: "Citadelle d'Ombre", km: 80, tile: "castle",
    boss: { name: "Seigneur Sans-Souffle", sprite: "lord", hp: 12000, atk: 34, speed: 1.0 },
    reward: { name: "Couronne du Coureur", slot: "bijou", crit: 0.1, force: 10, pv: 100 },
    intro: "Celui qui a volé le souffle du royaume t'attend." },
];

const COMBAT_DURATION = 30; // secondes
const ENRAGE_AT = 20;       // le boss frappe deux fois plus fort après 20 s
const MAX_POTIONS = 5;
const CARRY_RATIO = 0.5;    // km en trop reportés sur la zone suivante (max 50 % de sa distance)

// ------------------------------------------------------------------ Outils
const pad = (n) => String(n).padStart(2, "0");
function localISO(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function hashStr(s) { // FNV-1a
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rngFor(id) {
  let s = hashStr(id);
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const round = (x, n = 0) => Math.round(x * 10 ** n) / 10 ** n;
const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function newState() {
  return {
    version: 1, hero_name: "Théo", runs: [], zone_index: 0, carry_km: 0, potions_used: 0,
    bonus_xp: 0, items: [], equipped: {}, log: [], fights: 0,
    // Les courses antérieures au début de l'aventure comptent pour le niveau,
    // mais pas pour le chemin (sinon ton historique ferait sauter toutes les zones).
    // (les courses du jour même comptent pour le chemin)
    start: localISO(new Date(new Date().setHours(0, 0, 0, 0))),
  };
}

// ------------------------------------------------------------------ Courses
const pace = (r) => r.duration_s / Math.max(r.distance_km, 0.01);
function fmtPace(s) { s = Math.round(s); return `${Math.floor(s / 60)}:${pad(s % 60)}/km`; }
const runDate = (r) => new Date(r.date);
const isNight = (r) => { const h = runDate(r).getHours(); return h >= 20 || h < 6; };
const isDawn = (r) => { const h = runDate(r).getHours(); return h >= 5 && h < 8; };

function reference(runs) {
  const valid = runs.filter((r) => r.distance_km >= 1);
  if (!valid.length) return { pace: 360, distance: 8 };
  return { pace: median(valid.map(pace)), distance: median(valid.map((r) => r.distance_km)) };
}
const isFast = (r, ref) => r.distance_km >= 2 && pace(r) <= ref.pace * 0.97;
const isLong = (r, ref) => r.distance_km >= Math.max(10, ref.distance * 1.4);
const isHilly = (r) => r.distance_km > 0 && r.elevation_m / r.distance_km >= 15;

function isoWeekKey(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-${Math.ceil(((t - y0) / 86400000 + 1) / 7)}`;
}

// Nombre de semaines consécutives avec au moins 2 sorties (la semaine en cours n'est pas pénalisante).
function weekStreak(runs, today = new Date()) {
  const weeks = {};
  for (const r of runs) { const k = isoWeekKey(runDate(r)); weeks[k] = (weeks[k] || 0) + 1; }
  const count = (d) => weeks[isoWeekKey(d)] || 0;
  const cursor = new Date(today);
  if (count(cursor) < 2) cursor.setDate(cursor.getDate() - 7);
  let streak = 0;
  while (count(cursor) >= 2) { streak++; cursor.setDate(cursor.getDate() - 7); }
  return streak;
}

function makeRun(date, distance_km, duration_s, elevation_m = 0, source = "manuel", name = "", extId = null) {
  const iso = localISO(date);
  return {
    id: String(extId || hashStr(`${iso}-${distance_km.toFixed(3)}`).toString(16)),
    date: iso, distance_km: round(+distance_km, 3), duration_s: Math.round(duration_s),
    elevation_m: Math.round(+elevation_m || 0), source, name: name || "Course",
  };
}

// ------------------------------------------------------------------ Personnage
const xpTotal = (s) => Math.floor(sum(s.runs, (r) => r.distance_km) * 100 + sum(s.runs, (r) => r.elevation_m) * 2 + s.bonus_xp);
const levelFromXp = (xp) => Math.floor(Math.sqrt(xp / 150)) + 1;
const xpForLevel = (lvl) => Math.floor(150 * (lvl - 1) ** 2);
const equippedItems = (s) => Object.values(s.equipped).filter((i) => i < s.items.length).map((i) => s.items[i]);

function heroStats(s) {
  const runs = s.runs, ref = reference(runs), xp = xpTotal(s), lvl = levelFromXp(xp);
  const fastKm = sum(runs.filter((r) => isFast(r, ref)), (r) => r.distance_km);
  const longKm = sum(runs.filter((r) => isLong(r, ref)), (r) => r.distance_km);
  const elev = sum(runs, (r) => r.elevation_m);
  const streak = weekStreak(runs);
  const items = equippedItems(s);
  const it = (k) => sum(items, (i) => i[k] || 0);
  return {
    niveau: lvl, xp, xp_niveau: xpForLevel(lvl), xp_suivant: xpForLevel(lvl + 1),
    pv: Math.round(100 + 12 * (lvl - 1) + 2 * longKm + it("pv")),
    force: round(2 + 0.6 * (lvl - 1) + 0.15 * fastKm + it("force"), 1),
    armure: round(elev / 100 + it("armure"), 1),
    crit: round(Math.min(0.4, 0.05 + 0.03 * streak + it("crit")), 2),
    charge: 4 + streak, serie: streak,
    km_total: round(sum(runs, (r) => r.distance_km), 1), km_rapides: round(fastKm, 1), km_longs: round(longKm, 1),
    denivele: Math.round(elev), allure_ref: fmtPace(ref.pace), sorties: runs.length,
  };
}

// ------------------------------------------------------------------ Exploration
const currentZone = (s) => ZONES[s.zone_index] || null;
const segmentRuns = (s) => s.runs.filter((r) => r.segment === s.zone_index);

function segmentProgress(s) {
  const zone = currentZone(s);
  const km = s.carry_km + sum(segmentRuns(s), (r) => r.distance_km);
  const need = zone ? zone.km : 0;
  return { km: round(km, 2), need, ready: !!zone && km >= need };
}

const FLAVOR = {
  potion: ["une fiole rouge cachée sous une racine", "une potion oubliée près d'un feu de camp",
    "un flacon brillant dans les hautes herbes", "un élixir offert par un marchand ambulant"],
  rage: ["Ton allure rapide attise ta rage de combattant", "Le vent de la vitesse aiguise ta lame",
    "Ton cœur bat fort : tu te sens invincible"],
  shield: ["La longue route forge ta résistance", "Des heures de marche endurcissent ta peau", "Ta patience devient un bouclier"],
  hill: ["Les côtes renforcent tes jambes comme de la pierre", "Du sommet, tu repères les faiblesses du boss"],
  night: "Courir sous les étoiles t'apprend à frapper dans l'ombre",
  dawn: "L'aube te bénit : premiers rayons, premiers coups",
};

// Tout ce qui a été accumulé sur le chemin, converti en bonus pour le combat.
function segmentLoot(s) {
  const ref = reference(s.runs);
  const runs = segmentRuns(s).sort((a, b) => runDate(a) - runDate(b));
  const prog = segmentProgress(s);
  let rage = 0, shield = 0, armor = 0, crit = 0, kmCursor = s.carry_km;
  const events = [];
  for (const r of runs) {
    const rng = rngFor(r.id);
    const before = kmCursor;
    kmCursor += r.distance_km;
    for (let i = Math.floor(before / 5); i < Math.floor(kmCursor / 5); i++) {
      if (events.filter((e) => e.type === "potion").length >= MAX_POTIONS) break;
      events.push({ run: r.id, type: "potion", text: `Tu trouves ${pick(rng, FLAVOR.potion)}.` });
    }
    if (isFast(r, ref)) { rage += 0.08; events.push({ run: r.id, type: "rage", text: `${pick(rng, FLAVOR.rage)} (+8 % dégâts).` }); }
    if (isLong(r, ref)) {
      const v = Math.floor(r.distance_km * 3); shield += v;
      events.push({ run: r.id, type: "shield", text: `${pick(rng, FLAVOR.shield)} (bouclier +${v}).` });
    }
    if (isHilly(r)) {
      const v = round(r.elevation_m / 50, 1); armor += v;
      events.push({ run: r.id, type: "hill", text: `${pick(rng, FLAVOR.hill)} (armure +${v}).` });
    }
    if (isNight(r)) { crit += 0.05; events.push({ run: r.id, type: "night", text: `${FLAVOR.night} (+5 % critique).` }); }
    else if (isDawn(r)) { crit += 0.03; events.push({ run: r.id, type: "dawn", text: `${FLAVOR.dawn} (+3 % critique).` }); }
  }
  const extra = Math.max(0, prog.km - prog.need);
  return {
    potions: Math.max(0, Math.min(MAX_POTIONS, Math.floor(prog.km / 5)) - s.potions_used),
    rage: round(Math.min(rage, 0.6), 2), bouclier: shield, armure: round(armor, 1),
    crit: round(Math.min(crit, 0.15), 2), preparation: round(Math.min(0.5, 0.02 * extra), 2), events,
  };
}

// ------------------------------------------------------------------ Combat
function combatSetup(s) {
  const zone = currentZone(s);
  if (!zone) throw new Error("Toutes les zones sont terminées.");
  if (!segmentProgress(s).ready) throw new Error("Il te reste du chemin avant d'atteindre le boss !");
  const st = heroStats(s), loot = segmentLoot(s);
  const mult = (1 + loot.rage) * (1 + loot.preparation);
  const armure = round(st.armure + loot.armure, 1);
  return {
    zone: { id: zone.id, name: zone.name, tile: zone.tile, intro: zone.intro },
    boss: zone.boss, duree: COMBAT_DURATION, enrage: ENRAGE_AT,
    hero: {
      pv: st.pv, degats: round(st.force * mult, 1), crit: round(Math.min(0.6, st.crit + loot.crit), 2),
      armure, reduction: round(1 - 50 / (50 + armure), 2), bouclier: loot.bouclier, potions: loot.potions,
      charge: st.charge, special: Math.round(st.force * mult * 20),
    },
    bonus: { rage: loot.rage, preparation: loot.preparation, bouclier: loot.bouclier, armure: loot.armure, crit: loot.crit, potions: loot.potions },
  };
}

function combatEnd(s, won, potionsUsed) {
  const zone = currentZone(s);
  if (!zone) throw new Error("Aucun combat en cours.");
  s.fights++;
  potionsUsed = Math.max(0, potionsUsed | 0);
  if (!won) {
    s.potions_used += potionsUsed;
    s.log.push(`Défaite contre ${zone.boss.name}. Cours encore pour revenir plus fort !`);
    return { won: false };
  }
  const prog = segmentProgress(s);
  const item = { ...zone.reward };
  s.items.push(item);
  s.equipped[item.slot] = s.items.length - 1; // les récompenses de boss sont toujours meilleures
  const xp = 250 * (s.zone_index + 1);
  s.bonus_xp += xp;
  s.potions_used = 0;
  s.zone_index++;
  const next = currentZone(s);
  s.carry_km = next ? round(Math.min(Math.max(0, prog.km - prog.need), next.km * CARRY_RATIO), 2) : 0;
  s.log.push(`Victoire sur ${zone.boss.name} ! Tu obtiens ${item.name} et ${xp} XP.`);
  return { won: true, item, xp, next: next ? next.name : null };
}

// ------------------------------------------------------------------ Ajout de courses
function addRuns(s, newRuns, ignoreStart = false) {
  const key = (r) => `${r.date.slice(0, 16)}|${r.distance_km.toFixed(1)}`;
  const keys = new Set(s.runs.map(key));
  const ids = new Set(s.runs.map((r) => r.id));
  const added = [];
  for (const r of newRuns) {
    if (keys.has(key(r)) || ids.has(r.id) || r.distance_km <= 0) continue;
    r.segment = r.date < s.start && !ignoreStart ? -1 : s.zone_index;
    s.runs.push(r); keys.add(key(r)); ids.add(r.id); added.push(r);
  }
  const road = added.filter((r) => r.segment >= 0), hist = added.filter((r) => r.segment < 0);
  if (road.length) s.log.push(`${road.length} course(s) ajoutée(s) : +${sum(road, (r) => r.distance_km).toFixed(1)} km sur la route.`);
  if (hist.length) s.log.push(`${hist.length} course(s) d'historique (${Math.round(sum(hist, (r) => r.distance_km))} km) : elles renforcent ton héros.`);
  return added;
}

function demoRuns() {
  const now = new Date(); now.setSeconds(0, 0);
  const runs = [];
  for (let i = 0; i < 6; i++) {
    const day = new Date(now); day.setDate(now.getDate() - (13 - i * 2 - Math.floor(Math.random() * 2)));
    const kind = i % 3;
    const u = (a, b) => a + Math.random() * (b - a);
    const [dist, p, elev, hour] = kind === 0 ? [u(7, 9), u(320, 345), u(20, 60), 18]
      : kind === 1 ? [u(5, 7), u(270, 290), u(10, 40), 7] : [u(13, 16), u(335, 360), u(220, 320), 21];
    day.setHours(hour, Math.floor(Math.random() * 60));
    runs.push(makeRun(day, dist, dist * p, elev, "démo", ["Footing", "Fractionné", "Sortie longue"][kind]));
  }
  return runs;
}

// Tout ce dont l'interface a besoin.
function fullView(s) {
  const ref = reference(s.runs);
  const zone = currentZone(s);
  return {
    hero_name: s.hero_name, stats: heroStats(s), zone_index: s.zone_index, finished: !zone,
    zones: ZONES.map((z, i) => ({ id: z.id, name: z.name, km: z.km, tile: z.tile, boss: z.boss.name, sprite: z.boss.sprite,
      status: i < s.zone_index ? "done" : i === s.zone_index ? "current" : "locked" })),
    progress: zone ? segmentProgress(s) : null,
    loot: zone ? segmentLoot(s) : null,
    items: s.items.map((it, i) => ({ ...it, equipped: s.equipped[it.slot] === i })),
    runs: [...s.runs].sort((a, b) => runDate(b) - runDate(a)).slice(0, 40).map((r) => ({
      ...r, allure: fmtPace(pace(r)),
      tags: [["rapide", isFast(r, ref)], ["longue", isLong(r, ref)], ["vallonnée", isHilly(r)],
        ["nocturne", isNight(r)], ["historique", r.segment < 0]].filter(([, ok]) => ok).map(([t]) => t),
    })),
    log: s.log.slice(-12).reverse(),
  };
}

// ------------------------------------------------------------------ Sauvegarde (navigateur)
const SAVE_KEY = "runquest-save-v1";
const Store = {
  load() {
    try { const raw = localStorage.getItem(SAVE_KEY); if (raw) return { ...newState(), ...JSON.parse(raw) }; }
    catch (e) { console.warn("Sauvegarde illisible", e); }
    return newState();
  },
  save(s) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); }
    catch (e) { console.warn("Sauvegarde impossible", e); }
  },
};
