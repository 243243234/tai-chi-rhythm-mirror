'use strict';
/* ============================================================
   《太极八段锦 · 东方奇幻音游》 core.js
   - 曲库 / 难度 / 全局状态
   - 世界层等比缩放布局引擎（全屏无框、自动适配任意屏幕）
   - 图像资源加载（白底羽化去白 / 黑底叠加 / 智能降采样）
   - Web Audio 实时合成（五声音阶拨弦 + 鼓 + 镲）
   ============================================================ */

/* ------------------------------------------------------------
   1. 曲库：十二时辰 · 经络养生六部曲
   ------------------------------------------------------------ */
const SONGS = [
  {
    id: 0, title: '立春 · 卯时', meridian: '肝经 · 疏肝理气', difficulty: '简单',
    bpm: 72, beats: 216, root: 196.00, approach: 2.1, art: 'song_spring.jpg',
    composer: '云水谣 / 词：古意',
    desc: '晨光初起，推掌舒展，把一夜的倦意慢慢推开。', tipImg: 'tip_1.jpg',
    density: [1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0],
    melody: [1, 0, 2, 3, 0, 3, 2, 1, 2, 0, 3, 5, 3, 2, 1, 0,
             1, 0, 2, 3, 5, 0, 3, 2, 3, 0, 2, 1, 2, 0, 0, 0,
             3, 0, 5, 6, 5, 3, 2, 3, 1, 0, 2, 3, 2, 1, 0, 0,
             1, 0, 2, 3, 0, 3, 5, 3, 2, 0, 1, 0, 1, 0, 0, 0],
    tip: '八段锦第一式「双手托天理三焦」：双脚与肩同宽站立，双手交叉上托到头顶、掌心向上，停两秒再放下。晨起 3～5 次，通调三焦、舒畅身心。'
  },
  {
    id: 1, title: '春分 · 辰时', meridian: '脾经 · 健脾和胃', difficulty: '中等',
    bpm: 80, beats: 240, root: 207.65, approach: 2.0, art: 'song_spring.jpg',
    composer: '踏莎行 / 词：古意',
    desc: '早膳初定，脾土当运，单臂上托调和脾胃运化。', tipImg: 'tip_1.jpg',
    density: [1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0],
    melody: [2, 0, 3, 5, 3, 0, 2, 1, 2, 3, 5, 6, 5, 3, 2, 0,
             1, 2, 3, 0, 5, 3, 2, 3, 1, 0, 2, 1, 2, 0, 0, 0,
             3, 5, 6, 5, 3, 2, 1, 2, 3, 0, 5, 6, 5, 3, 2, 1],
    tip: '八段锦第三式「调理脾胃须单举」：一手向上托起掌心向天，一手下按掌心向地，舒展胃脘肋腹，调畅中焦气血。'
  },
  {
    id: 2, title: '夏至 · 午时', meridian: '心经 · 养心安神', difficulty: '困难',
    bpm: 100, beats: 300, root: 220.00, approach: 1.7, art: 'song_summer.jpg',
    composer: '临江仙 / 词：古意',
    desc: '日头正盛，节奏紧密，闪身步要随疾风鼓点而动。', tipImg: 'tip_2.jpg',
    density: [1, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1],
    melody: [5, 3, 5, 6, 5, 3, 2, 3, 5, 5, 3, 2, 1, 2, 3, 0,
             6, 5, 3, 5, 6, 8, 6, 5, 3, 5, 3, 2, 1, 2, 0, 0,
             5, 3, 5, 6, 8, 6, 5, 3, 2, 3, 5, 3, 2, 1, 2, 0,
             3, 5, 6, 5, 3, 2, 1, 2, 3, 0, 2, 0, 1, 0, 0, 0,
             5, 6, 8, 6, 5, 3, 5, 6, 3, 2, 3, 5, 2, 1, 2, 3],
    tip: '八段锦第五式「摇头摆尾去心火」：马步微下，上身缓缓摇摆，左右各 3 次。动作要慢，午间清泻心火、畅达神志。'
  },
  {
    id: 3, title: '秋分 · 酉时', meridian: '肺经 · 润肺理气', difficulty: '中等',
    bpm: 88, beats: 264, root: 185.00, approach: 1.9, art: 'song_spring.jpg',
    composer: '长相思 / 词：古意',
    desc: '秋水长天，开弓拉弦，畅通宣降之肺气。', tipImg: 'tip_2.jpg',
    density: [1, 0, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 0],
    melody: [3, 0, 2, 1, 2, 3, 5, 0, 6, 5, 3, 2, 3, 0, 1, 0,
             5, 6, 5, 3, 2, 1, 2, 0, 3, 5, 6, 8, 6, 5, 3, 0,
             2, 1, 2, 3, 5, 3, 2, 0, 1, 0, 2, 1, 0, 0, 0, 0],
    tip: '八段锦第二式「左右开弓似射雕」：跨马步拉弓展胸，双眼凝视指尖，调理肺经气血，增强胸膈宣发之机。'
  },
  {
    id: 4, title: '白露 · 戌时', meridian: '心包 · 舒心解郁', difficulty: '困难',
    bpm: 108, beats: 324, root: 233.08, approach: 1.6, art: 'song_summer.jpg',
    composer: '醉花阴 / 词：古意',
    desc: '暮霭渐深，回首相望，劳伤渐消，神凝气聚。', tipImg: 'tip_3.jpg',
    density: [1, 1, 1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1, 1],
    melody: [6, 5, 3, 5, 6, 0, 5, 3, 2, 3, 5, 6, 8, 6, 5, 0,
             5, 3, 2, 1, 2, 3, 0, 5, 3, 2, 1, 0, 2, 3, 5, 0,
             6, 8, 6, 5, 3, 5, 6, 0, 3, 2, 1, 2, 3, 0, 1, 0],
    tip: '八段锦第四式「五劳七伤往后瞧」：展肩旋臂，头颈缓缓后瞧，疏导颈项经络，缓解伏案疲惫与情志郁结。'
  },
  {
    id: 5, title: '冬至 · 子时', meridian: '肾经 · 固肾安神', difficulty: '中等',
    bpm: 84, beats: 252, root: 174.61, approach: 1.9, art: 'song_winter.jpg',
    composer: '寒潭引 / 词：古意',
    desc: '夜深人静，站桩吐纳，将气息一点点收纳归元。', tipImg: 'tip_3.jpg',
    density: [1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1],
    melody: [1, 0, 1, 2, 3, 0, 2, 1, 0, 1, 2, 3, 5, 3, 2, 0,
             1, 0, 3, 2, 1, 0, 0, 2, 3, 5, 3, 2, 1, 0, 0, 0,
             5, 0, 3, 5, 6, 5, 3, 2, 3, 0, 2, 1, 2, 0, 1, 0,
             1, 0, 2, 3, 5, 3, 2, 1, 0, 2, 1, 0, 1, 0, 0, 0,
             3, 2, 1, 2, 3, 0, 5, 3],
    tip: '八段锦第六式「两手攀足固肾腰」：站直，双手沿腿后侧摸向脚背，慢慢起身轻按后腰，重复 3～5 次。睡前充固肾水、安和心神。'
  },
  {
    id: 6, title: '西湖 · 断桥', meridian: '西湖十景 · 断桥残雪', difficulty: '中等',
    bpm: 66, beats: 198, root: 196.00, approach: 2.0, art: 'song_xihu.jpg',
    composer: '湖上清音 / 词：古意', xihu: true, hidden: true,
    desc: '断桥残雪，湖光潋滟，拨弦声里荷花初绽。扫码解锁的西湖隐藏关。', tipImg: 'tip_3.jpg',
    density: [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1],
    melody: [5, 0, 3, 5, 6, 0, 5, 3, 2, 0, 3, 5, 3, 2, 1, 0,
             5, 0, 6, 8, 6, 5, 3, 2, 3, 0, 2, 1, 2, 0, 0, 0,
             3, 0, 5, 6, 5, 3, 2, 3, 5, 0, 3, 2, 1, 0, 2, 0,
             5, 0, 3, 5, 6, 5, 3, 2, 1, 0, 2, 3, 5, 0, 3, 0,
             6, 0, 5, 3, 2, 0, 1, 0, 0, 0],
    tip: '八段锦收势「背后七颠百病消」：脚跟提起再轻落，颠七次，湖边晨练最宜。面朝西湖练一遍，颠落的是疲惫，提起的是清气。'
  }
];

