'use strict';
/* ============================================================
   fx.js  —— 特效层
   ------------------------------------------------------------
   · 太鼓达人式连击反馈：里程碑烟花、全屏闪光、连击热浪、
     判定落点墨花、金尘、剑气弧光、落枫、灵尘、龙气尾迹
   · 墨龙「绕卷轴盘旋 → 卷轴上端转到正面 → 飞出画面」的 2.5D 实现
     （不需要 3D：用「深度 z」决定 遮挡层 / 缩放 / 明暗，
       配合螺旋参数方程 + 双层绘制即可得到立体盘旋）
   ============================================================ */

const FX_LIMIT = {
  sparks: 460, ink: 260, rings: 40, slashes: 26, fireworks: 22,
  petals: 90, motes: 120, qiStream: 90, vortex: 120,
  popups: 24, milestones: 6, verses: 5, shock: 8
};

function capPush(arr, obj, limit) {
  arr.push(obj);
  if (arr.length > limit) arr.shift();
}

/* ---------------- 基础粒子 ---------------- */
function spawnSparks(x, y, count, opts) {
  opts = opts || {};
  for (let i = 0; i < count; i++) {
    const ang = opts.angle != null
      ? opts.angle + rand(-opts.spread, opts.spread)
      : rand(0, Math.PI * 2);
    const spd = rand(opts.speedMin || 90, opts.speedMax || 340);
    capPush(G.sparks, {
      x, y,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd - (opts.lift == null ? 60 : opts.lift),
      r: rand(1.2, opts.size || 3.2),
      color: opts.color || (Math.random() < 0.62 ? '#ffe894' : Math.random() < 0.5 ? '#9dffd8' : '#ffffff'),
      grav: opts.grav == null ? 240 : opts.grav,
      drag: 0.985,
      life: rand(0.32, opts.life || 0.8)
    }, FX_LIMIT.sparks);
  }
}

function spawnInk(x, y, count, opts) {
  opts = opts || {};
  for (let i = 0; i < count; i++) {
    const ang = opts.angle != null
      ? opts.angle + rand(-opts.spread, opts.spread)
      : rand(0, Math.PI * 2);
    const spd = rand(70, opts.speed || 300);
    capPush(G.ink, {
      x, y,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd - 40,
      r: rand(2, opts.size || 6),
      gold: !!opts.gold || Math.random() < 0.25,
      grav: 420,
      drag: 0.94,
      life: rand(0.4, opts.life || 0.95)
    }, FX_LIMIT.ink);
  }
}

function spawnRing(x, y, r0, r1, color, life, width) {
  capPush(G.rings, {
    x, y, r: r0, r1, color,
    life: life || 0.5, maxLife: life || 0.5,
    w: width || 2.4
  }, FX_LIMIT.rings);
}

function spawnSlash(x, y, big) {
  capPush(G.slashes, {
    x, y,
    a0: rand(-0.55, 0.55) + (Math.random() < 0.5 ? -0.35 : 0.35),
    sw: big ? 150 : 96,
    life: 0.26, maxLife: 0.26,
    big
  }, FX_LIMIT.slashes);
}

/* 烟花：太鼓达人式「连击爆发」 */
function spawnFirework(x, y, power, hue) {
  power = power || 1;
  capPush(G.fireworks, { x, y, t: 0, dur: 0.52, power, hue: hue || 0 }, FX_LIMIT.fireworks);
  spawnSparks(x, y, Math.round(20 * power), {
    speedMin: 160, speedMax: 560 * power, lift: 0,
    grav: 320, size: 4, life: 1.0
  });
  spawnInk(x, y, Math.round(7 * power), { speed: 330 * power, size: 7 });
  spawnRing(x, y, 8, 92 * power, power > 1.3 ? '#ffe9a8' : '#9dffd8', 0.62, 3);
  if (power >= 1.2) G.flash = Math.max(G.flash, 0.05 * power);
}

/* 落枫 / 灵尘氛围 */
function initAmbient() {
  G.petals.length = 0;
  for (let i = 0; i < 26; i++) {
    G.petals.push({
      x: rand(0, 3000), y: rand(0, 1400),
      vx: rand(10, 40), vy: rand(14, 40),
      rot: rand(0, Math.PI * 2), rv: rand(-1.6, 1.6),
      size: rand(3.5, 8), hue: Math.random() < 0.72 ? '#b8442a' : '#d1902f'
    });
  }
  G.motes.length = 0;
  for (let i = 0; i < 46; i++) {
    G.motes.push({
      x: rand(0, 1400), y: rand(0, 800),
      vy: rand(-26, -8), sway: rand(0, 6.28),
      r: rand(0.9, 2.3), a: rand(0.25, 0.85),
      gold: Math.random() < 0.6
    });
  }
}

/* ---------------- 命中特效套餐 ---------------- */
function fxHitPerfect(cx, cy) {
  spawnSlash(cx, cy, true);
  spawnSparks(cx, cy, 18, { speedMin: 130, speedMax: 430, lift: 40, size: 3.6, life: 0.85 });
  spawnInk(cx, cy, 8, { speed: 330, size: 7 });
  spawnRing(cx, cy, 10, 52, '#ffe9a8', 0.34, 3);
  spawnRing(cx, cy, 20, 96, 'rgba(255,215,110,0.55)', 0.52, 1.6);
  G.hitFlash = 0.28;
  G.comboPop = 1;
}

function fxHitGood(cx, cy) {
  spawnSlash(cx, cy, false);
  spawnSparks(cx, cy, 9, { speedMin: 90, speedMax: 300, lift: 40, size: 2.8, life: 0.6 });
  spawnInk(cx, cy, 4, { speed: 250, size: 5 });
  spawnRing(cx, cy, 8, 38, '#8fe9bd', 0.3, 2);
  G.hitFlash = 0.16;
  G.comboPop = Math.max(G.comboPop, 0.7);
}

function fxMiss(cx, cy) {
  spawnInk(cx, cy, 14, { speed: 260, size: 7, gold: false });
  spawnRing(cx, cy, 16, 104, 'rgba(120,120,110,0.85)', 0.6, 2);
  G.shake = Math.max(G.shake, 0.32);
  G.comboGlow = 0;
}

/* 连击里程碑：太鼓达人式分级反馈 */
function fxMilestone(combo, cx, cy) {
  let title = '', sub = '', verse = '', tier = 1, img = null;
  if (combo === 10) {
    title = '十 连'; sub = '剑意初显 · 气定神凝'; tier = 1; img = 'combo10';
  } else if (combo === 25) {
    title = '廿 五'; sub = '行云流水 · 墨随心动'; tier = 1.6; img = 'combo25';
    verse = '黄河之水天上来 · 奔流到海不复回';
  } else if (combo === 50) {
    title = '五 十'; sub = '诗剑纵横 · 破空斩芒'; tier = 2.1; img = 'combo50';
    verse = '十步杀一人 · 千里不留行';
  } else if (combo === 100) {
    title = '一 百'; sub = '天人合一 · 登峰造极'; tier = 2.8; img = 'combo100';
    verse = '大鹏一日同风起 · 扶摇直上九万里';
  } else if (combo > 100 && combo % 50 === 0) {
    title = combo + ' 连'; sub = '诗仙降世 · 气贯长虹'; tier = 2.8;
    verse = '长风破浪会有时 · 直挂云帆济沧海';
  } else if (combo % 10 === 0) {
    // 每 10 连小烟花 + 判定盘热浪，保持高频反馈
    spawnFirework(cx + rand(-120, 120), cy + rand(-140, 40), 0.6, 0.2);
    spawnComboWave(cx, cy);
    G.comboPop = 1.2;
    return;
  } else if (combo % 5 === 0) {
    spawnComboWave(cx, cy);
    G.comboPop = 1;
    return;
  } else {
    return;
  }

  G.milestones.push({ title, sub, life: 1.9, maxLife: 1.9, tier, img });
  if (G.milestones.length > FX_LIMIT.milestones) G.milestones.shift();

  if (verse) {
    G.verses.push({ text: verse, x: 0, y: 0, life: 2.6, maxLife: 2.6 });
    if (G.verses.length > FX_LIMIT.verses) G.verses.shift();
  }

  // 全屏烟花：从判定盘向外多点炸开
  spawnFirework(cx, cy, tier, 0.35);
  const n = Math.round(2 + tier * 2);
  for (let i = 0; i < n; i++) {
    setTimeout(() => {
      if (G.state !== 'playing') return;
      spawnFirework(
        Geo.CX + rand(-Layout.W * 0.34, Layout.W * 0.34),
        cy + rand(-260, 40),
        0.55 + tier * 0.18, rand(0, 1)
      );
    }, i * 90);
  }
  spawnRing(cx, cy, 20, 300 + tier * 130, 'rgba(255,225,150,0.75)', 0.85, 3.4);
  G.flash = Math.max(G.flash, 0.22 + tier * 0.06);
  G.shake = Math.max(G.shake, 0.16 + tier * 0.05);

  if (AudioSys.ac) {
    AudioSys.gong(AudioSys.ac.currentTime, 1 + tier * 0.18);
    AudioSys.pluck(392 * (1 + tier * 0.12), AudioSys.ac.currentTime + 0.06, 0.9, 0.4);
  }
}

