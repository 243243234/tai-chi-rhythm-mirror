'use strict';
/* ============================================================
   stagefx.js —— v12「舞台材质层」
   ------------------------------------------------------------
   解决的问题：关卡内画面"塑料"。

   塑料感的四个来源（都不是靠加特效解决的）：
     1. 没有统一调色 —— 背景、角色、特效各自一套对比度与饱和度，
        像三张图叠在一起，而不是同一张画。
     2. 没有纸材质 —— 数字画面太"干净"，缺纸纹、缺脏、缺呼吸。
     3. 没有景深 —— 人物直接贴在背景上，中间没有雾、前面没有遮挡物。
     4. 特效是"发光"而不是"墨" —— 全用 lighter 加法混合 + 霓虹色，
        这是 2015 年手游的质感；水墨应该是 multiply + 飞白 + 墨点迸溅 + 白芯。

   所以本模块做四件事：
     §1 纸材质调色层 Grade —— 全文互不相关的图层，压进同一张纸
     §2 景深雾 DepthFog —— 人物前后各一道雾，把人"埋"进画里
     §3 水墨笔触原语 InkFX —— 毛笔笔触 / 剑气弧 / 墨点迸溅 / 飘带
     §4 天人合一「墨气登仙」演出 —— 参考李白·诗剑行回城的墨气升腾
     §5 舞台分层槽位 —— 有图就自动生效，没图就跳过（不影响运行）
   ============================================================ */

/* ============================================================
   §0 美术槽位（新资源到位后无需改代码，丢进 assets/ 即生效）
   ============================================================ */
loadSmartAsset('bgStageFar',  ['assets/bg_stage_far.jpg'],  { keepSize: true });
loadSmartAsset('bgStageMid',  ['assets/bg_stage_mid.jpg'],  { keepSize: true });
loadSmartAsset('bgStageGnd',  ['assets/bg_stage_ground.png']);
loadSmartAsset('fgBranch',    ['assets/fg_branch.png']);
loadSmartAsset('fxSwordQi',   ['assets/fx_sword_qi.png']);
loadSmartAsset('fxSealArray', ['assets/fx_seal_array.png']);
loadSmartAsset('fxInkColumn', ['assets/fx_ink_column.png']);
loadSmartAsset('fxInkSplat',  ['assets/fx_ink_splat.png']);
loadSmartAsset('noteTap',     ['assets/note_tap.png']);
loadSmartAsset('noteSlide',   ['assets/note_slide.png']);
loadSmartAsset('noteHoldHead',['assets/note_hold_head.png']);

/* ============================================================
   §1 纸材质调色层
   ------------------------------------------------------------
   这是"去塑料"最有效的一层，而且完全不依赖新美术：
   把整帧画面统一叠上一层纸纹 + 暗角 + 暖冷分离的调色，
   背景、角色、特效就会像画在同一张宣纸上，而不是三张图层。
   ============================================================ */
const Grade = { key: '', grain: null, pattern: null, vig: null, warm: null, cool: null, edgeTop: null, edgeBot: null };

function buildPaperGrain() {
  if (Grade.grain) return;
  const S = 256;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  const d = img.data;
  for (let i = 0; i < S * S; i++) {
    const p = i * 4;
    const r = Math.random();
    // 一半颗粒偏亮、一半偏暗，模拟纸浆纤维的高低差
    if (r < 0.5) { d[p] = 255; d[p + 1] = 248; d[p + 2] = 232; d[p + 3] = r * 72; }
    else { d[p] = 90; d[p + 1] = 78; d[p + 2] = 60; d[p + 3] = (r - 0.5) * 60; }
  }
  g.putImageData(img, 0, 0);
  // 纸纤维：几道极淡的短线，让颗粒不是纯噪点
  g.lineWidth = 0.7;
  for (let i = 0; i < 30; i++) {
    const x0 = Math.random() * S, y0 = Math.random() * S;
    const l = 10 + Math.random() * 46;
    const a = Math.random() * Math.PI;
    g.strokeStyle = Math.random() < 0.5 ? 'rgba(255,252,240,0.20)' : 'rgba(120,104,78,0.16)';
    g.beginPath();
    g.moveTo(x0, y0);
    g.quadraticCurveTo(
      x0 + Math.cos(a) * l * 0.5 + (Math.random() - 0.5) * 8,
      y0 + Math.sin(a) * l * 0.5 + (Math.random() - 0.5) * 8,
      x0 + Math.cos(a) * l, y0 + Math.sin(a) * l);
    g.stroke();
  }
  Grade.grain = c;
}