const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
function degreeToFreq(root, degree) {
  const idx = Math.min(degree - 1, SCALE.length - 1);
  return root * Math.pow(2, SCALE[idx] / 12);
}

const POEM_VERSES = [
  '大鹏一日同风起 · 扶摇直上九万里',
  '黄河之水天上来 · 奔流到海不复回',
  '十步杀一人 · 千里不留行',
  '呼儿将出换美酒 · 与尔消万古愁',
  '长风破浪会有时 · 直挂云帆济沧海'
];

const BAGUA_NAMES = ['乾', '兑', '离', '震', '巽', '坎', '艮', '坤'];

/* ------------------------------------------------------------
   2. 判定与计分常量
   ------------------------------------------------------------ */
const WIN_PERFECT = 0.09;
const WIN_GOOD = 0.19;
const WIN_HUAJIN = 0.30;   // 化劲容错：0.19–0.30 秒的近失手不算乱
const SCORE_PERFECT = 300;
const SCORE_GOOD = 100;
const ENERGY_PERFECT = 9;
const ENERGY_GOOD = 4;
const FEVER_SECONDS = 8;
const DISORDER_MISS = 18;
const DISORDER_WRONG = 12;
const DISORDER_STRAY = 4;

const DIFFS = {
  easy:   { name: '初学', mult: 0.8, approach: 1.3,  note: '谱面稀疏 · 落速放缓 · 得分 ×0.8' },
  normal: { name: '入室', mult: 1.0, approach: 1.0,  note: '标准谱面 · 标准落速 · 得分 ×1.0' },
  hard:   { name: '天人', mult: 1.5, approach: 0.82, note: '谱面加密 · 落速提升 · 得分 ×1.5' }
};
const NATIVE_DIFF = { '简单': 'easy', '中等': 'normal', '困难': 'hard' };