/* 剑气 / 命中判定文字 */
function addPopup(text, color, big) {
  const cx = Geo.scroll.cx, cy = Geo.track.judgeY;
  G.popups.push({
    text, color, big: !!big,
    x: cx, y: cy - (big ? 150 : 88),
    life: big ? 1.15 : 0.7, maxLife: big ? 1.15 : 0.7
  });
  if (G.popups.length > FX_LIMIT.popups) G.popups.shift();
  G.lastJudgeText = text;
  G.lastJudgeColor = color;
  G.lastJudgeAt = G.songTime;
}

function spawnProjectile(enemyIdx) {
  const e = G.enemies[enemyIdx];
  if (!e) return;
  const pos = enemyAnchor(enemyIdx);
  G.projectiles.push({
    x: Geo.hero.x + 30, y: Geo.hero.y - 76,
    tx: pos.x, ty: pos.y - 18,
    t: 0, dur: 0.3, enemyIdx
  });
}

function spawnPurification(x, y) {
  for (let i = 0; i < 16; i++) {
    const a = rand(0, Math.PI * 2), s = rand(50, 200);
    G.purifications.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      r: rand(1.8, 4.5), gold: Math.random() > 0.35, life: 0.65
    });
  }
}

function spawnComboWave(cx, cy) {
  G.comboWaves.push({ x: cx, y: cy, r: 12, life: 0.9 });
}

function spawnWindBlades(dir, x, y) {
  for (let i = 0; i < 6; i++) {
    G.windBlades.push({
      x: x + rand(-26, 26), y: y + rand(-30, 30),
      vx: dir * rand(320, 700),
      len: rand(70, 150),
      angle: (dir > 0 ? 0.06 : Math.PI - 0.06) + rand(-0.28, 0.28),
      life: 0.42
    });
  }
}

/* ---------------- 每帧更新 ---------------- */
function updateFx(dt, now) {
  // 火花
  for (const p of G.sparks) {
    p.vy += p.grav * dt;
    p.vx *= p.drag; p.vy *= p.drag;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.life -= dt;
  }
  G.sparks = G.sparks.filter(p => p.life > 0);

  // 墨点
  for (const p of G.ink) {
    p.vy += p.grav * dt;
    p.vx *= p.drag; p.vy *= p.drag;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.life -= dt;
  }
  G.ink = G.ink.filter(p => p.life > 0);

  for (const r of G.rings) {
    const t = 1 - r.life / r.maxLife;
    r.r = lerp(r.r, r.r1, 1 - Math.pow(1 - t, 2.2));
    r.life -= dt;
  }
  G.rings = G.rings.filter(r => r.life > 0);

  G.slashes = G.slashes.filter(s => (s.life -= dt) > 0);

  for (const f of G.fireworks) f.t += dt;
  G.fireworks = G.fireworks.filter(f => f.t < f.dur);

  for (const cw of G.comboWaves) { cw.r += 700 * dt; cw.life -= dt; }
  G.comboWaves = G.comboWaves.filter(c => c.life > 0);

  for (const wb of G.windBlades) { wb.x += wb.vx * dt; wb.life -= dt; }
  G.windBlades = G.windBlades.filter(w => w.life > 0);

  // 打击投射（太极气弹飞向小怪）
  for (const p of G.projectiles) {
    p.t += dt / p.dur;
    p.x = lerp(Geo.hero.x + 30, p.tx, p.t);
    p.y = lerp(Geo.hero.y - 76, p.ty, p.t) - Math.sin(p.t * Math.PI) * 46;
    if (p.t >= 1) {
      spawnPurification(p.tx, p.ty);
      const e = G.enemies[p.enemyIdx];
      if (e) e.flash = 0.34;
    }
  }
  G.projectiles = G.projectiles.filter(p => p.t < 1);

  for (const p of G.purifications) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt * 1.4; }
  G.purifications = G.purifications.filter(p => p.life > 0);

  // 吐纳涡流
  for (const v of G.vortex) {
    v.angle += dt * v.dir * 7.5;
    v.radius -= v.speed * dt;
    v.x = Geo.scroll.cx + Math.cos(v.angle) * v.radius;
    v.y = Geo.track.judgeY + Math.sin(v.angle) * v.radius * 0.9;
    v.life -= dt * 1.9;
  }
  G.vortex = G.vortex.filter(v => v.life > 0 && v.radius > 4);


  // 判定弹字
  for (const p of G.popups) { p.y -= dt * 42; p.life -= dt; }
  G.popups = G.popups.filter(p => p.life > 0);

  for (const m of G.milestones) { m.life -= dt; }
  G.milestones = G.milestones.filter(m => m.life > 0);

  for (const v of G.verses) { v.life -= dt; }
  G.verses = G.verses.filter(v => v.life > 0);

  // 连击热度与弹跳衰减
  G.comboPop = Math.max(0, G.comboPop - dt * 4.2);
  G.hitFlash = Math.max(0, G.hitFlash - dt * 3.4);
  G.flash = Math.max(0, G.flash - dt * 2.2);
  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 1.6);
  const target = clamp(G.combo / 60, 0, 1);
  G.comboGlow += (target - G.comboGlow) * Math.min(1, dt * 3);

  // 环境
  const W = Layout.W, H = Layout.H;
  for (const p of G.petals) {
    p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.rv * dt;
    if (p.y > H + 30) { p.y = -30; p.x = rand(-40, W + 40); }
    if (p.x > W + 40) p.x = -40;
  }
  for (const m of G.motes) {
    m.y += m.vy * dt; m.sway += dt * 1.3; m.x += Math.sin(m.sway) * 12 * dt;
    if (m.y < -12) { m.y = H + 12; m.x = rand(0, W); }
  }

  // 连击越高，判定区洒落的光尘越密（太鼓达人式递增）
  if (G.state === 'playing' && !G.paused && G.combo > 4 && Math.random() < dt * (6 + G.comboGlow * 40)) {
    capPush(G.sparks, {
      x: Geo.scroll.cx + rand(-90, 90),
      y: Geo.track.judgeY - rand(0, 30),
      vx: rand(-40, 40), vy: rand(-260, -90),
      r: rand(1, 2.6),
      color: G.feverLeft > 0 ? '#ffe9a8' : (Math.random() < 0.6 ? '#ffd76e' : '#9dffd8'),
      grav: -30, drag: 0.99, life: rand(0.4, 0.9)
    }, FX_LIMIT.sparks);
  }
}

/* ============================================================
   墨龙 2.5D
   ------------------------------------------------------------
   螺旋参数方程：theta(p) => x = cx + cos(theta)*R, z = sin(theta)
   z>0 在卷轴前方（放大一点、更亮），z<0 在卷轴后方（被卷轴挡住）
   ============================================================ */