function buildGrade() {
  const W = Math.max(1, Math.round(Layout.W)), H = Math.max(1, Math.round(Layout.H));
  const key = W + 'x' + H;
  if (Grade.key === key) return;
  Grade.key = key;
  Grade.pattern = null;
  buildPaperGrain();

  // 纸纹铺满整屏并烘成一张图：
  // 原来每帧用 soft-light 全屏混合纸纹，软件渲染下极慢（手机 GPU 便宜、但软件后端会掉到个位数帧）。
  // 烘成一张 8 位半透明图后，每帧只是一次普通 source-over 位块传输，视觉几乎等价。
  const gf = makeCanvas(W, H);
  const gfc = gf.getContext('2d');
  const pat = gfc.createPattern(Grade.grain, 'repeat');
  gfc.fillStyle = pat;
  gfc.fillRect(0, 0, W, H);
  Grade.grainFull = gf;

  // 暗角：四角收暗，视线往中间聚
  const v = makeCanvas(W, H);
  const vc = v.getContext('2d');
  const rg = vc.createRadialGradient(W / 2, H * 0.46, Math.min(W, H) * 0.34, W / 2, H * 0.46, Math.max(W, H) * 0.78);
  rg.addColorStop(0, 'rgba(18,22,16,0)');
  rg.addColorStop(0.62, 'rgba(18,22,16,0.10)');
  rg.addColorStop(1, 'rgba(12,16,12,0.40)');
  vc.fillStyle = rg; vc.fillRect(0, 0, W, H);
  Grade.vig = v;

  // 暖洗（multiply）：整体压一档暖灰，去掉"屏幕感"
  const wv = makeCanvas(W, H);
  const wc = wv.getContext('2d');
  const wg = wc.createLinearGradient(0, 0, W * 0.4, H);
  wg.addColorStop(0, 'rgba(236,214,176,1)');
  wg.addColorStop(0.55, 'rgba(232,224,206,1)');
  wg.addColorStop(1, 'rgba(206,208,190,1)');
  wc.fillStyle = wg; wc.fillRect(0, 0, W, H);
  Grade.warm = wv;

  // 冷洗（screen）：只提一点高光，制造亮部偏暖、暗部偏青的分离
  const cv = makeCanvas(W, H);
  const cc = cv.getContext('2d');
  const cg = cc.createRadialGradient(W * 0.5, H * 0.22, 10, W * 0.5, H * 0.5, Math.max(W, H) * 0.7);
  cg.addColorStop(0, 'rgba(212,226,220,0.55)');
  cg.addColorStop(1, 'rgba(212,226,220,0)');
  cc.fillStyle = cg; cc.fillRect(0, 0, W, H);
  Grade.cool = cv;

  // 上下墨边：纸吸墨，画面上下沿自然积墨
  const et = makeCanvas(W, Math.round(H * 0.16));
  const etc = et.getContext('2d');
  const eg = etc.createLinearGradient(0, 0, 0, et.height);
  eg.addColorStop(0, 'rgba(14,20,15,0.42)');
  eg.addColorStop(1, 'rgba(14,20,15,0)');
  etc.fillStyle = eg; etc.fillRect(0, 0, W, et.height);
  Grade.edgeTop = et;

  const eb = makeCanvas(W, Math.round(H * 0.2));
  const ebc = eb.getContext('2d');
  const ebg = ebc.createLinearGradient(0, eb.height, 0, 0);
  ebg.addColorStop(0, 'rgba(14,20,15,0.38)');
  ebg.addColorStop(1, 'rgba(14,20,15,0)');
  ebc.fillStyle = ebg; ebc.fillRect(0, 0, W, eb.height);
  Grade.edgeBot = eb;
}