/* ------------------------------------------------------------
   3. 全局状态
   ------------------------------------------------------------ */
const G = {
  state: 'home',           // home | menu | playing | result
  paused: false,
  song: null,
  diff: 'normal',
  approachMult: 1,
  chart: [],
  startAt: 0,
  songTime: 0,
  score: 0, combo: 0, maxCombo: 0,
  countPerfect: 0, countGood: 0, countMiss: 0,
  disorder: 0, energy: 0, feverLeft: 0,
  pressHeld: false,
  character: { action: 'idle', until: 0, dir: 0 },
  enemies: [
    { name: '熬夜黑眼圈', kind: 'eye', advance: 0, flash: 0 },
    { name: '久坐腰酸怪', kind: 'waist', advance: 0, flash: 0 }
  ],
  shake: 0,
  flash: 0,            // 全屏闪光强度 0..1
  swordT: 0,
  duelT: -99,          // 水墨比武起始时间（songTime）
  tutorial: false,     // v7：新手实战教程局（不发墨币、不记最佳、不触发结算）
  lastJudgeText: '', lastJudgeColor: '#333', lastJudgeAt: -9,
  comboPop: 0,         // 连击数字弹跳
  comboGlow: 0,        // 连击热度 0..1（越接近满连越亮）
  hitFlash: 0,         // 判定线处的高光

  // 特效容器（全部由 fx.js 维护）
  popups: [], sparks: [], ink: [], rings: [], slashes: [], fireworks: [],
  petals: [], motes: [], qiStream: [], vortex: [],
  milestones: [], verses: [], projectiles: [], purifications: [],
  comboWaves: [], windBlades: [],
  heroFx: 0
};

/* ------------------------------------------------------------
   4. 小工具
   ------------------------------------------------------------ */
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeIn = (t) => t * t * t;
const easeInOut = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const smoothstep = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

/* ------------------------------------------------------------
   5. 世界层布局引擎
   ------------------------------------------------------------
   设计基准：世界高 600 单位，宽度随视口比例在 [760, 1560] 之间浮动。
   世界层用 transform:scale() 铺满屏幕 —— 所以所有内容在任何屏幕上
   比例一致、永远完整可见，没有画框也没有黑边。
   ------------------------------------------------------------ */
const BASE_H = 600;
const MIN_W = 760;
const MAX_W = 1560;
const MIN_ASPECT = MIN_W / BASE_H;      // 1.2667
const MAX_ASPECT = MAX_W / BASE_H;      // 2.6

const Layout = {
  W: 960, H: BASE_H, scale: 1, offX: 0, offY: 0, dpr: 1, portrait: false
};

/* 世界几何：卷轴 / 轨道 / 角色锚点（随世界宽度重算） */
const Geo = {
  CX: 480,
  scroll: { left: 310, top: 74, w: 340, h: 540, cx: 480, judgeY: 460, judgeR: 56 },
  track: { topY: 133, judgeY: 460 },
  hero: { x: 180, y: 452, scale: 1 },
  enemies: [{ x: 780, y: 300, scale: 1 }, { x: 810, y: 455, scale: 1 }],
  sideInset: 96
};

/* 卷轴水墨河中心线（track_scroll.png 像素坐标实测采样 =>
   [imgY, imgX]），用于让音符真正沿画中的墨河流动 */
const INK_PATH = [
  [100, 305], [130, 340], [170, 275], [204, 234], [240, 252], [272, 300],
  [300, 374], [330, 372], [360, 360], [390, 265], [420, 228], [450, 226],
  [480, 258], [510, 350], [540, 364], [570, 320], [600, 372], [630, 398],
  [655, 392], [675, 350], [690, 310]
];
const INK_TOP_Y = INK_PATH[0][0];
const INK_BOT_Y = INK_PATH[INK_PATH.length - 1][0];