/* ============================================================
   水墨比武：天人合一时的卷轴两侧小人比武（替代墨龙）。
   左侧白墨太极（小道童推掌）vs 右侧黑墨亚健康（熬夜黑眼圈），
   白对黑即阴阳；全程只占卷轴两侧边距（左 x<285、右 x>675），
   不碰卷轴、音符与判定盘；3.9 秒：出墨 → 上升比武 → 亚健康化墨落败 → 太极独自上升消散。
   立绘 v1 复用现有 hero/enemy 贴图，由 PIL 预转水墨版
   （灰度+对比+明暗：太极提亮成白墨、亚健康压暗成黑墨；file:// 下
   画布取像素会被污染，故不做运行时转制，改走预转文件），
   专属水墨立绘（ink_duel_taichi / ink_duel_taichi_idle / ink_duel_monster）
   到货后自动顶替，无图时画简笔水墨剪影兜底，永不缺图。
   v2：条带帧序列（太极 8 格 / 怪物 6 格，一次生成、等宽切片）优先于单帧；
   光柱加亮加宽、墨池多层墨渍、命中笔触、化墨碎裂粒子、推掌风声与落败重音。
   v3：站位改自适应（跟随卷轴/世界宽，窄窗口不再出界）；身高收至 104/94（头躲开顶部 HUD）；
   上升只在出墨（从池底升起 100px）；比武不动；落败/离场一律下沉回池，永不飞出屏。
   v4（回城式）：两人从底部两侧墨池出墨，全程缓慢上升边升边打（脚 470→235）；
   怪 2.6 秒落败化墨（墨滴落回墨池 + 黑雾）；太极独自升至脚 175 并在 HUD 线前消散，
   绝不飞出屏；光束加金边、上升花瓣/墨点、命中金闪 + 冲击波环、中央卷轴底加墨池。
   v6：中央墨池上移至 505（触屏按钮上方，完整可见）+ 墨道连通卷轴底。
   ============================================================ */