function drawGrade(now) {
  if (!(G.state === 'playing' || G.state === 'pause')) return;
  buildGrade();
  const W = Layout.W, H = Layout.H;
  const fever = G.feverLeft > 0;

  // 1) 纸纹：一张烘好的整屏图，普通 source-over 贴上去
  ctx.save();
  ctx.globalAlpha = 0.42;
  ctx.drawImage(Grade.grainFull, 0, 0, W, H);
  ctx.restore();

  // 2) 暖洗 / 冷洗：一句话把全图压成同一套色温
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = fever ? 0.15 : 0.11;
  ctx.drawImage(Grade.warm, 0, 0, W, H);
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = fever ? 0.10 : 0.055;
  ctx.drawImage(Grade.cool, 0, 0, W, H);
  ctx.restore();

  // 3) 暗角 + 上下积墨
  ctx.save();
  ctx.globalAlpha = fever ? 1 : 0.9;
  ctx.drawImage(Grade.vig, 0, 0, W, H);
  ctx.drawImage(Grade.edgeTop, 0, 0, W, Grade.edgeTop.height);
  ctx.drawImage(Grade.edgeBot, 0, H - Grade.edgeBot.height, W, Grade.edgeBot.height);
  ctx.restore();
}

/* ============================================================
   §2 景深雾
   ------------------------------------------------------------
   人物与背景之间一道雾、人物与镜头之间一道雾。
   这是让"贴上去的立绘"变回"画里的人物"最便宜的技法。
   ============================================================ */
const FogCache = { key: '', back: null, front: null };

function buildFog() {
  const W = Math.max(1, Math.round(Layout.W)), H = Math.max(1, Math.round(Layout.H));
  const key = W + 'x' + H;
  if (FogCache.key === key) return;
  FogCache.key = key;

  // 背景雾：横向宽带，压在角色背后
  const b = makeCanvas(W, H);
  const bc = b.getContext('2d');
  const bg = bc.createLinearGradient(0, H * 0.44, 0, H * 0.96);
  bg.addColorStop(0, 'rgba(226,228,212,0)');
  bg.addColorStop(0.34, 'rgba(228,230,214,0.15)');
  bg.addColorStop(0.68, 'rgba(232,232,218,0.08)');
  bg.addColorStop(1, 'rgba(226,230,216,0)');
  bc.fillStyle = bg; bc.fillRect(0, 0, W, H);
  FogCache.back = b;

  // 前景雾：只压底部一条，把人物脚部"埋"进去
  const f = makeCanvas(W, Math.round(H * 0.34));
  const fc = f.getContext('2d');
  const fg = fc.createLinearGradient(0, f.height, 0, 0);
  fg.addColorStop(0, 'rgba(228,232,220,0.34)');
  fg.addColorStop(0.42, 'rgba(228,232,220,0.13)');
  fg.addColorStop(1, 'rgba(228,232,220,0)');
  fc.fillStyle = fg; fc.fillRect(0, 0, W, f.height);
  FogCache.front = f;
}