function computeGeo() {
  const W = Layout.W, H = Layout.H;
  const cx = W / 2;
  Geo.CX = cx;

  const sc = Geo.scroll;
  sc.h = 540;
  sc.w = sc.h * (600 / 953);
  sc.top = 74;
  sc.cx = cx + 4;
  sc.left = sc.cx - sc.w / 2;
  sc.judgeY = sc.top + (682 / 953) * sc.h;
  // v11：judgeR 原来是 100/953，比画里那个留白圆（半径约 150/953）小一大截，
  // 太极盘因此飘在圆里像贴纸。128/953 让判定盘坐进画中的圆，四周仍留一圈墨气。
  sc.judgeR = (128 / 953) * sc.h;

  Geo.track.topY = sc.top + (INK_TOP_Y / 953) * sc.h;
  Geo.track.judgeY = sc.judgeY;

  // 两侧角色：贴边但不与卷轴重叠；世界越窄角色按比例缩一号
  const half = sc.w / 2;
  Geo.hero.x = Math.max(Geo.sideInset, cx - half - 132);
  Geo.enemies[0].x = Math.min(W - 104, cx + half + 118);
  Geo.enemies[1].x = Math.min(W - 84, cx + half + 146);
  const k = clamp(W / 960, 0.66, 1);
  Geo.hero.scale = k;
  Geo.enemies[0].scale = k;
  Geo.enemies[1].scale = k;
  Geo.hero.y = 452;
  Geo.enemies[0].y = 268;
  Geo.enemies[1].y = 468;
}

/* 墨河曲线：给定世界 y，返回该行的世界 x（Catmull-Rom 平滑插值） */
function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

function trackCX(y) {
  const sc = Geo.scroll;
  const imgY = (y - sc.top) / sc.h * 953;
  const n = INK_PATH.length;
  let i = 0;
  while (i < n - 2 && INK_PATH[i + 1][0] < imgY) i++;
  const a = INK_PATH[i], b = INK_PATH[i + 1];
  const t = clamp((imgY - a[0]) / Math.max(1, b[0] - a[0]), 0, 1);
  const p0 = INK_PATH[Math.max(0, i - 1)][1];
  const p1 = a[1];
  const p2 = b[1];
  const p3 = INK_PATH[Math.min(n - 1, i + 2)][1];
  const imgX = catmullRom(p0, p1, p2, p3, t);
  return sc.left + (imgX / 600) * sc.w;
}

/* ------------------------------------------------------------
   6. 舞台自适应（世界层缩放）
   ------------------------------------------------------------ */
const canvasEl = document.getElementById('game');
const ctx = canvasEl.getContext('2d');
const worldEl = document.getElementById('world');
let ctxScale = 1;

function layoutWorld() {
  const vw = Math.max(320, window.innerWidth);
  const vh = Math.max(240, window.innerHeight);
  const aspect = vw / vh;

  Layout.portrait = aspect < 1.02;
  const a = clamp(aspect, MIN_ASPECT, MAX_ASPECT);
  const W = Math.round(BASE_H * a);
  const H = BASE_H;

  const scale = Math.min(vw / W, vh / H);
  const worldW = W * scale, worldH = H * scale;

  Layout.W = W;
  Layout.H = H;
  Layout.scale = scale;
  Layout.offX = (vw - worldW) / 2;
  Layout.offY = (vh - worldH) / 2;
  Layout.dpr = Math.min(window.devicePixelRatio || 1, 2);

  worldEl.style.width = W + 'px';
  worldEl.style.height = H + 'px';
  worldEl.style.transform =
    `translate(${Layout.offX}px, ${Layout.offY}px) scale(${scale})`;

  // 画布：物理像素 = 世界单位 × 缩放 × DPR，保证锐利
  const pxW = Math.round(W * scale * Layout.dpr);
  const pxH = Math.round(H * scale * Layout.dpr);
  if (canvasEl.width !== pxW || canvasEl.height !== pxH) {
    canvasEl.width = pxW;
    canvasEl.height = pxH;
  }
  ctxScale = scale * Layout.dpr;

  computeGeo();

  document.body.classList.toggle('short-screen', worldH < 430 || vh < 520);
  document.body.classList.toggle('is-touch',
    ('ontouchstart' in window) || navigator.maxTouchPoints > 0 ||
    (window.matchMedia && window.matchMedia('(pointer: coarse)').matches));
  const rh = document.getElementById('rotate-hint');
  if (rh) rh.classList.toggle('hidden', !Layout.portrait || G.state !== 'playing');

  if (typeof onLayoutChanged === 'function') onLayoutChanged();
}
window.addEventListener('resize', layoutWorld);
window.addEventListener('orientationchange', () => setTimeout(layoutWorld, 120));

/* ------------------------------------------------------------
   7. 图像资源：加载 / 去白 / 降采样
   ------------------------------------------------------------ */
const IMG = {};

const assetCanvas = document.createElement('canvas');
const assetCtx = assetCanvas.getContext('2d');

