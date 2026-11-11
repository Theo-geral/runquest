// RunQuest — interface (carte, héros, courses, combat clicker)
const $ = (s) => document.querySelector(s);
let VIEW = null;

// ------------------------------------------------------------------ API
async function api(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || (opts.body || opts.json ? "POST" : "GET"),
    headers: opts.json ? { "Content-Type": "application/json" } : undefined,
    body: opts.json ? JSON.stringify(opts.json) : opts.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  return data;
}

function toast(msg, ms = 2600) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add("hidden"), ms);
}

const pct = (x) => `${Math.max(0, Math.min(100, x * 100))}%`;
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

// ------------------------------------------------------------------ Rendu général
function render(v) {
  VIEW = v;
  const st = v.stats;
  $("#hero-name").textContent = v.hero_name;
  $("#lvl").textContent = st.niveau;
  $("#xp-bar").style.width = pct((st.xp - st.xp_niveau) / Math.max(1, st.xp_suivant - st.xp_niveau));
  renderSegment(v);
  renderMap(v);
  renderEvents(v);
  renderHero(v);
  renderRuns(v);
  renderStrava(v);
}

const LOOT_LABELS = [
  ["potion", "potions", (x) => x, "Potions"],
  ["rage", "rage", (x) => `+${Math.round(x * 100)}%`, "Rage"],
  ["shield", "bouclier", (x) => x, "Bouclier"],
  ["armor", "armure", (x) => `+${x}`, "Armure"],
  ["crit", "crit", (x) => `+${Math.round(x * 100)}%`, "Critique"],
  ["prep", "preparation", (x) => `+${Math.round(x * 100)}%`, "Km bonus"],
];

function renderSegment(v) {
  const box = $("#segment");
  box.innerHTML = "";
  if (v.finished) {
    box.append(el("div", "zone-title", "🏆 Chapitre 1 terminé !"),
      el("p", "intro", "Tu as vaincu le Seigneur Sans-Souffle. Le chapitre 2 arrive bientôt…"));
    return;
  }
  const zone = v.zones[v.zone_index];
  const p = v.progress;
  box.append(el("h2", null, `Zone ${v.zone_index + 1} / ${v.zones.length}`), el("div", "zone-title", zone.name));

  const preview = el("div", "boss-preview");
  preview.append(spriteCanvas(zone.sprite, 3), el("div", null, `Boss : <b>${zone.boss}</b><br><span class="hint">${p.ready ? "Le boss t'attend !" : "Avance sur le chemin pour l'atteindre."}</span>`));
  box.append(preview);

  const road = el("div", "road");
  const bar = el("div", "bar"); const fill = el("i"); fill.style.width = pct(p.km / p.need); bar.append(fill);
  road.append(bar, el("span", null, `${Math.min(p.km, p.need).toFixed(1)} / ${p.need} km`));
  box.append(road);

  box.append(el("h2", null, "Butin accumulé"));
  const loot = el("div", "loot");
  for (const [icon, key, fmt, label] of LOOT_LABELS) {
    const val = v.loot[key];
    const d = el("div", val ? "" : "zero");
    d.title = label;
    d.append(spriteCanvas(icon, 3), el("span", null, `<b>${fmt(val)}</b><br>${label}`));
    loot.append(d);
  }
  box.append(loot);

  const btn = el("button", "btn" + (p.ready ? " fight" : ""), p.ready ? "⚔️ Affronter le boss" : `Encore ${(p.need - p.km).toFixed(1)} km à courir`);
  btn.disabled = !p.ready;
  btn.onclick = openCombat;
  box.append(btn);
}

function renderEvents(v) {
  const ul = $("#events");
  ul.innerHTML = "";
  const evs = v.loot ? v.loot.events.slice().reverse().slice(0, 8) : [];
  const icons = { potion: "potion", rage: "rage", shield: "shield", hill: "armor", night: "crit", dawn: "crit" };
  for (const e of evs) {
    const li = el("li");
    li.append(spriteCanvas(icons[e.type] || "crit", 2), el("span", null, e.text));
    ul.append(li);
  }
  for (const msg of v.log.slice(0, 4)) ul.append(el("li", "empty", `› ${msg}`));
  if (!ul.children.length) ul.append(el("li", "empty", "Aucune course sur ce chemin. Va courir, puis importe ta sortie !"));
}