function drawBackFog(now) {
  buildFog();
  const W = Layout.W, H = Layout.H;
  ctx.save();
  ctx.globalAlpha = G.feverLeft > 0 ? 0.7 : 1;
  ctx.drawImage(FogCache.back, 0, 0, W, H);
  // 两团缓慢横移的浓雾，破掉那条直边
  for (let i = 0; i < 2; i++) {
    const cx = ((0.2 + i * 0.52 + now * (0.012 + i * 0.006)) % 1.34 - 0.17) * W;
    const cy = H * (0.66 + i * 0.06);
    const r = W * (0.22 + i * 0.06);
    const g = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
    g.addColorStop(0, `rgba(234,234,220,${0.09 - i * 0.03})`);
    g.addColorStop(1, 'rgba(234,234,220,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(cx, cy, r, r * 0.26, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawFrontFog(now) {
  buildFog();
  const W = Layout.W, H = Layout.H;
  ctx.save();
  ctx.globalAlpha = G.feverLeft > 0 ? 0.45 : 0.7;
  ctx.drawImage(FogCache.front, 0, H - FogCache.front.height, W, FogCache.front.height);
  ctx.restore();
}

/* ============================================================
   §3 水墨笔触原语
   ------------------------------------------------------------
   全部是「材料」而不是「发光」：
     - 毛笔笔触按长度收放笔锋，可带飞白（干笔断丝）
     - 剑气是月牙形，墨边 + 白芯，不收 glow 光圈
     - 墨点是主滴 + 卫星飞溅，带拖尾方向
   ============================================================ */

/* 沿折线生成粗细渐变的毛笔笔触多边形 */
function inkStroke(pts, opt) {
  const o = opt || {};
  const w = o.w || 8;
  const taper = o.taper === undefined ? 1 : o.taper;
  const alpha = o.alpha === undefined ? 1 : o.alpha;
  const color = o.color || 'rgba(24,32,25,1)';
  if (!pts || pts.length < 2) return;
  const n = pts.length;
  const left = [], right = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    const t = i / (n - 1);
    // 笔锋：中段最粗，两端收细（taper=0 时等宽）
    const prof = taper === 0 ? 1 : Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, t))), 0.62);
    const hw = w * (0.5 * (1 - taper) + 0.5 * taper * prof) * 0.5;
    left.push([p[0] - dy * hw, p[1] + dx * hw]);
    right.push([p[0] + dy * hw, p[1] - dx * hw]);
  }
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(left[0][0], left[0][1]);
  for (let i = 1; i < n; i++) ctx.lineTo(left[i][0], left[i][1]);
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/* 飞白：沿同一路径画几道断续干笔，让墨迹"破"开 */
function dryBrush(pts, opt) {
  const o = opt || {};
  const w = o.w || 3;
  const alpha = o.alpha === undefined ? 0.35 : o.alpha;
  const color = o.color || 'rgba(248,244,230,1)';
  const seeds = o.seeds || 3;
  if (!pts || pts.length < 3) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  for (let s = 0; s < seeds; s++) {
    ctx.lineWidth = w * (0.6 + Math.random() * 0.8);
    ctx.beginPath();
    let drawing = false;
    const seg = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const on = Math.floor(i / seg) % 2 === 0 ? Math.random() > 0.25 : Math.random() > 0.7;
      if (!on) { drawing = false; continue; }
      const x = p[0] + (Math.random() - 0.5) * w * 1.6;
      const y = p[1] + (Math.random() - 0.5) * w * 1.6;
      if (!drawing) { ctx.moveTo(x, y); drawing = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/* 剑气弧：月牙形，墨边 + 白芯 + 外缘飞溅。ang 用弧度，向 +x 方向为 0 */
function swordQi(x, y, ang, len, spread, thick, opt) {
  const o = opt || {};
  const alpha = o.alpha === undefined ? 1 : o.alpha;
  const hot = o.hot === undefined ? 0.85 : o.hot;
  const warmth = o.warm;      // true = 金白，false = 冷白
  const N = 26;
  const outer = [], inner = [];
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * 2 - 1;
    const a = ang + t * spread;
    const prof = Math.pow(Math.cos(t * Math.PI * 0.5), 1.35);
    const wd = thick * prof;
    outer.push([x + Math.cos(a) * len, y + Math.sin(a) * len]);
    inner.push([x + Math.cos(a) * (len - wd), y + Math.sin(a) * (len - wd)]);
  }
  const poly = () => {
    ctx.beginPath();
    ctx.moveTo(outer[0][0], outer[0][1]);
    for (let i = 1; i <= N; i++) ctx.lineTo(outer[i][0], outer[i][1]);
    for (let i = N; i >= 0; i--) ctx.lineTo(inner[i][0], inner[i][1]);
    ctx.closePath();
  };
  ctx.save();
  ctx.globalAlpha = alpha;
  // 墨边（主体）：偏淡，只是一层"渗出"的场，不能是实心黑月牙
  poly();
  ctx.globalAlpha = alpha * (o.inkAlpha === undefined ? 0.55 : o.inkAlpha);
  ctx.fillStyle = o.ink || 'rgba(22,32,26,0.95)';
  ctx.fill();
  ctx.globalAlpha = alpha;
  // 白芯：贴着外缘的月牙，占笔锋的六成，是剑气的"亮"
  const coreOuter = [], coreInner = [];
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * 2 - 1;
    const a = ang + t * spread;
    const prof = Math.pow(Math.cos(t * Math.PI * 0.5), 1.5);
    const wd = thick * prof;
    coreOuter.push([x + Math.cos(a) * len, y + Math.sin(a) * len]);
    coreInner.push([x + Math.cos(a) * (len - wd * 0.62), y + Math.sin(a) * (len - wd * 0.62)]);
  }
  ctx.beginPath();
  ctx.moveTo(coreOuter[0][0], coreOuter[0][1]);
  for (let i = 1; i <= N; i++) ctx.lineTo(coreOuter[i][0], coreOuter[i][1]);
  for (let i = N; i >= 0; i--) ctx.lineTo(coreInner[i][0], coreInner[i][1]);
  ctx.closePath();
  ctx.fillStyle = warmth ? `rgba(255,250,232,${hot})` : `rgba(248,252,248,${hot})`;
  ctx.fill();
  // 剑脊：一条更实的亮线
  ctx.strokeStyle = `rgba(255,253,244,${Math.min(1, hot + 0.06)})`;
  ctx.lineWidth = Math.max(0.8, thick * 0.1);
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * 2 - 1;
    const a = ang + t * spread;
    const prof = Math.pow(Math.cos(t * Math.PI * 0.5), 1.6);
    const rr = len - thick * prof * 0.31;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.restore();
  // 外缘墨点飞溅
  if (o.specks !== 0) {
    ctx.save();
    ctx.globalAlpha = alpha * 0.75;
    const cnt = o.specks || 5;
    for (let i = 0; i < cnt; i++) {
      const t = Math.random() * 2 - 1;
      const a = ang + t * spread * 1.02;
      const rr = len + Math.random() * thick * 1.4;
      ctx.fillStyle = 'rgba(24,32,25,0.85)';
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * rr, y + Math.sin(a) * rr, 0.8 + Math.random() * 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

/* 墨点迸溅：主滴 + 卫星 + 拖尾方向 */
function inkSplat(x, y, r, alpha, dir) {
  const a0 = dir === undefined ? Math.random() * Math.PI * 2 : dir;
  // 有美术墨点图就用图（随机旋转/缩放，读起来比程序化更自然）
  if (IMG.fxInkSplat) {
    const s = r * 4.4;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(a0);
    const k = s / Math.max(IMG.fxInkSplat.width, IMG.fxInkSplat.height);
    ctx.drawImage(IMG.fxInkSplat, -IMG.fxInkSplat.width * k / 2, -IMG.fxInkSplat.height * k / 2,
      IMG.fxInkSplat.width * k, IMG.fxInkSplat.height * k);
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.globalAlpha = alpha;
  // 主体：不规则圆
  ctx.beginPath();
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = t * Math.PI * 2;
    const rr = r * (0.72 + Math.sin(a * 3 + a0) * 0.16 + Math.random() * 0.14);
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = 'rgba(20,28,22,0.9)';
  ctx.fill();
  // 卫星飞溅
  const cnt = 4 + Math.floor(Math.random() * 5);
  for (let i = 0; i < cnt; i++) {
    const a = a0 + (Math.random() - 0.5) * 2.4;
    const d = r * (1.1 + Math.random() * 2.2);
    const rr = r * (0.08 + Math.random() * 0.2);
    ctx.beginPath();
    ctx.ellipse(x + Math.cos(a) * d, y + Math.sin(a) * d, rr * 1.4, rr, a, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(20,28,22,${0.5 + Math.random() * 0.4})`;
    ctx.fill();
  }
  ctx.restore();
}

/* 墨气飘带：一条向上抽升的毛笔带子（飞白 + 半透墨）
   v12.1：初版太细，像几根头发丝。真水墨的"气"是笔锋饱满、边缘破开的带子，
   所以这里做成三层：淡墨外晕（宽）→ 浓墨主体（中）→ 白飞白（细）。 */
function inkRibbon(x0, y0, len, sway, width, alpha, phase) {
  const pts = [];
  const outer = [];
  const N = 22;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const y = y0 - t * len;
    const x = x0 + Math.sin(t * 3.1 + phase) * sway * t + Math.sin(t * 8.4 + phase * 2) * sway * 0.22;
    pts.push([x, y]);
    // 外晕再宽一倍，且向末端张开（像笔锋扫出去的散墨）
    outer.push([x + Math.sin(t * 3.1 + phase + 0.5) * 2.5, y]);
  }
  inkStroke(outer, { w: width * 2.15, alpha: alpha * 0.26, color: 'rgba(58,70,58,1)', taper: 1 });
  inkStroke(pts, { w: width, alpha: alpha * 0.44, color: 'rgba(26,36,29,1)', taper: 1 });
  // 墨芯：窄而实，贴在飘带中轴
  inkStroke(pts, { w: width * 0.34, alpha: alpha * 0.34, color: 'rgba(14,20,16,1)', taper: 1 });
  dryBrush(pts, { w: Math.max(1.6, width * 0.14), alpha: alpha * 0.8, color: 'rgba(252,248,236,1)', seeds: 3 });
}

/* ============================================================
   §4 天人合一「墨气登仙」
   ------------------------------------------------------------
   参考：李白·诗剑行 回城特效的墨气升腾。
   三段式：地面墨阵亮起 → 墨柱螺旋上升 + 诗句随气上浮 → 收束。
   ============================================================ */
const POEM_CHARS = ['诗', '剑', '行', '气', '韵', '流', '转', '天', '人', '合', '一'];

function drawSealArray(cx, cy, R, alpha, now, spin) {
  // 有美术图就用图（俯视椭圆法阵，透明底），没有就用程序化
  if (IMG.fxSealArray) {
    const w = R * 2.5;
    const h = w * (IMG.fxSealArray.height / IMG.fxSealArray.width);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);
    ctx.rotate(Math.sin(spin * 0.35) * 0.05);
    ctx.drawImage(IMG.fxSealArray, -w / 2, -h / 2, w, h);
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);
  ctx.scale(1, 0.3);

  // 外环：断续朱砂刻痕
  ctx.save();
  ctx.rotate(spin);
  ctx.strokeStyle = 'rgba(168,52,31,0.8)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 28; i++) {
    const a0 = (i / 28) * Math.PI * 2;
    const long = i % 7 === 0;
    ctx.beginPath();
    ctx.arc(0, 0, R, a0, a0 + (long ? 0.14 : 0.06));
    ctx.stroke();
  }
  ctx.restore();

  // 内环：细金线 + 八向短线（八卦意）
  ctx.strokeStyle = 'rgba(220,193,137,0.55)';
  ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.arc(0, 0, R * 0.72, 0, Math.PI * 2); ctx.stroke();
  ctx.save();
  ctx.rotate(-spin * 1.6);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * R * 0.74, Math.sin(a) * R * 0.74);
    ctx.lineTo(Math.cos(a) * R * 0.96, Math.sin(a) * R * 0.96);
    ctx.stroke();
  }
  ctx.restore();

  // 中心墨池
  const g = ctx.createRadialGradient(0, 0, R * 0.04, 0, 0, R * 0.7);
  g.addColorStop(0, 'rgba(18,26,21,0.42)');
  g.addColorStop(1, 'rgba(18,26,21,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, R * 0.7, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawFeverAscent(now) {
  if (G.feverLeft <= 0 || G.state !== 'playing') return;
  const sc = Geo.scroll;
  const W = Layout.W, H = Layout.H;
  const p = 1 - clamp(G.feverLeft / FEVER_SECONDS, 0, 1);   // 0 → 1
  const enter = smoothstep(clamp(p / 0.12, 0, 1));
  const exit = 1 - smoothstep(clamp((p - 0.86) / 0.14, 0, 1));
  const life = enter * exit;

  // ---------- 1. 地面墨阵：在道童脚下亮起 ----------
  const heroX = Geo.hero.x, heroY = Geo.hero.y;
  drawSealArray(heroX, heroY + 10, 118, 0.85 * life, now, now * 0.5);
  // 判定盘下方也铺一层，呼应
  drawSealArray(sc.cx, sc.top + sc.h + 6, 96, 0.5 * life, now, -now * 0.35);

  // ---------- 2. 墨柱：卷轴两侧向上抽升的墨气 ----------
  // 有美术就用美术，没有就用程序化飘带
  for (let side = 0; side < 2; side++) {
    const bx = side === 0 ? sc.left - 30 : sc.left + sc.w + 30;
    for (let i = 0; i < 3; i++) {
      const ph = now * (0.9 + i * 0.23) + side * 1.7 + i * 2.1;
      const len = (250 + i * 95) * (0.35 + 0.65 * enter) * (0.4 + 0.6 * life);
      const y0 = sc.top + sc.h - 40 - ((now * (38 + i * 16) + i * 140) % 300);
      inkRibbon(bx + Math.sin(ph) * 12, y0, len, 30 + i * 10, 26 + i * 9, 0.72 * life, ph);
    }
  }
  if (IMG.fxInkColumn) {
    const cw = sc.w * 0.9;
    ctx.save();
    ctx.globalAlpha = 0.5 * life;
    ctx.globalCompositeOperation = 'multiply';
    const ch = cw * (IMG.fxInkColumn.height / IMG.fxInkColumn.width);
    ctx.drawImage(IMG.fxInkColumn, sc.cx - cw / 2, sc.top + sc.h - ch * 0.72 + Math.sin(now * 2) * 5, cw, ch);
    ctx.restore();
  }

  // ---------- 3. 诗句随气上浮 ----------
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < POEM_CHARS.length; i++) {
    const seed = i * 1.618;
    const base = ((now * 0.16 + seed * 0.09) % 1);
    const ty = (sc.top + sc.h + 40) - base * (sc.h + 150);
    const tx = sc.cx + Math.sin(seed * 5 + now * 0.8) * (sc.w * 0.34) + (i % 2 ? 26 : -26);
    const fadeIn = smoothstep(clamp(base / 0.15, 0, 1));
    const fadeOut = 1 - smoothstep(clamp((base - 0.72) / 0.28, 0, 1));
    const a = 0.55 * fadeIn * fadeOut * life;
    if (a < 0.02) continue;
    const size = 20 + (i % 3) * 7;
    ctx.font = `400 ${size}px "Ma Shan Zheng","STKaiti",serif`;
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(30,40,32,0.9)';
    ctx.fillText(POEM_CHARS[i], tx, ty);
    ctx.globalAlpha = a * 0.5;
    ctx.fillStyle = 'rgba(244,238,220,0.9)';
    ctx.fillText(POEM_CHARS[i], tx - 1, ty - 1);
  }
  ctx.restore();

  // ---------- 4. 金色墨点上升 ----------
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 26; i++) {
    const seed = i * 2.399;
    const base = ((now * (0.1 + (i % 5) * 0.03) + seed * 0.13) % 1);
    const y = H * 0.94 - base * H * 0.82;
    const x = sc.cx + Math.sin(seed * 3 + now * 0.7) * (sc.w * 0.55) + (Math.random() - 0.5) * 6;
    const a = Math.sin(base * Math.PI) * 0.55 * life;
    ctx.globalAlpha = a;
    ctx.fillStyle = i % 3 === 0 ? 'rgba(255,238,196,1)' : 'rgba(220,193,137,1)';
    ctx.beginPath(); ctx.arc(x, y, 1 + (i % 3), 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

/* ============================================================
   §5 舞台分层（有图才生效）
   ------------------------------------------------------------
   分层目的：远景 / 中景 / 地面 / 前景各有自己的位移速度与雾量，
   画面才有纵深。没有提供图时整段跳过，保持现状不受影响。
   ============================================================ */
function drawStageLayers(now) {
  if (G.state !== 'playing') return;
  if (!IMG.bgStageFar && !IMG.bgStageMid) return;
  const W = Layout.W, H = Layout.H;
  const drift = Math.sin(now * 0.08) * 10;      // 极慢的镜头漂移
  const cover = (img, dx, dy, scale) => {
    const k = Math.max(W / img.width, H / img.height) * (scale || 1);
    const dw = img.width * k, dh = img.height * k;
    ctx.drawImage(img, (W - dw) / 2 + dx, (H - dh) / 2 + dy, dw, dh);
  };
  if (IMG.bgStageFar) {
    ctx.save();
    ctx.globalAlpha = 0.92;
    cover(IMG.bgStageFar, drift * 0.4, drift * 0.15, 1.06);
    // 远景压雾
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(232,234,222,0.34)');
    g.addColorStop(0.6, 'rgba(232,234,222,0.16)');
    g.addColorStop(1, 'rgba(232,234,222,0.30)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  if (IMG.bgStageMid) {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.96;
    cover(IMG.bgStageMid, drift, 0, 1);
    ctx.restore();
  }
  if (IMG.bgStageGnd) {
    const gw = W * 1.1, gh = gw * (IMG.bgStageGnd.height / IMG.bgStageGnd.width);
    ctx.drawImage(IMG.bgStageGnd, -W * 0.05 + drift * 1.4, H - gh, gw, gh);
  }
}

/* 前景剪影：有图用图，没图用程序化的竹叶/枝影，给画面加一层"镜头前"的东西 */
function drawStageFore(now) {
  if (G.state !== 'playing') return;
  const W = Layout.W, H = Layout.H;
  if (IMG.fgBranch) {
    const bw = W * 0.44, bh = bw * (IMG.fgBranch.height / IMG.fgBranch.width);
    ctx.save();
    ctx.globalAlpha = 0.96;
    ctx.drawImage(IMG.fgBranch, -W * 0.02 + Math.sin(now * 0.25) * 6, H - bh * 0.9, bw, bh);
    ctx.restore();
    return;
  }
  // 程序化前景：四角几丛竹叶剪影（压暗、虚焦感，替代交角）
  ctx.save();
  ctx.globalAlpha = 0.26;
  ctx.fillStyle = 'rgba(24,42,32,1)';
  const sway = Math.sin(now * 0.6) * 3;
  const corners = [
    { x: 0, y: H, sx: 1, sy: -1 },
    { x: W, y: H, sx: -1, sy: -1 },
  ];
  for (const c of corners) {
    for (let i = 0; i < 8; i++) {
      const bx = c.x + c.sx * (8 + i * 15 + sway * (i % 2 ? 1.2 : -0.8));
      const by = c.y + c.sy * (4 + i * 7);
      const l = 62 + (i % 3) * 26;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx + c.sx * l * 0.5, by + c.sy * l * 0.8, bx + c.sx * l, by + c.sy * l * 0.36);
      ctx.quadraticCurveTo(bx + c.sx * l * 0.44, by + c.sy * l * 0.58, bx, by);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}