function shrinkToCanvas(img, maxSide) {
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  const k = Math.min(1, maxSide / Math.max(w, h));
  if (k >= 1) return img;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * k));
  c.height = Math.max(1, Math.round(h * k));
  const cc = c.getContext('2d');
  cc.imageSmoothingQuality = 'high';
  cc.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

function processWhiteToAlpha(img) {
  try {
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return img;
    const mem = document.createElement('canvas');
    mem.width = w; mem.height = h;
    const mc = mem.getContext('2d');
    mc.drawImage(img, 0, 0);
    const data = mc.getImageData(0, 0, w, h);
    const d = data.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const lum = (r + g + b) / 3;
      if (lum > 198) {
        const alpha = clamp((255 - lum) * 5.6, 0, 255);
        d[i + 3] = Math.min(d[i + 3], alpha);
      }
    }
    mc.putImageData(data, 0, 0);
    return mem;
  } catch (e) {
    return img;
  }
}

function loadSmartAsset(key, candidates, options) {
  options = options || {};
  let idx = 0;
  function next() {
    if (idx >= candidates.length) return;
    const img = new Image();
    img.onload = () => {
      let asset = options.whiteToAlpha ? processWhiteToAlpha(img) : img;
      if (!options.whiteToAlpha && !options.keepSize) asset = shrinkToCanvas(asset, options.maxSide || 960);
      IMG[key] = asset;
    };
    img.onerror = () => { idx++; next(); };
    img.src = candidates[idx];
  }
  next();
}

/* 角色 / 小怪 */
loadSmartAsset('hero_idle',  ['assets/hero_idle.png', 'assets/hero_idle.jpg']);
loadSmartAsset('hero_push',  ['assets/hero_push.png', 'assets/hero_push.jpg']);
loadSmartAsset('hero_dodge', ['assets/hero_dodge.png', 'assets/hero_dodge.jpg']);
loadSmartAsset('hero_hold',  ['assets/hero_hold.png', 'assets/hero_hold.jpg']);
loadSmartAsset('hero_hurt',  ['assets/hero_hurt.png', 'assets/hero_hurt.jpg']);
loadSmartAsset('heroSword',  ['assets/hero_sword.png', 'assets/hero_sword.jpg']);
loadSmartAsset('enemy_eye',  ['assets/enemy_night.png', 'assets/enemy_night.jpg']);
loadSmartAsset('enemy_waist',['assets/enemy_sit.png', 'assets/enemy_sit.jpg']);

/* 卷轴 / 轨道 / 光效 */
loadSmartAsset('trackScroll', ['assets/track_scroll.png', 'assets/track_scroll.jpg'], { keepSize: true });
loadSmartAsset('taichiKoi',   ['assets/taichi_koi.png', 'assets/taichi_judge.png']);
loadSmartAsset('taichi',      ['assets/taichi_judge.png', 'assets/taichi_judge.jpg'], { whiteToAlpha: true });
loadSmartAsset('slashInk',    ['assets/slash_ink.png', 'assets/slash_ink.jpg']);
loadSmartAsset('inkWater',    ['assets/ink_water.png', 'assets/ink_water.jpg']);
loadSmartAsset('inkDuelTaichi',     ['assets/ink_duel_taichi.png']);
loadSmartAsset('inkDuelTaichiIdle', ['assets/ink_duel_taichi_idle.png']);
loadSmartAsset('inkDuelMonster',    ['assets/ink_duel_monster.png']);
loadSmartAsset('inkHeroPush',       ['assets/ink_hero_push.png']);
loadSmartAsset('inkHeroIdle',       ['assets/ink_hero_idle.png']);
loadSmartAsset('inkEnemyEye',       ['assets/ink_enemy_eye.png']);
loadSmartAsset('inkDuelTaichiSheet',  ['assets/ink_duel_taichi_sheet.png']);
loadSmartAsset('inkDuelMonsterSheet', ['assets/ink_duel_monster_sheet.png']);
loadSmartAsset('inkPool',             ['assets/ink_pool.png']);
/* v6 西湖美术（新 RAR 处理）：缺失时 IMG 键保持未定义，绘制处自动回退程序化 */
loadSmartAsset('bgXihu',      ['assets/bg_xihu.jpg'], { keepSize: true });
loadSmartAsset('fgLotus',     ['assets/fg_lotus.png']);
loadSmartAsset('fgWillow',    ['assets/fg_willow.png']);
loadSmartAsset('fxInkfall',   ['assets/fx_inkfall.png'], { keepSize: true });
loadSmartAsset('inkDuelXihuTaichiSheet',  ['assets/ink_duel_xihu_taichi_sheet.png']);
loadSmartAsset('inkDuelXihuMonsterSheet', ['assets/ink_duel_xihu_monster_sheet.png']);
loadSmartAsset('poemChars',   ['assets/poem_chars.png', 'assets/poem_chars.jpg']);
loadSmartAsset('fxBurst',     ['assets/fx_burst.png', 'assets/fx_burst.jpg']);
loadSmartAsset('fxRing',      ['assets/fx_ring.png', 'assets/fx_ring.jpg']);
loadSmartAsset('fxOrb',       ['assets/fx_orb.png', 'assets/fx_orb.jpg']);
loadSmartAsset('fxInkburst',  ['assets/fx_inkburst.png', 'assets/fx_inkburst.jpg']);
loadSmartAsset('ornament',    ['assets/ornament_corner.png', 'assets/ornament_corner.jpg']);
loadSmartAsset('cloudBar',    ['assets/cloud_bar.png', 'assets/cloud_bar.jpg']);