function renderHero(v) {
  const st = v.stats;
  const port = $("#hero-portrait");
  port.innerHTML = "";
  port.append(spriteCanvas("hero", 6));
  const rows = [
    ["Niveau", st.niveau], ["PV", st.pv], ["Force", st.force], ["Armure", st.armure],
    ["Critique", `${Math.round(st.crit * 100)} %`], ["Série", `${st.serie} sem.`],
    ["Km total", st.km_total], ["Km rapides", st.km_rapides], ["Km longs", st.km_longs],
    ["D+", `${st.denivele} m`], ["Allure réf.", st.allure_ref],
  ];
  $("#stats").innerHTML = rows.map(([k, val]) => `<span>${k}</span><span><b>${val}</b></span>`).join("");

  const ul = $("#items");
  ul.innerHTML = "";
  if (!v.items.length) ul.append(el("li", "empty", "<em>Bats des boss pour obtenir de l'équipement.</em>"));
  for (const it of v.items) {
    const bonus = [["force", "Force"], ["armure", "Armure"], ["pv", "PV"], ["crit", "Crit"]]
      .filter(([k]) => it[k]).map(([k, l]) => `${l} +${k === "crit" ? Math.round(it[k] * 100) + "%" : it[k]}`).join(", ");
    const li = el("li");
    li.append(spriteCanvas(it.slot === "arme" ? "sword" : it.slot, 3),
      el("span", null, `<b>${it.name}</b> ${it.equipped ? "" : "<em>(rangé)</em>"}<br><em>${it.slot} · ${bonus}</em>`));
    ul.append(li);
  }
}

function renderRuns(v) {
  const ul = $("#runs");
  ul.innerHTML = "";
  if (!v.runs.length) ul.append(el("li", null, "<span class='meta'>Aucune course pour l'instant.</span>"));
  for (const r of v.runs) {
    const d = new Date(r.date);
    const li = el("li");
    const info = el("div", null,
      `<b>${r.distance_km.toFixed(2)} km</b> · ${r.allure} · ${r.elevation_m} m D+<br>
       <span class="meta">${d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}
       ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} · ${r.name} · ${r.source}</span><br>` +
      r.tags.map((t) => `<span class="tag ${t}">${t}</span>`).join(""));
    const del = el("button", "del", "✕");
    del.title = "Supprimer";
    del.onclick = async () => { if (confirm("Supprimer cette course ?")) render(await api(`/api/runs/${r.id}`, { method: "DELETE" })); };
    li.append(info, del);
    ul.append(li);
  }
}

function renderStrava(v) {
  const box = $("#strava-box");
  box.innerHTML = "";
  if (!v.strava.configured) {
    box.append(el("p", "hint", "Strava : pas encore configuré (voir README → data/config.json)."));
  } else if (!v.strava.connected) {
    const a = el("a", "btn", "🔗 Connecter Strava");
    a.href = "/strava/connect";
    box.append(a);
  } else {
    const b = el("button", "btn", "🔄 Synchroniser Strava");
    b.onclick = async () => {
      b.disabled = true;
      try { const r = await api("/api/strava/sync", { method: "POST" }); render(r); toast(`${r.added} course(s) récupérée(s)`); }
      catch (e) { toast(e.message); }
      b.disabled = false;
    };
    box.append(b);
  }
}

// ------------------------------------------------------------------ Carte
const MAP_W = 120, BAND = 70, MAP_S = 3;

function mapPoints(n) {
  const H = n * BAND + 40;
  const pts = [{ x: 60, y: H - 14 }];
  for (let i = 0; i < n; i++) pts.push({ x: i % 2 ? 88 : 32, y: H - 40 - i * BAND - 18 });
  return { H, pts };
}

function linePixels(ctx, a, b, color, size) {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y));
  ctx.fillStyle = color;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    ctx.fillRect(Math.round(a.x + (b.x - a.x) * t) - (size >> 1), Math.round(a.y + (b.y - a.y) * t) - (size >> 1), size, size);
  }
}

