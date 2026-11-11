// Pixel art de RunQuest : sprites dessinés à la main, palette « Sweetie 16 ».
const PAL = {
  k: "#1a1c2c", w: "#f4f4f4", s: "#f4c79a", h: "#5d3a1a", r: "#b13e53", R: "#ef7d57",
  b: "#3b5dc9", B: "#29366f", g: "#94b0c2", G: "#566c86", y: "#ffcd75", n: "#733e39",
  l: "#a7f070", L: "#38b764", d: "#257179", c: "#41a6f6", p: "#5d275d", P: "#333c57",
};

// Héros (16x16), tourné vers la droite.
const HERO = [
  "................",
  "....kkkkkk......",
  "...khhhhhhk.....",
  "..khhhhhhhhk....",
  "..krrrrrrrrkR...",
  "..ksskssskskR...",
  "..kssssssssk..kg",
  "...kssssssk..kgk",
  "..kkbbbbbbkk.kgk",
  ".ksbbbybbbbskgk.",
  ".ksbbbybbbbskk..",
  "..kbbbybbbbkyk..",
  "..kBBBBBBBBkk...",
  "...kBBkkBBk.....",
  "...knnk.knnk....",
  "...kkkk.kkkk....",
];

// Monstres : demi-sprites (8 colonnes) symétrisés. 1 = couleur principale, 2 = ombre, 3 = reflet,
// e = yeux, t = détail (dents, cornes, langue).
const MONSTERS = {
  slime: { pal: { 1: "#38b764", 2: "#257179", 3: "#a7f070", e: "#1a1c2c", t: "#b13e53" }, half: [
    "........", "........", "........", "........",
    "......kk", "....kk11", "...k1133", "..k11133",
    "..k11111", ".k11kk11", ".k11kw11", ".k111111",
    "k211111k", "k2211111", ".k222222", "..kkkkkk"] },
  wolf: { pal: { 1: "#94b0c2", 2: "#566c86", 3: "#f4f4f4", e: "#ef7d57", t: "#f4f4f4" }, half: [
    "........", ".k......", ".k1k....", ".k11k...",
    ".k121kkk", ".k111111", "k1111111", "k11ek111",
    "k1111111", ".k111133", ".k111333", "..k11333",
    "..k113kk", "...k1tkt", "....k333", ".....kkk"] },
  toad: { pal: { 1: "#a7f070", 2: "#38b764", 3: "#ffcd75", e: "#1a1c2c", t: "#b13e53" }, half: [
    "........", "........", "........", "..kkk...",
    ".kwwwk..", ".kwekk..", ".kwwk1kk", "..kk1111",
    ".k111111", "k1133111", "k1333kkk", "k13333tt",
    "k2133333", ".k213333", "k22kk222", "kkk..kkk"] },
  golem: { pal: { 1: "#566c86", 2: "#333c57", 3: "#94b0c2", e: "#41a6f6", t: "#a7f070" }, half: [
    "........", "...kkkkk", "..k22111", "..k21111",
    "..k1ee11", "..k11111", "kkkk2222", "k21k1111",
    "k11k13t1", "k11k1111", "k12k1112", "kkkk1111",
    "...k11kk", "...k11k.", "..k211k.", "..kkkkk."] },
  wyvern: { pal: { 1: "#ef7d57", 2: "#b13e53", 3: "#ffcd75", e: "#ffcd75", t: "#f4f4f4" }, half: [
    "k.......", "k1k.....", "k11k....", "k211k.kk",
    "k2211k11", ".k221ke1", ".k22k111", "..k2k1t1",
    "...kk111", "....k133", "....k133", "...k1133",
    "...k11k3", "..k11k.k", "..kk.k..", "........"] },
  lord: { pal: { 1: "#333c57", 2: "#5d275d", 3: "#b13e53", e: "#ef7d57", t: "#ffcd75" }, half: [
    "..t.....", "..tk....", "..ktk.kk", "...k1k11",
    "...k1111", "...k11e1", "...k1111", ".kkkk111",
    "k2222k11", "k2112k13", "k21122k3", "k2112213",
    ".k21221k", ".k2212k.", "..k22k..", "..kkkk.."] },
};

// Petites icônes 8x8 pour le butin.
const ICONS = {
  potion: ["...kk...", "...gk...", "..krrk..", ".krRrrk.", ".krrrrk.", ".krrrrk.", "..kkkk..", "........"],
  rage:   ["...R....", "..RR.R..", "..RyRR..", ".RyyyR..", ".RyyyRR.", ".RRyyR..", "..RRRR..", "........"],
  shield: [".kkkkkk.", ".kccbck.", ".kcbbck.", ".kcbbck.", "..kcck..", "..kcck..", "...kk...", "........"],
  armor:  ["........", "...k....", "..kgk...", "..kggk..", ".kgGgk.k", ".kGGGkgk", "kGGGGGGk", "kkkkkkkk"],
  crit:   ["...y....", "...y....", ".yyyyy..", "..yyy...", "..y.y...", ".y...y..", "........", "........"],
  prep:   ["........", "..kkk...", "..knk...", "..knk...", "..knnkk.", ".knnnnk.", ".kkkkkk.", "........"],
  sword:  [".......g", "......gk", ".....gk.", "....gk..", ".y.gk...", "..yk....", ".ny.y...", "n......."],
  armure: [".kk..kk.", "kbbkkbbk", "kbbbbbbk", ".kbbbbk.", ".kbyybk.", ".kbbbbk.", ".kkkkkk.", "........"],
  bijou:  ["..kkkk..", ".k....k.", ".k....k.", "..k..k..", "...kk...", "..kyyk..", "..kyyk..", "...kk..."],
};