/* 清单7 A3 书法 / 印章：加载失败时 IMG 对应键保持未定义，绘制处自动回退文字 */
loadSmartAsset('judgeZhun', ['assets/judge_zhun.png']);
loadSmartAsset('judgeKe',   ['assets/judge_ke.png']);
loadSmartAsset('judgeLuan', ['assets/judge_luan.png']);
loadSmartAsset('combo10',   ['assets/combo_10.png']);
loadSmartAsset('combo25',   ['assets/combo_25.png']);
loadSmartAsset('combo50',   ['assets/combo_50.png']);
loadSmartAsset('combo100',  ['assets/combo_100.png']);
loadSmartAsset('sealMiao',  ['assets/seal_miao.png']);
loadSmartAsset('sealJi',    ['assets/seal_ji.png']);
loadSmartAsset('sealTian',  ['assets/seal_tian.png']);

/* ------------------------------------------------------------
   7.5 时钟：优先 AudioContext 时钟（与音乐严格同步），
        浏览器未解锁音频时自动退回 performance.now()，保证游戏照样能玩
   ------------------------------------------------------------ */
const Clock = {
  audioBase: 0,
  perfBase: 0,
  pauseAt: 0,
  start(lead) {
    this.perfBase = performance.now() + lead * 1000;
    if (AudioSys.ac) this.audioBase = AudioSys.ac.currentTime + lead;
    this.pauseAt = 0;
  },
  now() {
    const ac = AudioSys.ac;
    if (ac && ac.state === 'running' && !this.pauseAt) return ac.currentTime - this.audioBase;
    return (performance.now() - this.perfBase) / 1000;
  },
  pause() {
    this.pauseAt = performance.now();
  },
  resume() {
    if (this.pauseAt) {
      this.perfBase += performance.now() - this.pauseAt;
      this.pauseAt = 0;
    }
  }
};

/* ------------------------------------------------------------
   8. 音频系统（全部实时合成，无外部音频文件）
   ------------------------------------------------------------ */
let muted = false;