function renderMap(v) {
  const n = v.zones.length;
  const { H, pts } = mapPoints(n);
  const c = $("#map");
  c.width = MAP_W * MAP_S;
  c.height = H * MAP_S;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.setTransform(MAP_S, 0, 0, MAP_S, 0, 0);

  // Bandes de terrain (zone 0 en bas)
  fillTile(ctx, "grass", 0, H - 40, MAP_W, 40, 7);
  v.zones.forEach((z, i) => fillTile(ctx, z.tile, 0, H - 40 - (i + 1) * BAND, MAP_W, BAND, 31 * (i + 3)));

  // Chemin
  for (let i = 0; i < pts.length - 1; i++) {
    linePixels(ctx, pts[i], pts[i + 1], "#1a1c2c", 5);
    linePixels(ctx, pts[i], pts[i + 1], "#d9b98a", 3);
  }

  // Brouillard sur les zones lointaines
  v.zones.forEach((z, i) => {
    if (i > v.zone_index + 1) { ctx.fillStyle = "rgba(26,28,44,.6)"; ctx.fillRect(0, H - 40 - (i + 1) * BAND, MAP_W, BAND); }
  });

  // Nœuds : boss / drapeaux
  ctx.font = "5px 'Press Start 2P', monospace";
  ctx.textBaseline = "top";
  v.zones.forEach((z, i) => {
    const p = pts[i + 1];
    const top = H - 40 - (i + 1) * BAND;
    ctx.fillStyle = "#1a1c2c";
    const label = z.name.toUpperCase();
    const tx = p.x < 60 ? 46 : 4;
    ctx.fillText(label, tx + 0.5, top + 4.5);
    ctx.fillStyle = z.status === "locked" && i > v.zone_index ? "#94b0c2" : "#f4f4f4";
    ctx.fillText(label, tx, top + 4);
    ctx.fillStyle = "#ffcd75";
    ctx.fillText(`${z.km} KM`, tx, top + 11);
    if (z.status === "done") {
      ctx.fillStyle = "#1a1c2c"; ctx.fillRect(p.x - 1, p.y - 12, 2, 13);
      ctx.fillStyle = "#ffcd75"; ctx.fillRect(p.x + 1, p.y - 12, 7, 5);
    } else {
      drawSprite(ctx, z.sprite, p.x - 8, p.y - 14, 1);
    }
  });

  // Départ
  ctx.fillStyle = "#1a1c2c"; ctx.fillRect(pts[0].x - 6, pts[0].y - 3, 12, 6);
  ctx.fillStyle = "#b13e53"; ctx.fillRect(pts[0].x - 5, pts[0].y - 2, 10, 4);

  // Héros
  let hx = pts[pts.length - 1].x, hy = pts[pts.length - 1].y;
  if (!v.finished) {
    const a = pts[v.zone_index], b = pts[v.zone_index + 1];
    const t = Math.min(1, v.progress.km / v.progress.need) * 0.85;
    hx = a.x + (b.x - a.x) * t; hy = a.y + (b.y - a.y) * t;
  }
  drawSprite(ctx, "hero", Math.round(hx - 8), Math.round(hy - 15), 1);

  // Faire défiler jusqu'au héros
  requestAnimationFrame(() => {
    const wrap = $("#map-wrap");
    const scale = wrap.clientWidth / MAP_W;
    wrap.scrollTop = hy * scale - wrap.clientHeight / 2;
  });
}

// ------------------------------------------------------------------ Combat
let C = null;
const SKY = {
  grass: ["#41a6f6", "#73eff7"], forest: ["#29366f", "#3b5dc9"], swamp: ["#333c57", "#566c86"],
  hills: ["#3b5dc9", "#41a6f6"], lava: ["#1a1c2c", "#5d275d"], castle: ["#1a1c2c", "#29366f"],
};