// 中央墨池中心 y（v6：505，触屏按钮世界 y 约 526 之上，桌面与手机都完整可见）
const INK_POOL_Y = 505;
const Duel = {
  DUR: 3.9,
  POOL_Y: 470, T_H: 122, M_H: 110,  // 回城式：脚线在触屏按钮上方，终点脚 175（头约 71，HUD 线下方）
  // 站位自适应（v3 教训：固定 LX/RX 在窄窗口会出界）
  positions() {
    const sc = (typeof Geo !== 'undefined' && Geo.scroll) || { left: 310, w: 340 };
    const W = (typeof Layout !== 'undefined' && Layout.W) || 960;
    const scL = sc.left, scR = sc.left + sc.w;
    const LX = clamp(scL - 52, 40, W - 40);
    const RX = clamp(scR + 52, 40, W - 40);
    return { LX, RX, scL, scR, W };
  },
  _fx: null,                   // { lastNow, lastCyc, defeatRung, drops[], ripples[], rings[], strokes[], flashes[], mists[], rise[], lastCentralRipple }

  active() {
    if (G.state !== 'playing') return false;
    const t = G.songTime - G.duelT;
    return t >= 0 && t <= this.DUR;
  },

  start() {
    G.duelT = Math.max(G.songTime, G.duelT);
    this._fx = { lastNow: 0, lastCyc: -1, defeatRung: false, drops: [], ripples: [], rings: [], strokes: [], flashes: [], mists: [], rise: [], lastCentralRipple: -1 };
  },

  _sheets: null,  // Map<img, canvas[]> 条带切片缓存（等宽切，无取像素，不怕 file:// 污染）

  sheetFrames(img, n) {
    if (!img || !img.width || !img.height || !n) return null;
    if (!this._sheets) this._sheets = new Map();
    let frames = this._sheets.get(img);
    if (frames) return frames;
    try {
      const fw = img.width / n, fh = img.height;
      frames = [];
      for (let i = 0; i < n; i++) {
        const cv = document.createElement('canvas');
        cv.width = fw; cv.height = fh;
        cv.getContext('2d').drawImage(img, i * fw, 0, fw, fh, 0, 0, fw, fh);
        frames.push(cv);
      }
    } catch (err) { return null; }
    this._sheets.set(img, frames);
    return frames;
  },

  // 西湖关用新条带（10/5 格）当且仅当两张新表都已加载；否则回退旧条带（8/6 格）
  xihuSheets() {
    return !!(typeof G !== 'undefined' && G.song && G.song.xihu && IMG.inkDuelXihuTaichiSheet && IMG.inkDuelXihuMonsterSheet);
  },

  // 条带帧号（回城式时序）：太极 8 格（4=推掌命中格）/ 西湖 10 格（5=推掌命中格）、怪物 6 格（0站立/1后仰1/2后仰2/3化墨1/4化墨2/5余烬）/ 西湖 5 格（0站立/1后仰1/2后仰2/3化墨1/4化墨2余烬）
  taichiIdx(t, cyc) {
    const n = this.xihuSheets() ? 10 : 8;
    if (t < 0.5) return 0;
    if (t < 2.60) return Math.min(n - 1, Math.floor(cyc / 0.55 * n));
    return n - 1;
  },

  monsterIdx(t, pushing, pushK, defeat) {
    if (t < 2.60) return pushing ? (pushK > 0.5 ? 2 : 1) : 0;
    if (this.xihuSheets()) return 3 + Math.min(1, Math.floor(defeat * 2));
    return 3 + Math.min(2, Math.floor(defeat * 3));
  },

  taichiImg(pushing, idx) {
    if (this.xihuSheets()) {
      const xs = this.sheetFrames(IMG.inkDuelXihuTaichiSheet, 10);
      if (xs) return xs[idx];
    }
    const sheet = this.sheetFrames(IMG.inkDuelTaichiSheet, 8);
    if (sheet) return sheet[idx];
    if (pushing && IMG.inkDuelTaichi) return IMG.inkDuelTaichi;
    if (!pushing && IMG.inkDuelTaichiIdle) return IMG.inkDuelTaichiIdle;
    if (pushing && IMG.inkHeroPush) return IMG.inkHeroPush;
    if (!pushing && IMG.inkHeroIdle) return IMG.inkHeroIdle;
    return pushing ? (IMG.hero_push || IMG.hero_idle) : (IMG.hero_idle || IMG.hero_push);
  },

  _lifted: null,  // Map<img, canvas> 黑墨提亮缓存（黑底游戏里黑墨看不见，提亮一次复用）
  lifted(img) {
    if (!img) return img;
    if (!this._lifted) this._lifted = new Map();
    let cv = this._lifted.get(img);
    if (cv) return cv;
    try {
      cv = document.createElement('canvas');
      cv.width = img.width; cv.height = img.height;
      const g = cv.getContext('2d');
      g.drawImage(img, 0, 0);
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = 'rgba(210,210,210,0.48)';
      g.fillRect(0, 0, cv.width, cv.height);
    } catch (err) { return img; }
    this._lifted.set(img, cv);
    return cv;
  },

  monsterImg(idx) {
    if (this.xihuSheets()) {
      const xs = this.sheetFrames(IMG.inkDuelXihuMonsterSheet, 5);
      if (xs) return this.lifted(xs[idx]);
    }
    const sheet = this.sheetFrames(IMG.inkDuelMonsterSheet, 6);
    if (sheet) return this.lifted(sheet[idx]);
    if (IMG.inkDuelMonster) return this.lifted(IMG.inkDuelMonster);
    if (IMG.inkEnemyEye) return this.lifted(IMG.inkEnemyEye);
    return this.lifted(IMG.enemy_eye || IMG.enemy_waist);
  },

  sfx(fn) {
    try {
      if (typeof AudioSys !== 'undefined' && AudioSys.ac) fn(AudioSys.ac.currentTime);
    } catch (err) { /* 静音环境忽略 */ }
  },

  /* 简笔水墨剪影兜底（立绘全缺时）：太极圆头道袍推掌、亚健康墨团黑眼圈 */
  drawTaichiFallback(x, feetY, h, lean, alpha) {
    ctx.save(); ctx.translate(x, feetY); ctx.rotate(lean); ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(235,232,220,0.92)'; ctx.strokeStyle = 'rgba(235,232,220,0.92)';
    ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, -h * 0.88, h * 0.11, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, -h * 0.76); ctx.lineTo(-h * 0.16, 0); ctx.lineTo(h * 0.16, 0); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, -h * 0.55); ctx.lineTo(h * 0.30, -h * 0.45); ctx.stroke();
    ctx.restore();
  },

  drawMonsterFallback(x, feetY, h, lean, alpha) {
    ctx.save(); ctx.translate(x, feetY); ctx.rotate(lean); ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(38,40,42,0.92)';
    ctx.beginPath(); ctx.arc(0, -h * 0.45, h * 0.42, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0d0e10';
    ctx.beginPath(); ctx.arc(-h * 0.16, -h * 0.55, h * 0.13, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(h * 0.16, -h * 0.55, h * 0.13, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  },

  draw(now) {
    const t = G.songTime - G.duelT;
    if (t < 0 || t > this.DUR) return;
    if (!this._fx) this.start();
    const fx = this._fx;

    // 粒子 dt（用渲染 now 推算，卡顿封顶）
    let dt = 0;
    if (fx.lastNow) dt = clamp((now - fx.lastNow) / 1000, 0, 0.05);
    fx.lastNow = now;

    const pos = this.positions();
    const sc = (typeof Geo !== 'undefined' && Geo.scroll) || { left: 310, w: 340, cx: 480 };
    const poolY = this.POOL_Y;

    /* ---- 回城式时序：0-0.5 出墨 / 0.5-2.6 上升比武 / 2.6 落败化墨 / 2.6-3.9 独自上升消散 ---- */
    const emergeA = clamp(t / 0.5, 0, 1);
    const endA = 1 - clamp((t - 3.4) / 0.5, 0, 1);
    const effA = emergeA * endA;
    const sparT = t - 0.5;
    const cyc = sparT >= 0 ? sparT % 0.55 : 0;
    // 推掌窗口 [0.20, 0.40]，峰值 0.30 正对条带第 4 格（推掌命中格）
    const pushing = sparT >= 0 && sparT < 2.1 && cyc >= 0.20 && cyc < 0.40;
    const pushK = pushing ? Math.sin(Math.PI * (cyc - 0.20) / 0.20) : 0;
    const defeat = clamp((t - 2.6) / 0.6, 0, 1);
    const smooth = p => p * p * (3 - 2 * p);

    // 脚部高度：出墨在池线；比武期平滑上升 470→235；独舞期缓升 235→175 并消散
    let tFeet, tScale, tAlpha;
    // 全程缓慢持续上升：出墨 470 → 比武期末 240 → 独舞期末 168（头顶仍在 HUD 线下）
    if (t < 0.5) {
      tFeet = poolY; tScale = 0.6 + 0.4 * emergeA; tAlpha = emergeA;
    } else if (t < 2.6) {
      tFeet = poolY - 230 * smooth((t - 0.5) / 2.1); tScale = 1; tAlpha = 1;
    } else {
      const p = 1 - Math.pow(1 - clamp((t - 2.6) / 1.3, 0, 1), 3);
      tFeet = 240 - 72 * p; tScale = 1 - 0.08 * p;
      tAlpha = 1 - clamp((t - 3.15) / 0.7, 0, 1);  // 3.85 前归零，HUD 线前消散
    }
    const riseP = t < 0.5 ? 0 : (t < 2.6 ? smooth((t - 0.5) / 2.1) : 1);
    // 怪：2.6 秒落败后沉回墨池化墨，不再停留在半空
    const mFeet = t < 2.6 ? poolY - 230 * riseP : 240 + (poolY - 240) * smooth(clamp((t - 2.6) / 0.6, 0, 1));
    const mScale = (t < 0.5 ? 0.6 + 0.4 * emergeA : 1) * (1 - 0.08 * clamp(sparT / 2.1, 0, 1)) * (1 - 0.15 * defeat);
    const mAlpha = emergeA * (1 - defeat) * (1 - 0.12 * pushK);
    const tX = pos.LX + pushK * 18, tLean = pushK * 0.08;
    const mX = pos.RX + pushK * 14, mLean = -pushK * 0.10;
    const tIdx = this.taichiIdx(t, cyc);
    const mIdx = this.monsterIdx(t, pushing, pushK, defeat);
    const mBodyY = mFeet - this.M_H * mScale * 0.5;
    const tBodyY = tFeet - this.T_H * tScale * 0.55;

    // 推掌命中瞬间（cyc 越过 0.30）：怪物处金色闪光 + 冲击波环 + 溅墨 + 笔触 + 掌风音
    if (fx.lastCyc < 0.30 && cyc >= 0.30 && sparT >= 0 && sparT < 2.1) {
      fx.flashes.push({ x: mX, y: mBodyY, r0: 18, life: 0.45, maxLife: 0.45 });
      fx.rings.push({ x: mX, y: mBodyY, r: 14, vr: 170, life: 0.6, maxLife: 0.6, gold: true });
      for (let i = 0; i < 10; i++) {
        fx.drops.push({
          x: mX + rand(-24, 24), y: mFeet - rand(20, 110),
          vx: rand(-70, 70), vy: rand(-110, -30),
          r: rand(3, 8), dark: true, life: rand(0.4, 0.8), maxLife: 0.8,
        });
      }
      for (let i = 0; i < 2; i++) {
        const a0 = rand(-0.6, 0.9);
        fx.strokes.push({
          x: mX - rand(20, 90), y: mFeet - rand(30, 120),
          r: rand(22, 48), a0, a1: a0 + rand(0.8, 1.6), life: 0.5, maxLife: 0.5,
        });
      }
      this.sfx(tm => { AudioSys.hat(tm, 0.10); });
    }
    fx.lastCyc = cyc;
    // 落败瞬间：太极处金环 + 怪物处墨环 + 化墨碎裂 + 黑雾 + 重音
    if (defeat > 0.05 && !fx.defeatRung) {
      fx.defeatRung = true;
      fx.rings.push({ x: tX, y: tBodyY, r: 16, vr: 130, life: 0.7, maxLife: 0.7, gold: true });
      fx.rings.push({ x: mX, y: mBodyY, r: 12, vr: 100, life: 0.6, maxLife: 0.6, gold: false });
      for (let i = 0; i < 24; i++) {
        fx.drops.push({
          x: mX + rand(-45, 45), y: mFeet - rand(0, 90),
          vx: rand(-60, 60), vy: rand(20, 150),
          r: rand(3, 10), dark: true, life: rand(0.6, 1.2), maxLife: 1.2,
        });
      }
      for (let i = 0; i < 5; i++) {
        fx.mists.push({
          x: mX + rand(-35, 35), y: mBodyY + rand(-30, 30),
          r: rand(22, 40), life: rand(0.7, 1.0), maxLife: 1.0,
        });
      }
      this.sfx(tm => { AudioSys.kick(tm); AudioSys.gong(tm, 1); });
    }
    // 化墨持续：落败过程中怪物身体不断掉墨粒
    if (defeat > 0 && defeat < 0.8 && Math.random() < dt * 30) {
      fx.drops.push({
        x: mX + rand(-40, 40), y: mFeet - rand(0, 85),
        vx: rand(-30, 30), vy: rand(20, 120),
        r: rand(2, 6), dark: true, life: rand(0.5, 0.9), maxLife: 0.9,
      });
    }
    // 出墨瞬间：两侧脚下涟漪 + 从池中升起的墨滴 + 风声
    if (t < 0.1 && fx.ripples.length === 0) {
      fx.ripples.push({ x: pos.LX, y: poolY + 6, r: 16, life: 0.6, maxLife: 0.6 });
      fx.ripples.push({ x: pos.RX, y: poolY + 6, r: 16, life: 0.6, maxLife: 0.6 });
      for (const px of [pos.LX, pos.RX]) {
        for (let i = 0; i < 8; i++) {
          fx.drops.push({
            x: px + rand(-30, 30), y: poolY + rand(-10, 10),
            vx: rand(-40, 40), vy: rand(-150, -50),
            r: rand(2, 5), dark: px === pos.RX, life: rand(0.4, 0.7), maxLife: 0.7,
          });
        }
      }
      this.sfx(tm => { AudioSys.hat(tm, 0.12); });
    }
    // 中央墨池涟漪（打斗期间约 0.7 秒一圈）
    if (t > 0.2 && t - fx.lastCentralRipple > 0.7) {
      fx.lastCentralRipple = t;
      fx.ripples.push({ x: sc.cx, y: INK_POOL_Y, r: 24, life: 0.9, maxLife: 0.9 });
    }
    // 上升花瓣 / 墨点（持续生成，随人物上升）
    if (t >= 0.5 && t < 3.2 && Math.random() < dt * 18) {
      const side = (t < 2.6 && Math.random() < 0.35) ? 'm' : 't';
      const bx = side === 'm' ? mX : tX;
      const by = side === 'm' ? mFeet : tFeet;
      const gold = side === 't' || Math.random() < 0.55;
      fx.rise.push({
        x: bx + rand(-42, 42), y: by - rand(0, 90),
        vx: rand(-12, 12), vy: rand(-70, -30),
        r: rand(2.5, 5.5), rot: rand(0, Math.PI * 2), vr: rand(-2.5, 2.5),
        seed: rand(0, Math.PI * 2), life: rand(0.8, 1.4), maxLife: 1.4,
        kind: gold ? 'petal' : 'ink',
        hue: gold ? (Math.random() < 0.6 ? '#ffd76e' : (Math.random() < 0.5 ? 'rgba(255,250,230,0.9)' : 'rgba(255,190,200,0.85)')) : null,
      });
    }
    // 中央墨池上升墨滴（只升不落，近卷轴底边，不碰判定区）
    if (t > 0.2 && t < 3.4 && Math.random() < dt * 6) {
      fx.drops.push({
        x: sc.cx + rand(-90, 90), y: INK_POOL_Y + 2,
        vx: rand(-8, 8), vy: rand(-70, -35),
        r: rand(2, 4.5), dark: true, life: rand(0.7, 1.1), maxLife: 1.1, c: true,
      });
    }

    // 粒子推进（中央墨滴只升不落；其余墨滴重力下落；进卷轴区即灭，绝不遮挡主界面）
    for (const d of fx.drops) {
      if (d.c) { d.x += d.vx * dt; d.y += d.vy * dt; }
      else { d.vy += 300 * dt; d.x += d.vx * dt; d.y += d.vy * dt; }
      d.life -= dt;
    }
    fx.drops = fx.drops.filter(d => d.life > 0 && (d.c || (d.y < 560 && !(d.x > pos.scL && d.x < pos.scR))));
    if (fx.drops.length > 110) fx.drops.splice(0, fx.drops.length - 110);
    for (const s of fx.strokes) { s.life -= dt; }
    fx.strokes = fx.strokes.filter(s => s.life > 0);
    for (const r of fx.ripples) { r.r += 70 * dt; r.life -= dt; }
    fx.ripples = fx.ripples.filter(r => r.life > 0);
    for (const r of fx.rings) { r.r += r.vr * dt; r.life -= dt; }
    fx.rings = fx.rings.filter(r => r.life > 0);
    for (const f of fx.flashes) { f.life -= dt; }
    fx.flashes = fx.flashes.filter(f => f.life > 0);
    for (const m of fx.mists) { m.life -= dt; m.y -= 12 * dt; }
    fx.mists = fx.mists.filter(m => m.life > 0);
    for (const p of fx.rise) {
      p.x += (p.vx + Math.sin(now * 2.5 + p.seed) * 10) * dt;
      p.y += p.vy * dt; p.rot += p.vr * dt; p.life -= dt;
    }
    fx.rise = fx.rise.filter(p => p.life > 0 && p.y > 70);
    if (fx.rise.length > 70) fx.rise.splice(0, fx.rise.length - 70);

    /* ---- 随身辉光（跟着人走的柔光，替代全高光柱；柱子已删） ---- */
    for (const [gx, gy, gold, rr, a] of [[tX, tBodyY, true, 92, 0.38], [mX, mBodyY, false, 88, 0.28]]) {
      const g = ctx.createRadialGradient(gx, gy, 4, gx, gy, rr);
      if (gold) { g.addColorStop(0, `rgba(255,226,150,${a * effA})`); g.addColorStop(1, 'rgba(255,226,150,0)'); }
      else { g.addColorStop(0, `rgba(190,215,255,${a * effA})`); g.addColorStop(1, 'rgba(190,215,255,0)'); }
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(gx, gy, rr, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    /* ---- 两侧墨池（脚下：有手绘墨池图时用图，离场时才淡出） ---- */
    for (const px of [pos.LX, pos.RX]) {
      if (IMG.inkPool) {
        ctx.save(); ctx.globalAlpha = effA;
        ctx.drawImage(IMG.inkPool, px - 85, poolY + 6 - 18, 170, 36);
        ctx.restore();
      } else {
        const blobs = [[0, 0, 72, 15, 0.50], [-28, 3, 44, 10, 0.35], [30, -2, 40, 9, 0.25]];
        for (const [ox, oy, rx, ry, a] of blobs) {
          const g = ctx.createRadialGradient(px + ox, poolY + 6 + oy, 2, px + ox, poolY + 6 + oy, rx);
          g.addColorStop(0, `rgba(22,26,24,${a * effA})`);
          g.addColorStop(1, 'rgba(22,26,24,0)');
          ctx.save(); ctx.fillStyle = g;
          ctx.beginPath(); ctx.ellipse(px + ox, poolY + 6 + oy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
        for (const [ox, oy, r] of [[-58, -4, 3], [62, 2, 2.5], [-40, 8, 2], [48, 7, 2.5]]) {
          ctx.save(); ctx.globalAlpha = 0.6 * effA; ctx.fillStyle = 'rgba(22,26,24,0.9)';
          ctx.beginPath(); ctx.arc(px + ox, poolY + 6 + oy, r, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
      }
    }

    /* ---- 中央墨池（卷轴底边：与两侧墨池同源，打斗期间把中央和两侧连起来） ---- */
    {
      const cx0 = sc.cx, cy0 = 588;
      ctx.save(); ctx.globalAlpha = effA;
      const halo = ctx.createRadialGradient(cx0, cy0, 4, cx0, cy0, 140);
      halo.addColorStop(0, 'rgba(20,26,22,0.30)');
      halo.addColorStop(1, 'rgba(20,26,22,0)');
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(cx0, cy0, 140, 0, Math.PI * 2); ctx.fill();
      ctx.save(); ctx.translate(cx0, cy0); ctx.scale(1, 26 / 125);
      const mg = ctx.createRadialGradient(0, 0, 4, 0, 0, 125);
      mg.addColorStop(0, 'rgba(12,16,13,0.85)');
      mg.addColorStop(0.75, 'rgba(12,16,13,0.55)');
      mg.addColorStop(1, 'rgba(12,16,13,0)');
      ctx.fillStyle = mg;
      ctx.beginPath(); ctx.arc(0, 0, 125, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,215,110,0.20)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, 0, 125, Math.PI, Math.PI * 2); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = 'rgba(22,26,24,0.9)';
      for (const [ox, oy, r] of [[-88, -3, 3], [76, 2, 2.5], [-52, 5, 2], [96, -2, 2.5], [0, 7, 2]]) {
        ctx.beginPath(); ctx.arc(cx0 + ox, cy0 + oy, r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    for (const r of fx.ripples) {
      ctx.save(); ctx.globalAlpha = (r.life / r.maxLife) * 0.5 * effA;
      ctx.strokeStyle = 'rgba(30,34,32,0.8)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(r.x, r.y, r.r, r.r * 0.22, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    /* ---- 怪物身后月光盘（黑墨在黑底上看不见，垫一层柔光才读得出形） ---- */
    {
      const dX = mX, dY = mFeet - this.M_H * mScale * 0.45;
      const g = ctx.createRadialGradient(dX, dY, 4, dX, dY, 72);
      g.addColorStop(0, `rgba(235,238,230,${0.16 * effA * (1 - defeat)})`);
      g.addColorStop(1, 'rgba(235,238,230,0)');
      ctx.save(); ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(dX, dY, 72, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    /* ---- 两个小人（回城式上升：全程边升边打，消散收尾，永不飞出屏） ---- */
    // 独舞期金色上升光晕（白墨在浅色天光里看不清，垫一层金光才读得出“金光中回城”）
    if (t > 2.6 && tAlpha > 0) {
      const ag = ctx.createRadialGradient(tX, tBodyY, 4, tX, tBodyY, 78);
      ag.addColorStop(0, `rgba(255,226,150,${0.30 * tAlpha})`);
      ag.addColorStop(1, 'rgba(255,226,150,0)');
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = ag;
      ctx.beginPath(); ctx.arc(tX, tBodyY, 78, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // 白墨在浅色天光里发虚：身后先垫一层暗晕再画人（v6：新 10 格条带线条更淡，暗晕 0.30→0.42）
    if (tAlpha > 0) {
      const hg = ctx.createRadialGradient(tX, tBodyY, 4, tX, tBodyY, 84);
      hg.addColorStop(0, `rgba(18,24,18,${0.42 * tAlpha})`);
      hg.addColorStop(1, 'rgba(18,24,18,0)');
      ctx.save(); ctx.fillStyle = hg;
      ctx.beginPath(); ctx.arc(tX, tBodyY, 84, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    const tImg = this.taichiImg(pushing, tIdx);
    const tH = this.T_H * tScale, tW = tImg ? tH * tImg.width / tImg.height : 120;
    if (tImg) {
      ctx.save(); ctx.globalAlpha = tAlpha; ctx.translate(tX, tFeet); ctx.rotate(tLean);
      ctx.shadowColor = 'rgba(20,26,20,0.85)'; ctx.shadowBlur = 18;
      ctx.drawImage(tImg, -tW / 2, -tH, tW, tH); ctx.restore();
    } else this.drawTaichiFallback(tX, tFeet, tH, tLean, tAlpha);

    const mImg = this.monsterImg(mIdx);
    const mH = this.M_H * mScale, mW = mImg ? mH * mImg.width / mImg.height : 100;
    if (mImg) {
      ctx.save(); ctx.globalAlpha = mAlpha; ctx.translate(mX, mFeet); ctx.rotate(mLean);
      ctx.drawImage(mImg, -mW / 2, -mH, mW, mH); ctx.restore();
    } else this.drawMonsterFallback(mX, mFeet, mH, mLean, mAlpha);

    /* ---- 推掌风弧（太极掌风，只伸到左区边缘，不进卷轴） ---- */
    if (pushK > 0.02) {
      const arcR = Math.min(30 + pushK * 55, Math.max(12, pos.scL - (tX + 44) - 5));
      ctx.save(); ctx.globalAlpha = 0.30 * pushK * effA;
      ctx.strokeStyle = 'rgba(240,240,235,0.9)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(tX + 44, tFeet - 60, arcR, -0.5, 0.9); ctx.stroke();
      ctx.restore();
    }

    /* ---- 墨笔触（命中时怪物身边的横扫墨痕，0.5 秒淡出） ---- */
    for (const s of fx.strokes) {
      ctx.save(); ctx.globalAlpha = (s.life / s.maxLife) * 0.55 * effA;
      ctx.strokeStyle = 'rgba(25,28,26,0.9)'; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, s.a0, s.a1); ctx.stroke();
      ctx.restore();
    }

    /* ---- 墨滴与环 ---- */
    for (const d of fx.drops) {
      ctx.save(); ctx.globalAlpha = clamp(d.life / d.maxLife, 0, 1) * 0.85 * effA;
      ctx.fillStyle = d.dark ? 'rgba(25,28,26,0.9)' : 'rgba(235,232,220,0.9)';
      ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    for (const r of fx.rings) {
      ctx.save(); ctx.globalAlpha = (r.life / r.maxLife) * 0.7 * effA;
      ctx.strokeStyle = r.gold ? 'rgba(255,220,130,0.9)' : 'rgba(30,34,32,0.9)';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    /* ---- 命中金色闪光 ---- */
    for (const f of fx.flashes) {
      const k = f.life / f.maxLife;
      const rr = f.r0 + (1 - k) * 34;
      const g = ctx.createRadialGradient(f.x, f.y, 1, f.x, f.y, rr);
      g.addColorStop(0, `rgba(255,250,228,${0.95 * k})`);
      g.addColorStop(0.45, `rgba(255,226,150,${0.55 * k})`);
      g.addColorStop(1, 'rgba(255,200,90,0)');
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(f.x, f.y, rr, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    /* ---- 化墨黑雾 ---- */
    for (const m of fx.mists) {
      const k = m.life / m.maxLife;
      const g = ctx.createRadialGradient(m.x, m.y, 2, m.x, m.y, m.r);
      g.addColorStop(0, `rgba(15,18,16,${0.55 * k})`);
      g.addColorStop(1, 'rgba(15,18,16,0)');
      ctx.save(); ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    /* ---- 上升花瓣 / 墨点 ---- */
    for (const p of fx.rise) {
      const k = p.life / p.maxLife;
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      if (p.kind === 'petal') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = k * 0.85 * effA;
        ctx.fillStyle = p.hue;
        ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * 0.52, 0, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.globalAlpha = k * 0.8 * effA;
        ctx.fillStyle = 'rgba(25,28,26,0.9)';
        ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  }
};

/* ============================================================
   卷轴墨瀑 + 底部墨池（常态淡淡一层，天人合一全开；不遮音符）
   ============================================================ */
/* v11.1：fx_inkfall 的中间竖条直接 multiply 上去是一根硬边黑柱（截图里就是两条贴上去的黑条）。
   这里先切出中间一条，再横竖双向羽化，做成一条真正「化进纸里」的墨瀑。 */
const InkFall = { made: false, canvas: null };
function inkFallStrip() {
  if (InkFall.made) return InkFall.canvas;
  InkFall.made = true;
  const img = IMG.fxInkfall;
  if (!img) return (InkFall.canvas = null);
  const W = 96, H = 768;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const sw = img.width * 0.3, sx0 = (img.width - sw) / 2;
  g.drawImage(img, sx0, 0, sw, img.height, 0, 0, W, H);
  // 横向羽化：两侧化开
  g.globalCompositeOperation = 'destination-in';
  let lg = g.createLinearGradient(0, 0, W, 0);
  lg.addColorStop(0, 'rgba(0,0,0,0)');
  lg.addColorStop(0.32, 'rgba(0,0,0,0.85)');
  lg.addColorStop(0.5, 'rgba(0,0,0,1)');
  lg.addColorStop(0.68, 'rgba(0,0,0,0.85)');
  lg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = lg; g.fillRect(0, 0, W, H);
  // 纵向羽化：上下淡出
  lg = g.createLinearGradient(0, 0, 0, H);
  lg.addColorStop(0, 'rgba(0,0,0,0)');
  lg.addColorStop(0.14, 'rgba(0,0,0,1)');
  lg.addColorStop(0.86, 'rgba(0,0,0,1)');
  lg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = lg; g.fillRect(0, 0, W, H);
  InkFall.canvas = c;
  return c;
}

const ScrollInk = {
  draw(now) {
    if (G.state !== 'playing' || !G.song) return;
    const fever = G.feverLeft > 0;
    const a = fever ? 1 : 0.32;
    const sc = Geo.scroll;
    const xihu = !!G.song.xihu;
    const ink = xihu ? 'rgba(20,60,52,' : 'rgba(22,26,24,';
    const gold = 'rgba(255,215,110,';
    // 两侧墨瀑（v7）：常态只画程序化细墨流——v6 的 24px 美术竖带在常态下糊成一整块半透明竖条；
    // 美术墨瀑只在天人合一全开时贴边流，那时它才是瀑布而不是条子
    if (fever && IMG.fxInkfall) {
      const strip = inkFallStrip();
      for (const dx of [sc.left - 16, sc.left + sc.w - 12]) {
        if (!strip) break;
        ctx.save();
        // 正片叠底：瀑布的白色水花透过去不留白柱，只有墨色 streak 落在底色上
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = a * 0.7;
        ctx.drawImage(strip, dx, 92, 30, 492);
        ctx.restore();
      }
      for (const sx of [sc.left - 2, sc.left + sc.w + 2]) {
        for (let i = 0; i < 5; i++) {
          const yy = 96 + ((now * (46 + i * 9) + i * 113) % 480);
          ctx.save();
          ctx.globalAlpha = a * 0.75;
          ctx.fillStyle = ink + '0.9)';
          ctx.beginPath(); ctx.arc(sx + Math.sin(yy * 0.03 + i) * 4, yy, 2.2 + (i % 2), 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
      }
    } else for (const sx of [sc.left - 2, sc.left + sc.w + 2]) {
      for (let s = 0; s < 3; s++) {
        ctx.save();
        ctx.globalAlpha = a * (0.5 - s * 0.12);
        ctx.strokeStyle = ink + '0.85)';
        ctx.lineWidth = 7 - s * 1.8;
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (let y = 92; y <= 584; y += 14) {
          const x = sx + Math.sin(y * 0.02 + now * 2 + s * 2.1) * 3;
          y === 92 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();
      }
      for (let i = 0; i < 5; i++) {
        const yy = 96 + ((now * (46 + i * 9) + i * 113) % 480);
        ctx.save();
        ctx.globalAlpha = a * 0.75;
        ctx.fillStyle = ink + '0.9)';
        ctx.beginPath(); ctx.arc(sx + Math.sin(yy * 0.03 + i) * 4, yy, 2.2 + (i % 2), 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }
    // 卷轴底部墨池：与两侧墨瀑同源（v6：中心上移至 INK_POOL_Y，触屏按钮上方完整可见）
    const cx0 = sc.cx, cy0 = INK_POOL_Y;
    ctx.save();
    ctx.globalAlpha = a;
    const halo = ctx.createRadialGradient(cx0, cy0, 4, cx0, cy0, 150);
    halo.addColorStop(0, xihu ? 'rgba(16,48,40,0.34)' : 'rgba(20,26,22,0.30)');
    halo.addColorStop(1, 'rgba(20,26,22,0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(cx0, cy0, 150, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.translate(cx0, cy0); ctx.scale(1, 22 / 132);
    const mg = ctx.createRadialGradient(0, 0, 4, 0, 0, 132);
    mg.addColorStop(0, xihu ? 'rgba(10,38,30,0.88)' : 'rgba(12,16,13,0.88)');
    mg.addColorStop(0.75, xihu ? 'rgba(10,38,30,0.55)' : 'rgba(12,16,13,0.55)');
    mg.addColorStop(1, 'rgba(12,16,13,0)');
    ctx.fillStyle = mg;
    ctx.beginPath(); ctx.arc(0, 0, 132, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = gold + '0.28)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, 132, Math.PI, Math.PI * 2); ctx.stroke();
    ctx.restore();
    for (let i = 0; i < 2; i++) {
      const rr = 22 + ((now * 34 + i * 55) % 100);
      ctx.save();
      ctx.globalAlpha = a * 0.45 * (1 - rr / 130);
      ctx.strokeStyle = ink + '0.8)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(cx0, cy0, rr, rr * 0.22, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    for (let i = 0; i < 5; i++) {
      const yy = cy0 - ((now * 26 + i * 47) % 64);
      ctx.save();
      ctx.globalAlpha = a * 0.8;
      ctx.fillStyle = xihu ? 'rgba(244,178,196,0.9)' : ink + '0.9)';
      ctx.beginPath(); ctx.arc(cx0 - 90 + ((i * 37) % 180), yy, 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // 墨道：墨池与卷轴底边之间的淡淡连通（v6）
    ctx.save();
    ctx.globalAlpha = a * 0.18;
    ctx.strokeStyle = ink + '0.9)'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx0, cy0 + 20); ctx.lineTo(cx0, 584); ctx.stroke();
    ctx.restore();
    ctx.restore();
  }
};

/* ============================================================
   绘制：环境层（卷轴之后的远景粒子）
   ============================================================ */
function drawPetals(now) {
  ctx.save();
  for (const p of G.petals) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = p.hue;
    ctx.beginPath();
    ctx.ellipse(0, 0, p.size, p.size * 0.52, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

function drawMotes(now) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const m of G.motes) {
    ctx.globalAlpha = m.a * (0.55 + Math.sin(now * 2 + m.sway) * 0.35);
    ctx.fillStyle = m.gold ? '#ffd76e' : '#c9ffe6';
    ctx.beginPath();
    ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/* 落枫之外的横向风痕（首页 / 局内都跑） */
function drawWindStreaks(now) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i++) {
    const t = ((now * 0.16 + i * 0.34) % 1);
    const y = (0.18 + i * 0.31) * Layout.H;
    const x = -260 + t * (Layout.W + 520);
    const a = Math.sin(t * Math.PI) * 0.20;
    ctx.globalAlpha = a;
    ctx.strokeStyle = 'rgba(255,246,214,0.9)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + 130, y - 16, x + 280, y - 4);
    ctx.stroke();
  }
  ctx.restore();
}

/* ============================================================
   绘制：前景特效
   ============================================================ */
function drawSparks() {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const p of G.sparks) {
    const k = clamp(p.life / 0.6, 0, 1);
    ctx.globalAlpha = k * 0.9;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * (0.5 + k * 0.7), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawInkDrops() {
  for (const p of G.ink) {
    const k = clamp(p.life / 0.8, 0, 1);
    const spd = Math.hypot(p.vx, p.vy);
    const ang = Math.atan2(p.vy, p.vx);
    ctx.save();
    ctx.globalAlpha = k * 0.92;
    ctx.translate(p.x, p.y);
    ctx.rotate(ang);
    if (p.gold) {
      ctx.fillStyle = '#ffd76e';
      ctx.shadowColor = '#ffd76e';
      ctx.shadowBlur = 6;
    } else {
      ctx.fillStyle = 'rgba(26,34,26,0.9)';
      ctx.shadowBlur = 0;
    }
    ctx.beginPath();
    ctx.ellipse(0, 0, p.r + Math.min(spd * 0.03, 9), p.r * 0.82, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawRings() {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const r of G.rings) {
    const k = r.life / r.maxLife;
    ctx.globalAlpha = clamp(k, 0, 1) * 0.85;
    ctx.strokeStyle = r.color;
    ctx.lineWidth = r.w * (0.5 + k * 0.9);
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSlashes() {
  for (const s of G.slashes) {
    const k = clamp(s.life / s.maxLife, 0, 1);       // 1 → 0
    const e = easeOut(1 - k);                         // 0 → 1 展开
    const fade = Math.pow(k, 0.7);
    const len = s.sw * (0.55 + e * 0.62);
    const thick = s.sw * (s.big ? 0.17 : 0.12) * (0.9 + (1 - k) * 0.35);
    // v12：美术剑气图存在时仍用图（作为叠加材质），否则走水墨剑气原语
    if (IMG.fxSwordQi) {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.a0);
      ctx.globalAlpha = fade * 0.9;
      const sw = s.sw * (1.2 - k * 0.2);
      const sh = sw * (IMG.fxSwordQi.height / IMG.fxSwordQi.width);
      ctx.drawImage(IMG.fxSwordQi, -sw / 2, -sh / 2, sw, sh);
      ctx.restore();
      continue;
    }
    ctx.save();
    // 墨边 + 白芯的月牙剑气，比原来的 lighter 光圈干净得多
    swordQi(s.x, s.y, s.a0, len, s.big ? 0.72 : 0.55, thick, {
      alpha: fade,
      hot: s.big ? 0.92 : 0.8,
      warm: !!s.big,
      specks: s.big ? 7 : 4,
    });
    ctx.restore();
  }
}

function drawFireworks() {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const f of G.fireworks) {
    const k = f.t / f.dur;
    const e = easeOut(k);
    const r = 14 + e * (42 + 30 * f.power);

    // 核心光斑
    const g = ctx.createRadialGradient(f.x, f.y, 1, f.x, f.y, r * 0.72);
    g.addColorStop(0, `rgba(255,250,228,${(1 - k) * 0.95})`);
    g.addColorStop(0.42, `rgba(255,226,150,${(1 - k) * 0.5})`);
    g.addColorStop(1, 'rgba(255,200,90,0)');
    ctx.globalAlpha = 1;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(f.x, f.y, r * 0.72, 0, Math.PI * 2);
    ctx.fill();

    // 短花瓣状放射
    const rays = 10;
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * Math.PI * 2 + f.hue + k * 0.3;
      const inner = r * 0.34;
      ctx.globalAlpha = (1 - k) * 0.8;
      ctx.strokeStyle = i % 2 ? 'rgba(255,238,180,0.95)' : 'rgba(170,255,220,0.7)';
      ctx.lineWidth = 2.6 * (1 - k) + 0.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(f.x + Math.cos(a) * inner, f.y + Math.sin(a) * inner);
      ctx.lineTo(f.x + Math.cos(a) * r, f.y + Math.sin(a) * r);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawProjectiles() {
  ctx.save();
  for (const p of G.projectiles) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(p.x, p.y);
    ctx.rotate(p.t * 9);
    ctx.shadowColor = '#9dffd8';
    ctx.shadowBlur = 14;
    drawTaiChi(0, 0, 13, 0);
    ctx.restore();
  }
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const p of G.purifications) {
    ctx.globalAlpha = clamp(p.life, 0, 1);
    ctx.fillStyle = p.gold ? '#ffe9a8' : '#9dffd8';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawWindBlades() {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const w of G.windBlades) {
    ctx.globalAlpha = clamp(w.life * 2.2, 0, 1) * 0.9;
    ctx.strokeStyle = 'rgba(196,236,255,0.95)';
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(w.x, w.y);
    ctx.lineTo(w.x + Math.cos(w.angle) * w.len, w.y + Math.sin(w.angle) * w.len);
    ctx.stroke();
  }
  ctx.restore();
}

function drawComboWaves() {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const cw of G.comboWaves) {
    const k = clamp(cw.life, 0, 1);
    ctx.globalAlpha = k * 0.42;
    ctx.strokeStyle = '#ffe0a0';
    ctx.lineWidth = 3.2 * k + 0.8;
    ctx.beginPath();
    ctx.arc(cw.x, cw.y, cw.r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawVortex() {  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const v of G.vortex) {
    ctx.globalAlpha = clamp(v.life * 2, 0, 1);
    ctx.fillStyle = v.color;
    ctx.shadowColor = v.color;
    ctx.shadowBlur = 9;
    ctx.beginPath();
    ctx.arc(v.x, v.y, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/* 判定弹字：有书法图时用图，无图回退文字 */
const JUDGE_IMGS = { '准': 'judgeZhun', '可': 'judgeKe', '乱': 'judgeLuan' };
function drawPopups() {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const p of G.popups) {
    const k = clamp(p.life / p.maxLife, 0, 1);
    ctx.save();
    ctx.globalAlpha = Math.min(1, k * 2.4);
    const imgKey = JUDGE_IMGS[p.text];
    const im = imgKey ? IMG[imgKey] : null;
    if (im) {
      const h = p.big ? 92 : 64;
      const w = h * im.width / im.height;
      ctx.drawImage(im, p.x - w / 2, p.y - h / 2, w, h);
    } else {
      const size = p.big ? 46 : 30;
      ctx.font = `700 ${size}px "Ma Shan Zheng","STKaiti","KaiTi",serif`;
      ctx.lineWidth = p.big ? 5 : 4;
      ctx.strokeStyle = 'rgba(252,246,224,0.92)';
      ctx.strokeText(p.text, p.x, p.y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.restore();
  }
  ctx.restore();
}

/* 连击里程碑：大字牌 + 左侧摩崖诗句 */
function drawMilestones(now) {
  for (const m of G.milestones) {
    const k = m.life / m.maxLife;
    const inK = clamp((1 - k) * 6, 0, 1);
    const outK = clamp(k * 3, 0, 1);
    const alpha = Math.min(inK, outK);
    const cx = Geo.scroll.cx;
    const y = 150 - (1 - inK) * 16;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 墨底横匾
    const sc = 0.85 + inK * 0.15;
    ctx.translate(cx, y);
    ctx.scale(sc, sc);
    const grad = ctx.createLinearGradient(-170, 0, 170, 0);
    grad.addColorStop(0, 'rgba(12,18,13,0)');
    grad.addColorStop(0.5, 'rgba(12,18,13,0.82)');
    grad.addColorStop(1, 'rgba(12,18,13,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(-190, -34, 380, 68, 8) : ctx.rect(-190, -34, 380, 68);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,215,110,0.75)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-150, -26); ctx.lineTo(150, -26);
    ctx.moveTo(-150, 26); ctx.lineTo(150, 26);
    ctx.stroke();

    const mImg = m.img ? IMG[m.img] : null;
    if (mImg) {
      const h = 56 + m.tier * 10;
      const w = h * mImg.width / mImg.height;
      ctx.drawImage(mImg, -w / 2, -2 - h / 2, w, h);
    } else {
      ctx.font = `700 ${34 + m.tier * 5}px "Ma Shan Zheng","STKaiti","KaiTi",serif`;
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(20,26,16,0.9)';
      ctx.strokeText(m.title, 0, -2);
      const tg = ctx.createLinearGradient(0, -24, 0, 24);
      tg.addColorStop(0, '#fff6cf');
      tg.addColorStop(0.55, '#ffd76e');
      tg.addColorStop(1, '#c98a1e');
      ctx.fillStyle = tg;
      ctx.fillText(m.title, 0, -2);
    }

    ctx.font = '500 12px "Ma Shan Zheng","STKaiti","KaiTi",serif';
    ctx.fillStyle = 'rgba(238,228,196,0.9)';
    ctx.fillText(m.sub, 0, 24);
    ctx.restore();
  }

  // 摩崖诗句（左侧）
  for (const v of G.verses) {
    const k = v.life / v.maxLife;
    const alpha = Math.min(clamp((1 - k) * 5, 0, 1), clamp(k * 2.5, 0, 1));
    ctx.save();
    ctx.globalAlpha = alpha * 0.9;
    ctx.font = '600 15px "Ma Shan Zheng","STKaiti","KaiTi",serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,230,160,0.95)';
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 8;
    const chars = v.text.split('');
    const x = Math.max(34, Geo.scroll.left - 168);
    let y = 168;
    for (const ch of chars) {
      ctx.fillText(ch, x, y);
      y += 19;
    }
    ctx.restore();
  }
}

/* 太鼓达人式连击计数：判定盘下方的大字 */
function drawComboCounter(now) {
  const combo = G.combo;
  if (combo < 3) return;
  const cx = Geo.scroll.cx;
  const y = Geo.track.judgeY + 74;
  const pop = G.comboPop;
  const scale = 1 + pop * 0.42;
  const hot = clamp(combo / 50, 0, 1);

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.translate(cx, y);
  ctx.scale(scale, scale);

  // 光晕
  const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, 78);
  glow.addColorStop(0, `rgba(255,226,150,${0.30 + hot * 0.35})`);
  glow.addColorStop(1, 'rgba(255,226,150,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, 78, 0, Math.PI * 2);
  ctx.fill();

  const size = 34 + hot * 12;
  ctx.font = `700 ${size}px "Ma Shan Zheng","STKaiti","KaiTi",serif`;
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(16,22,14,0.9)';
  ctx.strokeText(String(combo), 0, 0);

  const g = ctx.createLinearGradient(0, -size * 0.6, 0, size * 0.6);
  if (G.feverLeft > 0) {
    g.addColorStop(0, '#fffdf0');
    g.addColorStop(0.5, '#ffe36e');
    g.addColorStop(1, '#ff8f3a');
  } else {
    g.addColorStop(0, '#fff8d8');
    g.addColorStop(0.55, '#ffd76e');
    g.addColorStop(1, '#c98a1e');
  }
  ctx.fillStyle = g;
  ctx.fillText(String(combo), 0, 0);

  ctx.font = '600 12px "Ma Shan Zheng","STKaiti","KaiTi",serif';
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(16,22,14,0.85)';
  ctx.strokeText('连击', 0, size * 0.78);
  ctx.fillStyle = 'rgba(255,238,190,0.95)';
  ctx.fillText('连击', 0, size * 0.78);

  ctx.restore();
}