const AudioSys = {
  ac: null, master: null, noiseBuf: null, schedTimer: null,
  melodyIdx: 0, beatIdx: 0,

  init() {
    if (this.ac) {
      if (this.ac.state === 'suspended') this.ac.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ac = new AC();
    this.master = this.ac.createGain();
    this.master.gain.value = muted ? 0 : 0.55;
    this.master.connect(this.ac.destination);

    const len = Math.floor(this.ac.sampleRate * 0.3);
    this.noiseBuf = this.ac.createBuffer(1, len, this.ac.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  },

  pluck(freq, t, dur, vol) {
    if (!this.ac) return;
    dur = dur || 0.5; vol = vol == null ? 0.5 : vol;
    const o = this.ac.createOscillator(), g = this.ac.createGain(), f = this.ac.createBiquadFilter();
    o.type = 'triangle';
    o.frequency.value = freq;
    f.type = 'lowpass';
    f.frequency.value = 2600;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(f); f.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  },

  kick(t) {
    if (!this.ac) return;
    const o = this.ac.createOscillator(), g = this.ac.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.12);
    g.gain.setValueAtTime(0.85, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.25);
  },

  hat(t, vol) {
    if (!this.ac) return;
    vol = vol == null ? 0.12 : vol;
    const s = this.ac.createBufferSource(), g = this.ac.createGain(), f = this.ac.createBiquadFilter();
    s.buffer = this.noiseBuf;
    f.type = 'highpass';
    f.frequency.value = 6500;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t); s.stop(t + 0.07);
  },

  /* Karplus-Strong 拨弦（古筝感）：按频率缓存一段合成波形，反复用 */
  _ksCache: {},
  ksBuffer(freq, dur) {
    const sr = this.ac.sampleRate;
    const N = Math.max(2, Math.round(sr / freq));
    const len = Math.floor(sr * dur);
    const key = freq.toFixed(1) + ':' + dur.toFixed(2);
    if (this._ksCache[key]) return this._ksCache[key];
    const buf = this.ac.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    const ring = new Float32Array(N);
    for (let i = 0; i < N; i++) ring[i] = Math.random() * 2 - 1;
    let idx = 0;
    for (let i = 0; i < len; i++) {
      const cur = ring[idx];
      const nxt = ring[(idx + 1) % N];
      d[i] = cur;
      ring[idx] = 0.994 * 0.5 * (cur + nxt);
      idx = (idx + 1) % N;
    }
    if (Object.keys(this._ksCache).length > 24) this._ksCache = {};
    this._ksCache[key] = buf;
    return buf;
  },
  ksPluck(freq, t, dur, vol) {
    if (!this.ac) return;
    dur = dur || 0.6; vol = vol == null ? 0.4 : vol;
    const s = this.ac.createBufferSource();
    s.buffer = this.ksBuffer(freq, dur);
    const g = this.ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(g); g.connect(this.master);
    s.start(t); s.stop(t + dur + 0.05);
  },

  /* 二胡感主音：正弦 + 颤音 + 滑音（西湖曲用） */
  erhu(freq, t, dur, vol, slideFrom) {
    if (!this.ac) return;
    dur = dur || 0.7; vol = vol == null ? 0.3 : vol;
    const o = this.ac.createOscillator(), o2 = this.ac.createOscillator();
    const g = this.ac.createGain(), f = this.ac.createBiquadFilter();
    const lfo = this.ac.createOscillator(), lg = this.ac.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(slideFrom || freq, t);
    if (slideFrom && slideFrom !== freq) o.frequency.exponentialRampToValueAtTime(freq, t + 0.22);
    o2.type = 'sine';
    o2.frequency.setValueAtTime((slideFrom || freq) * 1.004, t);
    if (slideFrom && slideFrom !== freq) o2.frequency.exponentialRampToValueAtTime(freq * 1.004, t + 0.22);
    lfo.type = 'sine'; lfo.frequency.value = 5.4; lg.gain.value = freq * 0.012;
    lfo.connect(lg); lg.connect(o.frequency); lg.connect(o2.frequency);
    f.type = 'lowpass'; f.frequency.value = 2400;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.09);
    g.gain.setValueAtTime(vol, t + Math.max(0.1, dur - 0.25));
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(f); o2.connect(f); f.connect(g); g.connect(this.master);
    o.start(t); o2.start(t); lfo.start(t);
    o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
  },

  /* 水声 / 雨声底噪（西湖曲用，循环滤波噪声 + 慢速起伏） */
  _water: null,
  startWater() {
    if (!this.ac || this._water) return;
    const src = this.ac.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    const f = this.ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
    const g = this.ac.createGain(); g.gain.value = 0.0;
    g.gain.linearRampToValueAtTime(0.05, this.ac.currentTime + 2);
    const lfo = this.ac.createOscillator(), lg = this.ac.createGain();
    lfo.frequency.value = 0.07; lg.gain.value = 0.02;
    lfo.connect(lg); lg.connect(g.gain);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(); lfo.start();
    this._water = { src, g, lfo };
  },
  stopWater() {
    if (!this._water || !this.ac) return;
    try {
      const w = this._water; this._water = null;
      w.g.gain.linearRampToValueAtTime(0.0001, this.ac.currentTime + 0.4);
      setTimeout(() => { try { w.src.stop(); w.lfo.stop(); } catch (e) {} }, 600);
    } catch (e) { this._water = null; }
  },

  /* 三种操作各有音效：推掌破空 / 闪身轻拂 / 站桩低鸣 */
  actionSound(kind) {
    if (!this.ac) return;
    const t = this.ac.currentTime;
    if (kind === 'push') {
      const s = this.ac.createBufferSource(), g = this.ac.createGain(), f = this.ac.createBiquadFilter();
      s.buffer = this.noiseBuf; f.type = 'bandpass'; f.Q.value = 1.2;
      f.frequency.setValueAtTime(500, t);
      f.frequency.exponentialRampToValueAtTime(2200, t + 0.16);
      g.gain.setValueAtTime(0.16, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      s.connect(f); f.connect(g); g.connect(this.master);
      s.start(t); s.stop(t + 0.22);
      this.ksPluck(392, t, 0.3, 0.12);
    } else if (kind === 'slide') {
      const s = this.ac.createBufferSource(), g = this.ac.createGain(), f = this.ac.createBiquadFilter();
      s.buffer = this.noiseBuf; f.type = 'bandpass'; f.Q.value = 1.0;
      f.frequency.setValueAtTime(1800, t);
      f.frequency.exponentialRampToValueAtTime(500, t + 0.18);
      g.gain.setValueAtTime(0.10, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      s.connect(f); f.connect(g); g.connect(this.master);
      s.start(t); s.stop(t + 0.22);
    } else if (kind === 'hold') {
      const o = this.ac.createOscillator(), o2 = this.ac.createOscillator(), g = this.ac.createGain();
      o.type = 'sine'; o.frequency.value = 98;
      o2.type = 'sine'; o2.frequency.value = 147;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.09, t + 0.12);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      o.connect(g); o2.connect(g); g.connect(this.master);
      o.start(t); o2.start(t); o.stop(t + 0.65); o2.stop(t + 0.65);
    }
  },

  /* 连击里程碑：鼓击 + 清脆锣音 */
  gong(t, pitch) {
    if (!this.ac) return;
    pitch = pitch || 1;
    const o = this.ac.createOscillator(), o2 = this.ac.createOscillator(), g = this.ac.createGain();
    o.type = 'sine'; o.frequency.value = 220 * pitch;
    o2.type = 'sine'; o2.frequency.value = 330 * pitch;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.32, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
    o.connect(g); o2.connect(g); g.connect(this.master);
    o.start(t); o2.start(t); o.stop(t + 1.2); o2.stop(t + 1.2);
  },

  judgeSound(kind) {
    if (!this.ac) return;
    const t = this.ac.currentTime;
    if (kind === 'perfect') { this.ksPluck(1318.5, t, 0.3, 0.32); this.ksPluck(2637, t, 0.22, 0.10); }
    else if (kind === 'good') this.ksPluck(880, t, 0.25, 0.26);
    else {
      const o = this.ac.createOscillator(), g = this.ac.createGain();
      o.type = 'sawtooth';
      o.frequency.value = 110;
      g.gain.setValueAtTime(0.22, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + 0.2);
    }
  },

  startScheduler() {
    this.stopScheduler();
    this._prevDeg = 0;
    this.schedTimer = setInterval(() => {
      if (G.state !== 'playing' || !this.ac || G.paused) return;
      const spb = 60 / G.song.bpm;
      const horizon = this.ac.currentTime + 0.15;
      while (true) {
        const beat = this.melodyIdx;
        if (beat >= G.song.beats) break;
        const t = G.startAt + beat * spb;
        if (t > horizon) break;
        if (t >= this.ac.currentTime - 0.05) {
          const deg = G.song.melody[beat % G.song.melody.length]; // v6：谱面延长后旋律循环取用
          if (deg > 0) {
            const f = degreeToFreq(G.song.root, deg);
            if (G.song.xihu) {
              const prev = this._prevDeg ? degreeToFreq(G.song.root, this._prevDeg) : 0;
              this.erhu(f, t, spb * 1.9, 0.30, prev || undefined);
              this._prevDeg = deg;
              if (beat % 2 === 0) this.ksPluck(f / 2, t, spb * 1.4, 0.10);
            } else {
              this.ksPluck(f, t, spb * 1.6, 0.42);
              if (G.feverLeft > 0 && beat % 2 === 0) this.ksPluck(f * 2, t, spb * 1.2, 0.10);
            }
          }
          if (beat % 4 === 0) this.ksPluck(G.song.root / 2, t, spb * 2.2, 0.26);
        }
        this.melodyIdx++;
      }
      while (true) {
        const half = this.beatIdx;
        const t = G.startAt + half * spb / 2;
        if (t > G.startAt + G.song.beats * spb) break;
        if (t > horizon) break;
        if (t >= this.ac.currentTime - 0.05) {
          if (half % 2 === 0) this.kick(t); else this.hat(t);
        }
        this.beatIdx++;
      }
    }, 30);
  },
  stopScheduler() {
    if (this.schedTimer) { clearInterval(this.schedTimer); this.schedTimer = null; }
  }
};

const MenuBGM = {
  timer: null, step: 0, nextTime: 0,
  notes: [1, 0, 3, 0, 5, 0, 3, 2, 1, 0, 2, 0, 3, 0, 0, 0,
          6, 0, 5, 0, 3, 0, 5, 3, 2, 0, 1, 0, 2, 0, 0, 0],
  start() {
    if (this.timer || !AudioSys.ac) return;
    this.nextTime = AudioSys.ac.currentTime + 0.08;
    this.step = 0;
    this.timer = setInterval(() => this.schedule(), 110);
  },
  schedule() {
    if (!AudioSys.ac) return;
    const stepDur = 60 / 66 / 2;
    while (this.nextTime < AudioSys.ac.currentTime + 0.35) {
      const deg = this.notes[this.step % this.notes.length];
      if (deg > 0) AudioSys.pluck(degreeToFreq(196.00, deg), this.nextTime, 1.5, 0.18);
      if (this.step % 16 === 0) AudioSys.pluck(98.00, this.nextTime, 3.0, 0.14);
      if (this.step % 8 === 4) AudioSys.hat(this.nextTime, 0.025);
      this.nextTime += stepDur;
      this.step++;
    }
  },
  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }
};