async function openCombat() {
  let setup;
  try { setup = await api("/api/combat/start", { method: "POST" }); }
  catch (e) { return toast(e.message); }
  const h = setup.hero;
  C = {
    s: setup, hp: h.pv, max: h.pv, shield: h.bouclier, potions: h.potions, used: 0,
    boss: setup.boss.hp, bossMax: setup.boss.hp, time: setup.duree, charge: 0,
    atkTimer: setup.boss.speed, running: false, over: false, lunge: 0, flash: 0, hurt: 0, particles: [], t0: 0,
  };
  $("#combat").classList.remove("hidden");
  $("#c-boss-name").textContent = setup.boss.name;
  resizeArena();
  updateCombatHUD();
  const b = setup.bonus;
  const bonusList = [
    b.rage && `Rage +${Math.round(b.rage * 100)} % dégâts`, b.preparation && `Préparation +${Math.round(b.preparation * 100)} % dégâts`,
    b.bouclier && `Bouclier ${b.bouclier}`, b.armure && `Armure +${b.armure}`, b.crit && `Critique +${Math.round(b.crit * 100)} %`,
    b.potions && `${b.potions} potion(s)`,
  ].filter(Boolean);
  showModal(`
    <h2>${setup.zone.name}</h2>
    <h1>${setup.boss.name}</h1>
    <p>${setup.zone.intro}</p>
    <p>Tape le boss le plus vite possible. Tu as <b>${setup.duree} s</b> ; il enrage après ${setup.enrage} s.</p>
    <ul>${bonusList.map((x) => `<li>✦ ${x}</li>`).join("") || "<li>Aucun bonus de route</li>"}</ul>
    <p>Dégâts <b>${h.degats}</b> · Crit <b>${Math.round(h.crit * 100)} %</b> · PV <b>${h.pv}</b></p>
    <button class="btn fight" id="go">⚔️ COMBATTRE</button>
    <button class="btn ghost" id="flee">Plus tard</button>`);
  $("#go").onclick = startFight;
  $("#flee").onclick = closeCombat;
  requestAnimationFrame(loop);
}

function startFight() {
  hideModal();
  C.running = true;
  C.t0 = performance.now();
  C.last = performance.now();
}

function closeCombat() {
  if (C) C.over = true;
  C = null;
  $("#combat").classList.add("hidden");
  hideModal();
}

function showModal(html) { const m = $("#c-modal"); m.innerHTML = html; m.classList.remove("hidden"); }
function hideModal() { $("#c-modal").classList.add("hidden"); }

function resizeArena() {
  const c = $("#arena-canvas");
  const box = $("#arena").getBoundingClientRect();
  C.W = 160;
  C.H = Math.max(90, Math.round(160 * box.height / Math.max(1, box.width)));
  C.S = Math.max(2, Math.floor(box.width / 160 * 2) / 2);
  c.width = C.W * 4; c.height = C.H * 4;
}

function floatText(text, cls, xPct, yPct) {
  const f = el("div", `float ${cls}`, text);
  f.style.left = `${xPct + (Math.random() * 10 - 5)}%`;
  f.style.top = `${yPct + (Math.random() * 10 - 5)}%`;
  $("#floats").append(f);
  setTimeout(() => f.remove(), 850);
}

function hit(e) {
  if (!C || !C.running) return;
  const h = C.s.hero;
  const crit = Math.random() < h.crit;
  const dmg = Math.max(1, Math.round(h.degats * (crit ? 2.5 : 1) * (0.9 + Math.random() * 0.2)));
  C.boss -= dmg;
  C.charge = Math.min(100, C.charge + h.charge);
  C.lunge = 1; C.flash = 1;
  for (let i = 0; i < (crit ? 8 : 4); i++) C.particles.push({ x: C.bx + 24, y: C.by + 24, vx: Math.random() * 3 - 1.5, vy: -Math.random() * 3, life: 1, c: crit ? "#ffcd75" : "#f4f4f4" });
  floatText(crit ? `${dmg}!` : dmg, crit ? "crit" : "", 62, 30);
  $("#tap-hint").classList.add("hidden");
  updateCombatHUD();
  checkEnd();
}

function special() {
  if (!C || !C.running || C.charge < 100) return;
  C.charge = 0;
  const dmg = Math.round(C.s.hero.special * (0.95 + Math.random() * 0.1));
  C.boss -= dmg; C.flash = 3; C.lunge = 2;
  for (let i = 0; i < 24; i++) C.particles.push({ x: C.bx + 24, y: C.by + 24, vx: Math.random() * 6 - 3, vy: Math.random() * 6 - 4, life: 1.4, c: i % 2 ? "#ef7d57" : "#ffcd75" });
  floatText(`${dmg}!!`, "big", 55, 25);
  updateCombatHUD();
  checkEnd();
}