function mirror(half) {
  return half.map(row => row + row.split("").reverse().join(""));
}

function spriteRows(name) {
  if (name === "hero") return { rows: HERO, pal: PAL };
  if (ICONS[name]) return { rows: ICONS[name], pal: PAL };
  const m = MONSTERS[name];
  return { rows: mirror(m.half), pal: { ...PAL, ...m.pal } };
}

// Dessine un sprite sur un contexte 2D, à la position (x, y), avec un facteur d'échelle.
function drawSprite(ctx, name, x, y, scale = 1, opts = {}) {
  const { rows, pal } = spriteRows(name);
  for (let j = 0; j < rows.length; j++) {
    const row = rows[j];
    for (let i = 0; i < row.length; i++) {
      const ch = row[opts.flip ? row.length - 1 - i : i];
      if (ch === "." || ch === " ") continue;
      ctx.fillStyle = opts.flash ? "#f4f4f4" : (pal[ch] || "#ff00ff");
      ctx.fillRect(Math.round(x + i * scale), Math.round(y + j * scale), Math.ceil(scale), Math.ceil(scale));
    }
  }
}

// Crée un petit <canvas> contenant une icône ou un sprite.
function spriteCanvas(name, scale = 3) {
  const { rows } = spriteRows(name);
  const c = document.createElement("canvas");
  c.width = rows[0].length * scale;
  c.height = rows.length * scale;
  c.className = "pix";
  drawSprite(c.getContext("2d"), name, 0, 0, scale);
  return c;
}

// ---------------------------------------------------------------- Décors
const TILES = {
  grass:  { base: "#38b764", dots: ["#a7f070", "#257179"], deco: "flower" },
  forest: { base: "#257179", dots: ["#38b764", "#1a1c2c"], deco: "tree" },
  swamp:  { base: "#566c86", dots: ["#257179", "#41a6f6"], deco: "puddle" },
  hills:  { base: "#94b0c2", dots: ["#566c86", "#f4f4f4"], deco: "rock" },
  lava:   { base: "#5d275d", dots: ["#b13e53", "#ef7d57"], deco: "crack" },
  castle: { base: "#333c57", dots: ["#29366f", "#5d275d"], deco: "brick" },
};

function seededRandom(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function drawDeco(ctx, kind, x, y, rnd) {
  const px = (dx, dy, c) => { ctx.fillStyle = c; ctx.fillRect(x + dx, y + dy, 1, 1); };
  if (kind === "flower") { px(0, 0, rnd() < .5 ? "#ffcd75" : "#f4f4f4"); px(0, 1, "#257179"); }
  else if (kind === "tree") {
    ctx.fillStyle = "#1a1c2c"; ctx.fillRect(x - 2, y - 4, 5, 5);
    ctx.fillStyle = "#38b764"; ctx.fillRect(x - 1, y - 4, 3, 4);
    ctx.fillStyle = "#a7f070"; ctx.fillRect(x - 1, y - 4, 1, 1);
    ctx.fillStyle = "#733e39"; ctx.fillRect(x, y + 1, 1, 2);
  } else if (kind === "puddle") { ctx.fillStyle = "#41a6f6"; ctx.fillRect(x, y, 4, 1); ctx.fillRect(x + 1, y + 1, 2, 1); }
  else if (kind === "rock") { ctx.fillStyle = "#566c86"; ctx.fillRect(x, y, 3, 2); px(0, 0, "#f4f4f4"); }
  else if (kind === "crack") { ctx.fillStyle = "#ef7d57"; ctx.fillRect(x, y, 2, 1); ctx.fillRect(x + 1, y + 1, 2, 1); px(3, 2, "#ffcd75"); }
  else if (kind === "brick") { ctx.fillStyle = "#29366f"; ctx.fillRect(x, y, 5, 1); ctx.fillRect(x + 2, y + 2, 5, 1); }
}

function fillTile(ctx, tile, x, y, w, h, seed = 1, decoDensity = 0.012) {
  const t = TILES[tile];
  const rnd = seededRandom(seed);
  ctx.fillStyle = t.base;
  ctx.fillRect(x, y, w, h);
  for (let i = 0; i < w * h * 0.06; i++) {
    ctx.fillStyle = t.dots[rnd() < 0.5 ? 0 : 1];
    ctx.fillRect(x + Math.floor(rnd() * w), y + Math.floor(rnd() * h), 1, 1);
  }
  for (let i = 0; i < w * h * decoDensity; i++) {
    drawDeco(ctx, t.deco, x + 3 + Math.floor(rnd() * (w - 8)), y + 5 + Math.floor(rnd() * (h - 10)), rnd);
  }
}