function potion() {
  if (!C || !C.running || C.potions <= 0 || C.hp >= C.max) return;
  C.potions--; C.used++;
  const heal = Math.round(C.max * 0.35);
  C.hp = Math.min(C.max, C.hp + heal);
  floatText(`+${heal}`, "heal", 18, 45);
  updateCombatHUD();
}

function bossAttack() {
  const b = C.s.boss;
  const enraged = (C.s.duree - C.time) >= C.s.enrage;
  let dmg = Math.max(1, Math.round(b.atk * (enraged ? 2 : 1) * (1 - C.s.hero.reduction) * (0.85 + Math.random() * 0.3)));
  if (C.shield > 0) {
    const absorbed = Math.min(C.shield, dmg);
    C.shield -= absorbed; dmg -= absorbed;
    if (absorbed) floatText(`🛡${absorbed}`, "", 15, 40);
  }
  if (dmg > 0) {
    C.hp -= dmg;
    floatText(`-${dmg}`, "hurt", 18, 50);
  }
  C.hurt = 1;
  const arena = $("#arena");
  arena.classList.remove("shake"); void arena.offsetWidth; arena.classList.add("shake");
  updateCombatHUD();
  checkEnd();
}

function updateCombatHUD() {
  $("#c-boss-hp").style.width = pct(C.boss / C.bossMax);
  $("#c-hp").style.width = pct(C.hp / C.max);
  $("#c-hp-txt").textContent = `${Math.max(0, Math.round(C.hp))}/${C.max}`;
  $("#c-shield").textContent = C.shield > 0 ? `🛡 ${C.shield}` : "";
  $("#c-potions").textContent = C.potions;
  $("#c-potion").disabled = C.potions <= 0;
  $("#c-charge").style.width = `${C.charge}%`;
  $("#c-special").classList.toggle("ready", C.charge >= 100);
  const timer = $("#c-timer");
  timer.textContent = Math.ceil(Math.max(0, C.time));
  timer.classList.toggle("rage", (C.s.duree - C.time) >= C.s.enrage);
}

function checkEnd() {
  if (!C || C.over) return;
  if (C.boss <= 0) finish(true);
  else if (C.hp <= 0 || C.time <= 0) finish(false);
}

async function finish(won) {
  C.running = false; C.over = true;
  const used = C.used;
  let res;
  try { res = await api("/api/combat/end", { json: { won, potions_used: used } }); }
  catch (e) { toast(e.message); closeCombat(); return; }
  render(res);
  if (won) {
    const it = res.result.item;
    showModal(`<h1>VICTOIRE !</h1>
      <p>${C.s.boss.name} est vaincu en ${Math.round(C.s.duree - C.time)} s.</p>
      <p>Récompense : <b>${it.name}</b> et <b>${res.result.xp} XP</b></p>
      <p>${res.result.next ? `Prochaine zone : <b>${res.result.next}</b>` : "Tu as libéré le royaume !"}</p>
      <button class="btn" id="back">Retour à la carte</button>`);
  } else {
    showModal(`<h1 class="lose">DÉFAITE…</h1>
      <p>${C.hp <= 0 ? "Tu es tombé au combat." : "Le temps est écoulé."} Il restait ${Math.max(0, Math.round(C.boss))} PV au boss.</p>
      <p>Ton butin de route reste acquis (sauf les potions bues). Chaque km de plus te rend plus fort !</p>
      <button class="btn fight" id="retry">Réessayer</button>
      <button class="btn ghost" id="back">Retour à la carte</button>`);
    $("#retry").onclick = () => { closeCombat(); openCombat(); };
  }
  $("#back").onclick = closeCombat;
}

function drawArena(now) {
  const c = $("#arena-canvas");
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.setTransform(4, 0, 0, 4, 0, 0);
  const { W, H } = C;
  const tile = C.s.zone.tile;
  const ground = Math.round(H * 0.62);
  const sky = SKY[tile];
  // Ciel en bandes
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = i % 2 ? sky[1] : sky[0];
    ctx.fillRect(0, Math.round(ground * i / 6), W, Math.ceil(ground / 6) + 1);
  }
  fillTile(ctx, tile, 0, ground, W, H - ground, 99, 0.008);
  ctx.fillStyle = "rgba(26,28,44,.35)";
  ctx.fillRect(0, ground, W, 2);

  const bob = Math.floor(now / 300) % 2;
  // Héros
  const hx = 22 + (C.lunge > 0 ? 6 * C.lunge : 0);
  const hy = ground - 30;
  ctx.fillStyle = "rgba(26,28,44,.4)"; ctx.fillRect(hx + 6, ground - 1, 20, 3);
  drawSprite(ctx, "hero", hx, hy, 2, { flash: C.hurt > 0.5 });
  // Boss
  const bs = 3;
  C.bx = W - 22 - 16 * bs; C.by = ground - 16 * bs + 4 + bob;
  ctx.fillStyle = "rgba(26,28,44,.4)"; ctx.fillRect(C.bx + 6, ground + 2, 16 * bs - 12, 3);
  if (C.boss > 0) drawSprite(ctx, C.s.boss.sprite, C.bx, C.by, bs, { flip: true, flash: C.flash > 0.4 });
  // Particules
  for (const p of C.particles) {
    ctx.fillStyle = p.c;
    ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2);
  }
}

function loop(now) {
  if (!C || C.over && !C.running && $("#combat").classList.contains("hidden")) return;
  const dt = C.last ? Math.min(0.1, (now - C.last) / 1000) : 0;
  C.last = now;
  if (C.running) {
    C.time -= dt;
    C.atkTimer -= dt;
    if (C.atkTimer <= 0) { C.atkTimer += C.s.boss.speed; bossAttack(); }
    if (C.running) { updateCombatHUD(); checkEnd(); }
  }
  C.lunge = Math.max(0, C.lunge - dt * 8);
  C.flash = Math.max(0, C.flash - dt * 8);
  C.hurt = Math.max(0, C.hurt - dt * 5);
  C.particles = C.particles.filter((p) => (p.life -= dt * 2) > 0);
  for (const p of C.particles) { p.x += p.vx; p.y += p.vy; p.vy += 0.25; }
  drawArena(now);
  requestAnimationFrame(loop);
}

// ------------------------------------------------------------------ Événements
document.querySelectorAll(".tabs button").forEach((b) => b.onclick = () => {
  document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("active", x === b));
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.id === `tab-${b.dataset.tab}`));
  if (b.dataset.tab === "map" && VIEW) renderMap(VIEW);
});

$("#arena").addEventListener("pointerdown", (e) => { e.preventDefault(); hit(e); });
$("#c-special").onclick = special;
$("#c-potion").onclick = potion;
document.addEventListener("keydown", (e) => {
  if (!C || !C.running) return;
  if (e.code === "Space") { e.preventDefault(); hit(e); }
  if (e.key === "s") special();
  if (e.key === "p") potion();
});
window.addEventListener("resize", () => { if (C) resizeArena(); });

$("#file").onchange = async (e) => {
  const fd = new FormData();
  for (const f of e.target.files) fd.append("files", f);
  try {
    const r = await api("/api/import", { body: fd });
    render(r);
    toast(r.errors.length ? r.errors.join(" / ") : `${r.added} course(s) importée(s) !`, 4000);
  } catch (err) { toast(err.message); }
  e.target.value = "";
};

$("#manual").onsubmit = async (e) => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target));
  try { const r = await api("/api/runs", { json: d }); render(r); toast(r.added ? "Course ajoutée !" : "Course déjà présente"); e.target.reset(); }
  catch (err) { toast(err.message); }
};

$("#demo").onclick = async () => { render(await api("/api/demo", { method: "POST" })); toast("Courses de démo ajoutées"); };
$("#reset").onclick = async () => {
  if (!confirm("Effacer toute la progression et les courses ?")) return;
  render(await api("/api/reset", { method: "POST" }));
};

(async () => {
  const q = new URLSearchParams(location.search).get("strava");
  if (q === "ok") toast("Strava connecté !");
  if (q) history.replaceState(null, "", "/");
  const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  document.querySelector("#manual [name=date]").value = now.toISOString().slice(0, 16);
  await document.fonts?.ready;
  render(await api("/api/state"));
})();
