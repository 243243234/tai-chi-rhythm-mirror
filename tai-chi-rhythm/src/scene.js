'use strict';
/* ============================================================
   scene.js —— 画面绘制与渲染管线
   ------------------------------------------------------------
   布局锚点全部来自 Geo（随世界宽度重算），所以任何屏幕比例都不会错位。
   渲染层次（从后到前）：
     落枫/灵尘 → 卷轴（画 + 墨河） → 【墨龙背面层 + 卷轴遮挡重绘】
     → 音符 → 判定盘 → 道童 / 小怪 → 龙气弹 → 【墨龙正面层】
     → 打击特效 / 连击字牌 / 全屏闪光
   ============================================================ */

/* ---------------- 太极阴阳（程序化 · v11 墨白描金版） ----------------
   v11：不再使用 taichi_koi.png（那张是霓虹青绿 + 橙红的游戏图标，和整幅水墨画不同材质，
   是「廉价拼接感」的主要来源之一）。改为纯墨白 + 一根描金细环，任何尺寸都锐利。 */
function drawTaiChi(x, y, r, rot) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = '#e9dec2'; ctx.fill();

  ctx.beginPath(); ctx.arc(0, 0, r, Math.PI / 2, Math.PI * 1.5);
  ctx.fillStyle = '#1b241c'; ctx.fill();
  ctx.beginPath(); ctx.arc(0, -r / 2, r / 2, 0, Math.PI * 2); ctx.fillStyle = '#1b241c'; ctx.fill();
  ctx.beginPath(); ctx.arc(0, r / 2, r / 2, 0, Math.PI * 2); ctx.fillStyle = '#e9dec2'; ctx.fill();
  ctx.beginPath(); ctx.arc(0, -r / 2, r / 7, 0, Math.PI * 2); ctx.fillStyle = '#e9dec2'; ctx.fill();
  ctx.beginPath(); ctx.arc(0, r / 2, r / 7, 0, Math.PI * 2); ctx.fillStyle = '#1b241c'; ctx.fill();

  ctx.beginPath(); ctx.arc(0, 0, Math.max(1, r - r * 0.035), 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(201, 168, 106, 0.9)';
  ctx.lineWidth = Math.max(1, r * 0.07);
  ctx.stroke();
  ctx.restore();
}

/* ---------------- 卷轴轨道 ---------------- */
function drawScrollTrack(now) {
  const sc = Geo.scroll;
  const night = G.feverLeft > 0 || (G.song && G.song.id === 5 && G.state !== 'menu');

  ctx.save();

  if (IMG.trackScroll) {
    // 夜晚/天人合一：用暗色叠层代替 canvas filter（filter 在软件渲染下极慢）
    // 投影与白天分支一致，卷轴在夜里也不飘
    if (night) {
      ctx.save();
      ctx.globalAlpha = 0.92;
      ctx.shadowColor = 'rgba(12, 20, 14, 0.42)';
      ctx.shadowBlur = 22;
      ctx.shadowOffsetX = 8;
      ctx.shadowOffsetY = 12;
      ctx.drawImage(IMG.trackScroll, sc.left, sc.top, sc.w, sc.h);
      ctx.restore();
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = G.feverLeft > 0 ? 0.42 : 0.30;
      ctx.fillStyle = '#4a5a4c';
      ctx.fillRect(sc.left, sc.top, sc.w, sc.h);
      ctx.restore();
    } else {
      ctx.save();
      ctx.shadowColor = 'rgba(12, 20, 14, 0.42)';
      ctx.shadowBlur = 22;
      ctx.shadowOffsetX = 8;
      ctx.shadowOffsetY = 12;
      ctx.drawImage(IMG.trackScroll, sc.left, sc.top, sc.w, sc.h);
      ctx.restore();
      ctx.drawImage(IMG.trackScroll, sc.left, sc.top, sc.w, sc.h);
    }
  } else {
    // 程序化宣纸卷轴（无素材时的兜底）
    const g = ctx.createLinearGradient(0, sc.top, 0, sc.top + sc.h);
    g.addColorStop(0, '#f7f1dc');
    g.addColorStop(1, '#e6d8ae');
    ctx.fillStyle = g;
    ctx.fillRect(sc.left + 18, sc.top + 20, sc.w - 36, sc.h - 40);
    ctx.fillStyle = '#2f4a34';
    ctx.fillRect(sc.left - 6, sc.top - 6, sc.w + 12, 14);
    ctx.fillRect(sc.left - 6, sc.top + sc.h - 8, sc.w + 12, 14);
  }

  // 卷轴上下边缘墨色渐隐（卷轴坐进画面，不贴在上面；虚线与微粒随后绘制，保持清晰）
  ctx.save();
  ctx.beginPath(); ctx.rect(sc.left, sc.top, sc.w, sc.h); ctx.clip();
  const fe = ctx.createLinearGradient(0, sc.top, 0, sc.top + sc.h);
  fe.addColorStop(0, 'rgba(24,30,22,0.35)');
  fe.addColorStop(0.07, 'rgba(24,30,22,0)');
  fe.addColorStop(0.93, 'rgba(24,30,22,0)');
  fe.addColorStop(1, 'rgba(24,30,22,0.35)');
  ctx.fillStyle = fe;
  ctx.fillRect(sc.left, sc.top, sc.w, sc.h);
  ctx.restore();

  // v11：宣纸内衬软边。track_scroll.png 里「画心」是一块偏灰的淡墨面板，
  // 与四周米色纸边之间有一道硬直的拼缝（放大看就是一块灰方框）。
  // 这里沿纸边内侧压一圈米色羽化，把拼缝化开，读作古纸的自然包浆。
  drawPaperBlend(sc);

  // 墨河导航虚线（很淡，帮助玩家看清落点轨迹）
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = G.feverLeft > 0 ? 'rgba(255,215,110,0.55)' : 'rgba(190,170,130,0.4)';
  ctx.lineWidth = 1.6;
  ctx.setLineDash([7, 11]);
  ctx.beginPath();
  for (let y = Geo.track.topY; y <= Geo.track.judgeY; y += 8) {
    const px = trackCX(y);
    y === Geo.track.topY ? ctx.moveTo(px, y) : ctx.lineTo(px, y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // 河面上浮动的灵气微粒
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const q of G.qiStream) {
    const qx = trackCX(q.y) + Math.sin(q.y * 0.05 + q.seed) * 12;
    ctx.globalAlpha = clamp(q.life, 0, 1) * 0.8;
    ctx.fillStyle = q.gold ? '#ffd76e' : '#7df0c4';
    ctx.beginPath();
    ctx.arc(qx, q.y, q.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // 卷轴墨瀑 + 底部墨池（常态淡淡一层，天人合一全开；不遮音符）
  ScrollInk.draw(now);

  ctx.restore();
}

/* ---------------- 水墨漩涡贴图（v11 离线去色 + 圆形羽化） ----------------
   ink_water.png 原图是「青绿 + 金屑」的彩色漩涡、且是不透明白底方图，
   直接 multiply 会在卷轴上盖出一块带硬边的青灰色方块（这正是旧版「拼接感」的元凶之一）。
   这里在加载后一次性处理：saturation 混合去色 → 变成墨，再 destination-in 径向羽化
   → 只剩一团圆形墨气，边缘无缝融进宣纸。 */
const InkSprite = { made: false, canvas: null };
function inkVortexSprite() {
  if (InkSprite.made) return InkSprite.canvas;
  InkSprite.made = true;
  const img = IMG.inkWater;
  if (!img) return (InkSprite.canvas = null);
  const S = 512;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, S, S);
  // 去色：保留明度、抽掉饱和度 → 青绿变墨灰
  g.globalCompositeOperation = 'saturation';
  g.fillStyle = 'hsl(0, 0%, 50%)';
  g.fillRect(0, 0, S, S);
  // 圆形羽化，去掉方角
  g.globalCompositeOperation = 'destination-in';
  const rg = g.createRadialGradient(S / 2, S / 2, S * 0.16, S / 2, S / 2, S * 0.5);
  rg.addColorStop(0, 'rgba(0,0,0,1)');
  rg.addColorStop(0.66, 'rgba(0,0,0,0.92)');
  rg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, S, S);
  InkSprite.canvas = c;
  return c;
}

/* ---------------- 宣纸内衬软边 ---------------- */
function drawPaperBlend(sc) {
  const pad = sc.w * 0.3;            // 纸边到画心的过渡宽度（画心约占 16%~84%，压到 30% 才盖住拼缝）
  const padY = sc.h * 0.09;
  ctx.save();
  ctx.beginPath(); ctx.rect(sc.left, sc.top, sc.w, sc.h); ctx.clip();
  const cream = 'rgba(230, 214, 178, ';
  // 整体压一层极淡米色：纸边与画心的灰调差被拉平，拼缝自然消失，墨河也更像"落在纸上"
  ctx.fillStyle = cream + '0.18)';
  ctx.fillRect(sc.left, sc.top, sc.w, sc.h);
  // 左 / 右
  let g = ctx.createLinearGradient(sc.left, 0, sc.left + pad, 0);
  g.addColorStop(0, cream + '0.6)'); g.addColorStop(0.55, cream + '0.24)'); g.addColorStop(1, cream + '0)');
  ctx.fillStyle = g; ctx.fillRect(sc.left, sc.top, pad, sc.h);
  g = ctx.createLinearGradient(sc.left + sc.w, 0, sc.left + sc.w - pad, 0);
  g.addColorStop(0, cream + '0.6)'); g.addColorStop(0.55, cream + '0.24)'); g.addColorStop(1, cream + '0)');
  ctx.fillStyle = g; ctx.fillRect(sc.left + sc.w - pad, sc.top, pad, sc.h);
  // 上 / 下
  g = ctx.createLinearGradient(0, sc.top, 0, sc.top + padY);
  g.addColorStop(0, cream + '0.5)'); g.addColorStop(0.5, cream + '0.18)'); g.addColorStop(1, cream + '0)');
  ctx.fillStyle = g; ctx.fillRect(sc.left, sc.top, sc.w, padY);
  g = ctx.createLinearGradient(0, sc.top + sc.h, 0, sc.top + sc.h - padY);
  g.addColorStop(0, cream + '0.5)'); g.addColorStop(0.5, cream + '0.18)'); g.addColorStop(1, cream + '0)');
  ctx.fillStyle = g; ctx.fillRect(sc.left, sc.top + sc.h - padY, sc.w, padY);

  // 画心「绫边」描金细线：把那条拼缝做成装裱边，缺陷变工艺
  const bx = sc.left + sc.w * 0.163;
  const bw = sc.w * (0.838 - 0.163);
  const by = sc.top + sc.h * 0.0997;
  const bh = sc.h * (0.871 - 0.0997);
  ctx.strokeStyle = 'rgba(150, 118, 64, 0.55)';
  ctx.lineWidth = 1;
  ctx.strokeRect(bx, by, bw, bh);
  ctx.strokeStyle = 'rgba(255, 250, 234, 0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(bx + 2, by + 2, bw - 4, bh - 4);
  ctx.restore();
}

/* ---------------- 判定盘 ----------------
   v11.1：拆成「底层 / 表层」两段，中间夹着音符绘制。
   原因（用户实测反馈）：判定盘正好压在音符落点上，而旧版把漩涡、墨环、太极盘
   全画在音符之上——落判那一瞬间音符被整块盖住，还叠了一层 multiply 把亮边压暗，
   玩家根本看不清该不该按。现在底纹在音符之下，音符永远在最上层；
   太极盘退成半透明水印 + 一根描金玉璧环，保留「坐进画里那个留白圆」的构图，
   但不再遮挡判定点。 */
function judgePulse(now) {
  return G.feverLeft > 0 ? 1 + Math.sin(now * 11) * 0.06 : 1 + Math.sin(now * 2.2) * 0.02;
}

/* 底层：泉眼底光 + 水墨漩涡 + 断续墨环 + 判定线（全部画在音符之下） */
function drawJudgeBack(now) {
  const cx = Geo.scroll.cx;
  const cy = Geo.track.judgeY;
  const R = Geo.scroll.judgeR;
  const fever = G.feverLeft > 0;
  const pulse = judgePulse(now);

  // 泉眼底光：给落点先铺一层暖光，音符压上来才有对比（不然白纸+墨河，浅色音符糊成一片）
  ctx.save();
  const lg = ctx.createRadialGradient(cx, cy, R * 0.15, cx, cy, R * 1.92);
  lg.addColorStop(0, fever ? 'rgba(255,246,214,0.30)' : 'rgba(250,243,222,0.26)');
  lg.addColorStop(0.5, fever ? 'rgba(255,240,196,0.12)' : 'rgba(246,237,210,0.10)');
  lg.addColorStop(1, 'rgba(246,237,210,0)');
  ctx.fillStyle = lg;
  ctx.beginPath(); ctx.arc(cx, cy, R * 1.92, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // 水墨漩涡（旋转，和太极盘同向）
  const vortex = inkVortexSprite();
  if (vortex) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(now * 0.35);
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = fever ? 0.5 : 0.34;
    const rw = R * 2.24 * pulse;
    ctx.drawImage(vortex, -rw / 2, -rw / 2, rw, rw);
    ctx.restore();
  }

  // 断续墨环（内快外慢）
  ctx.save();
  ctx.translate(cx, cy);
  for (let i = 0; i < 2; i++) {
    const rr = R * (1.28 + i * 0.42) * pulse;
    ctx.save();
    ctx.rotate(now * (i === 0 ? 0.9 : -0.55) + i);
    ctx.strokeStyle = i === 0
      ? (fever ? 'rgba(255,220,130,0.75)' : 'rgba(74,60,40,0.6)')
      : (fever ? 'rgba(255,236,180,0.45)' : 'rgba(58,48,34,0.42)');
    ctx.lineWidth = i === 0 ? 3.2 : 2;
    ctx.setLineDash(i === 0 ? [26, 16, 8, 16] : [12, 20]);
    ctx.beginPath();
    ctx.arc(0, 0, rr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();

  // 判定线（v11）：一条贯穿全卷的极细金线，两端收成笔锋。
  const halfW = R * 1.9;
  const brushLine = (x1, x2, w) => {
    ctx.beginPath();
    ctx.moveTo(x1, cy);
    ctx.quadraticCurveTo((x1 * 2 + x2) / 3, cy - w, (x1 + x2) / 2, cy);
    ctx.quadraticCurveTo((x1 * 2 + x2) / 3, cy + w, x1, cy);
    ctx.closePath();
    ctx.moveTo(x2, cy);
    ctx.quadraticCurveTo((x2 * 2 + x1) / 3, cy - w, (x1 + x2) / 2, cy);
    ctx.quadraticCurveTo((x2 * 2 + x1) / 3, cy + w, x2, cy);
    ctx.closePath();
    ctx.fill();
  };
  ctx.save();
  ctx.fillStyle = fever ? 'rgba(240,226,186,0.62)' : 'rgba(160,132,78,0.5)';
  brushLine(cx - halfW, cx + halfW, 1.5);
  ctx.fillStyle = fever ? 'rgba(255,246,214,0.6)' : 'rgba(230,206,158,0.4)';
  ctx.fillRect(cx - halfW * 0.62, cy - 0.4, halfW * 1.24, 0.8);
  ctx.restore();
}

/* 中层：太极盘 + 描金玉璧环。
   这一段画在音符**之下**——盘保持不透明（墨白要够脆，半透明会发灰发浑），
   但音符画在它上面，所以判定瞬间音符永远完整可见。
   同时它画在漩涡**之上**，墨白盘面替音符挡住了背后那团深墨，对比反而更清楚。 */
function drawJudgePad(now) {
  const cx = Geo.scroll.cx;
  const cy = Geo.track.judgeY;
  const R = Geo.scroll.judgeR;
  const fever = G.feverLeft > 0;
  const pulse = judgePulse(now);
  // 0.86R：仍坐进画里那个半径约 1.17R 的留白圆，但比旧版 0.92R 收一圈
  const tr = R * 0.86 * pulse;

  ctx.save();
  ctx.shadowColor = fever ? 'rgba(220,193,137,0.7)' : 'rgba(110,92,58,0.4)';
  ctx.shadowBlur = fever ? 14 : 7;
  drawTaiChi(cx, cy, tr, now * 0.9);
  ctx.restore();

  // 描金玉璧环：只描边不填色，把落点圈清楚
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, tr + 4, 0, Math.PI * 2);
  ctx.strokeStyle = fever ? 'rgba(245,228,186,0.95)' : 'rgba(201,168,106,0.85)';
  ctx.lineWidth = 1.7;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, tr + 9, 0, Math.PI * 2);
  ctx.strokeStyle = fever ? 'rgba(220,193,137,0.4)' : 'rgba(201,168,106,0.24)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

/* 表层：只放命中高光（必须在音符之上，才有「打到了」的反馈） */
function drawJudgeFront(now) {
  const cx = Geo.scroll.cx;
  const cy = Geo.track.judgeY;
  const R = Geo.scroll.judgeR;
  if (G.hitFlash > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const a = G.hitFlash;
    const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, R * 2.2);
    g.addColorStop(0, `rgba(255,246,214,${0.55 * a})`);
    g.addColorStop(0.45, `rgba(255,215,110,${0.30 * a})`);
    g.addColorStop(1, 'rgba(255,215,110,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, R * 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

/* ---------------- 音符 ---------------- */
function noteY(time) {
  const span = Geo.track.judgeY - Geo.track.topY;
  const app = (G.song ? G.song.approach : 2) * (G.approachMult || 1);
  let rem = time - G.songTime;
  // 实战教程 v8：冻结时目标音符按滑行进度 ease 到判定线并停在那里（其余音符不动）
  if (G.tutFrozen && G.tutorial && G.tutorial.target && Math.abs(time - G.tutorial.target.time) < 0.001) {
    rem *= (1 - easeOut(Math.min(1, G.tutGlide)));
  }
  return Geo.track.judgeY - rem / app * span;
}

/* 闪身叶片路径（v8）：叶片描边与叶片本体共用同一形状，保证相位描边严丝合缝 */
function traceSlideBlade(cx, y, sign, k) {
  const bladeLen = 52 * k, bladeH = 21 * k;
  ctx.beginPath();
  ctx.moveTo(sign * bladeLen + cx, y);
  ctx.quadraticCurveTo(sign * 14 * k + cx, -bladeH + y, -sign * (bladeLen * 0.42) + cx, -bladeH * 0.32 + y);
  ctx.quadraticCurveTo(-sign * (bladeLen * 0.72) + cx, y, -sign * (bladeLen * 0.42) + cx, bladeH * 0.32 + y);
  ctx.quadraticCurveTo(sign * 14 * k + cx, bladeH + y, sign * bladeLen + cx, y);
  ctx.closePath();
}

function drawNotes() {
  if (!G.song) return;
  const judgeY = Geo.track.judgeY;
  const sc = Geo.scroll;

  // v11：音符一律剪在卷轴纸面内——旧版音符会飘到卷轴上方、悬在背景画上，
  // 这是很典型的一张图"贴"在另一张图上的破功点。
  ctx.save();
  ctx.beginPath();
  ctx.rect(sc.left + 4, sc.top + 8, sc.w - 8, sc.h - 16);
  ctx.clip();

  for (const n of G.chart) {
    if (n.judged) continue;
    const y = noteY(n.time);
    if (y < Geo.scroll.top - 4) continue;
    if (n.type !== 'hold' && y > judgeY + 60) continue;

    const cx = trackCX(Math.min(y, judgeY));
    let near = 1 - Math.min(1, Math.abs(n.time - G.songTime) / 0.5);
    if (G.tutFrozen && G.tutorial && G.tutorial.target === n) near = 1; // 冻结的目标音符已滑到判定线，按“已到”渲染
    const fadeIn = clamp((y - (Geo.scroll.top - 4)) / 54, 0, 1);

    ctx.save();
    ctx.globalAlpha = fadeIn;

    // 阴阳轮转相位环（v6）：金环=阳、青环=阴，与 HUD 太极盘相位一致时踩准得加成
    // v11：阴环由亮蓝改青瓷灰蓝，退出霓虹色系
    if (typeof n.phase === 'number') {
      const phaseA = 0.9 * (0.25 + 0.75 * near);
      ctx.save();
      ctx.strokeStyle = n.phase === 1 ? `rgba(220,193,137,${phaseA})` : `rgba(112,140,163,${phaseA})`;
      ctx.lineWidth = 1.8;
      if (n.type === 'slide') {
        const sign = n.dir < 0 ? -1 : 1;
        traceSlideBlade(cx, y, sign, 1.16);
        ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(cx, y, 24, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    }

    if (n.type === 'tap') {
      // 上浮墨烟
      const tg = ctx.createLinearGradient(0, y - 76, 0, y);
      tg.addColorStop(0, 'rgba(140,44,26,0)');
      tg.addColorStop(1, `rgba(140,44,26,${0.12 + near * 0.2})`);
      ctx.fillStyle = tg;
      ctx.fillRect(cx - 11, y - 76, 22, 76);

      if (IMG.noteTap) {
        // v12：美术音符到位后直接用图（44 = 圆牌直径），程序化只作为回退
        const s = 44 * (1 + near * 0.06);
        ctx.save();
        ctx.globalAlpha = fadeIn;
        ctx.shadowColor = 'rgba(110,36,20,0.45)';
        ctx.shadowBlur = 4 + near * 10;
        ctx.drawImage(IMG.noteTap, cx - s / 2, y - s / 2, s, s);
        ctx.restore();
      } else {
      // 朱砂印圆牌（v11：压暗、去发光、描金细边）
      ctx.save();
      ctx.shadowColor = 'rgba(110,36,20,0.5)';
      ctx.shadowBlur = 5 + near * 12;
      const grad = ctx.createRadialGradient(cx - 6, y - 7, 2, cx, y, 21);
      grad.addColorStop(0, '#b8462e');
      grad.addColorStop(0.62, '#8f2a17');
      grad.addColorStop(1, '#63200f');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(cx, y, 20, 0, Math.PI * 2); ctx.fill();

      ctx.strokeStyle = 'rgba(236,214,170,0.85)';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(236,214,170,0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, y, 15.5, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();

      // 中心迷你太极（墨白描金，与判定盘同一套语言）
      drawTaiChi(cx, y, 10.5, performance.now() / 1400);
      }

      // 接近判定时的收束光圈
      if (near > 0.05) {
        ctx.save();
        ctx.globalAlpha = fadeIn * near * 0.8;
        ctx.strokeStyle = 'rgba(236,214,170,0.75)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(cx, y, 20 + (1 - near) * 34, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    } else if (n.type === 'slide') {
      const sign = n.dir < 0 ? -1 : 1;
      const bladeLen = 52;
      const bladeH = 21;
      if (IMG.noteSlide) {
        // v12：美术叶片（朝右）；左向由代码镜像
        const sw = 116, sh = sw * (IMG.noteSlide.height / IMG.noteSlide.width);
        ctx.save();
        ctx.globalAlpha = fadeIn;
        ctx.translate(cx, y);
        ctx.scale(sign, 1);
        ctx.shadowColor = 'rgba(250,246,232,0.85)';
        ctx.shadowBlur = 7;
        ctx.drawImage(IMG.noteSlide, -sw / 2, -sh / 2, sw, sh);
        ctx.restore();
      } else {
      ctx.save();
      ctx.translate(cx, y);
      ctx.shadowColor = `rgba(40,70,56,${0.4 + near * 0.35})`;
      ctx.shadowBlur = 5 + near * 12;

      ctx.beginPath();
      ctx.moveTo(sign * bladeLen, 0);
      ctx.quadraticCurveTo(sign * 14, -bladeH, -sign * (bladeLen * 0.42), -bladeH * 0.32);
      ctx.quadraticCurveTo(-sign * (bladeLen * 0.72), 0, -sign * (bladeLen * 0.42), bladeH * 0.32);
      ctx.quadraticCurveTo(sign * 14, bladeH, sign * bladeLen, 0);
      ctx.closePath();

      // v11：青瓷（去掉霓虹嫩绿），描金细边
      const bg = ctx.createLinearGradient(-sign * 26, 0, sign * bladeLen, 0);
      bg.addColorStop(0, 'rgba(16,28,21,0.95)');
      bg.addColorStop(0.45, 'rgba(48,88,68,0.95)');
      bg.addColorStop(0.86, '#5a8b74');
      bg.addColorStop(1, '#a8c9b8');
      // 先描一圈米白外光：音符要压在深墨河上，没有这圈亮边就糊进河里看不见
      ctx.save();
      ctx.shadowColor = 'rgba(250,246,232,0.9)';
      ctx.shadowBlur = 9;
      ctx.strokeStyle = 'rgba(250,246,232,0.95)';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = bg;
      ctx.fill();
      ctx.strokeStyle = 'rgba(201,168,106,0.8)';
      ctx.lineWidth = 1.3;
      ctx.stroke();

      ctx.strokeStyle = 'rgba(250,246,232,0.7)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-sign * 14, 0);
      ctx.lineTo(sign * (bladeLen - 14), 0);
      ctx.stroke();

      // 「闪」+ 箭头（v11：弦月号换成手画三角箭头，方向一眼可读）
      ctx.font = '700 12px "Ma Shan Zheng","STKaiti","KaiTi",serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#f8f2e2';
      ctx.shadowColor = 'rgba(0,0,0,0.75)';
      ctx.shadowBlur = 3;
      ctx.fillText('闪', -sign * 8, 0);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(248,242,226,0.95)';
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(sign * (bladeLen - 16), -6.5);
      ctx.lineTo(sign * (bladeLen - 5), 0);
      ctx.lineTo(sign * (bladeLen - 16), 6.5);
      ctx.stroke();
      ctx.restore();
      }
    } else if (n.type === 'hold') {
      const tailY = noteY(n.time + n.dur);
      if (tailY > judgeY + 80) continue;
      const headY = Math.min(y, judgeY);
      const headCx = trackCX(headY);
      const minY = Geo.scroll.top + 26;
      const from = clamp(Math.min(tailY, judgeY), minY, judgeY);
      const to = clamp(Math.min(headY, judgeY), minY, judgeY);

      const path = () => {
        ctx.beginPath();
        let first = true;
        for (let yy = from; yy <= to; yy += 8) {
          const px = trackCX(yy);
          if (first) { ctx.moveTo(px, yy); first = false; } else ctx.lineTo(px, yy);
        }
        ctx.lineTo(headCx, to);
      };

      ctx.lineCap = 'round';
      path();
      ctx.strokeStyle = n.holding ? 'rgba(63,102,80,0.95)' : 'rgba(38,64,50,0.85)';
      ctx.lineWidth = 22;
      ctx.stroke();

      // 金芯（v11：原来是嫩绿霓虹芯，现在一根描金线，像卷轴上的一笔）
      path();
      ctx.strokeStyle = n.holding ? 'rgba(240,226,186,0.95)' : 'rgba(201,178,130,0.75)';
      ctx.lineWidth = 5;
      ctx.stroke();

      ctx.save();
      ctx.shadowColor = n.holding ? 'rgba(200,180,130,0.7)' : 'rgba(40,64,50,0.5)';
      ctx.shadowBlur = (n.holding ? 14 : 7) + near * 8;
      ctx.globalAlpha = headY > Geo.scroll.top - 4 ? 1 : 0;
      if (IMG.noteHoldHead) {
        const s = 44;
        ctx.drawImage(IMG.noteHoldHead, headCx - s / 2, headY - s / 2, s, s);
      } else {
      ctx.beginPath(); ctx.arc(headCx, headY, 18, 0, Math.PI * 2);
      ctx.fillStyle = n.holding ? '#2f5340' : '#1e3327';
      ctx.fill();
      ctx.strokeStyle = 'rgba(220,193,137,0.85)';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.font = '700 13px "Ma Shan Zheng","STKaiti","KaiTi",serif';
      ctx.fillStyle = '#f6ecd4';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('纳', headCx, headY);
      }
      ctx.restore();

      if (n.holding) {
        ctx.beginPath();
        ctx.arc(headCx, headY, 25 + Math.sin(performance.now() / 90) * 4, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(220,193,137,0.8)';
        ctx.lineWidth = 2.4;
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  ctx.restore();   // 解除卷轴纸面裁剪
}

/* ---------------- 名牌（v11：一方纸签 + 一道朱砂，不再做描金木牌） ---------------- */
function drawNamePlate(x, y, name) {
  ctx.save();
  ctx.font = '600 11px "Noto Serif SC","Songti SC","SimSun",serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = ctx.measureText(name).width + 22;
  const h = 19;

  ctx.fillStyle = 'rgba(250,246,235,0.92)';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x - w / 2, y, w, h, 2); else ctx.rect(x - w / 2, y, w, h);
  ctx.fill();
  ctx.strokeStyle = 'rgba(125,97,50,0.45)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // 左侧朱砂短竖：一处点睛，替代原来两端各一块的金色木榫
  ctx.fillStyle = 'rgba(168,52,31,0.85)';
  ctx.fillRect(x - w / 2 + 5, y + 4.5, 2, h - 9);

  ctx.fillStyle = '#33362b';
  ctx.fillText(name, x + 3, y + h / 2 + 0.5);
  ctx.restore();
}

/* ---------------- 道童 ---------------- */
function drawHero(now) {
  const act = G.songTime < G.character.until ? G.character.action : 'idle';
  const baseX = Geo.hero.x;
  const baseY = Geo.hero.y;
  const k = Geo.hero.scale;

  let cx = baseX, cy = baseY, lean = 0, aura = 0;
  if (act === 'push') cx += 9 * k;
  else if (act === 'dodge') { cx += G.character.dir * 40 * k; lean = G.character.dir * 0.15; }
  else if (act === 'breathe') aura = 24 + Math.sin(now * 4) * 6;
  else if (act === 'stagger') { lean = Math.sin(now * 26) * 0.07; cy += 3; }
  else cy += Math.sin(now * 2.1) * 2.5;

  // 纸晕：人物背后一层极淡墨气，把亮背景压下去一档，人物才不会"贴"在画上
  ctx.save();
  const hg = ctx.createRadialGradient(baseX, baseY - 100 * k, 8, baseX, baseY - 100 * k, 165 * k);
  hg.addColorStop(0, 'rgba(26,38,28,0.14)');
  hg.addColorStop(0.62, 'rgba(26,38,28,0.07)');
  hg.addColorStop(1, 'rgba(26,38,28,0)');
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.ellipse(baseX, baseY - 100 * k, 165 * k, 190 * k, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 柔和接触阴影（脚下压一层模糊暗晕，人物站进地面而不是贴在上面）
  ctx.save();
  ctx.fillStyle = 'rgba(12,18,12,0.26)';
  ctx.shadowColor = 'rgba(12,18,12,0.5)';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.ellipse(baseX, baseY + 9, 48 * k, 9 * k, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 气场环
  ctx.save();
  ctx.translate(cx, cy - 40 * k);
  ctx.rotate(now * 1.6);
  ctx.strokeStyle = `rgba(143,179,160,${0.24 + G.comboGlow * 0.28})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 54 * k, 0, Math.PI * 1.35);
  ctx.stroke();
  ctx.strokeStyle = `rgba(220,193,137,${G.feverLeft > 0 ? 0.75 : 0.26 + G.comboGlow * 0.26})`;
  ctx.beginPath();
  ctx.arc(0, 0, 46 * k, Math.PI, Math.PI * 2.3);
  ctx.stroke();
  ctx.restore();

  const key = (G.swordT > 0 && IMG.heroSword) ? 'heroSword'
    : act === 'push' ? 'hero_push'
    : act === 'dodge' ? 'hero_dodge'
    : act === 'breathe' ? 'hero_hold'
    : act === 'stagger' ? 'hero_hurt'
    : 'hero_idle';

  const img = IMG[key] || IMG.hero_idle;
  if (img) {
    const dh = 276 * k;
    const dw = dh * img.width / img.height;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(lean);
    if (aura > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(143,179,160,0.45)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, -dh * 0.42, aura + 46 * k, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    if (act === 'dodge' && G.character.dir < 0) ctx.scale(-1, 1);
    ctx.shadowColor = 'rgba(10,18,12,0.45)';
    ctx.shadowBlur = 12;
    ctx.drawImage(img, -dw / 2, 6 - dh, dw, dh);
    ctx.restore();
  } else {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(lean);
    ctx.fillStyle = '#3d6b52';
    ctx.beginPath();
    ctx.moveTo(0, -34 * k); ctx.lineTo(34 * k, -4 * k); ctx.lineTo(-34 * k, -4 * k);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.arc(0, -58 * k, 22 * k, 0, Math.PI * 2);
    ctx.fillStyle = '#f2c99b'; ctx.fill();
    ctx.restore();
  }

  drawNamePlate(baseX, baseY + 16, '小道童');
}

/* ---------------- 小怪 ---------------- */
function enemyAnchor(idx) {
  const e = Geo.enemies[idx];
  const g = G.enemies[idx];
  return { x: e.x - (g ? g.advance : 0) * 0.6, y: e.y };
}

function drawEnemies(now) {
  for (let i = 0; i < G.enemies.length; i++) {
    const g = G.enemies[i];
    const a = enemyAnchor(i);
    const k = Geo.enemies[i].scale;
    const x = a.x;
    const y = a.y + Math.sin(now * 2 + i * 2) * 3;

    // 脚下纸晕（v11：去掉描金选中环，改成一层柔和墨气）
    ctx.save();
    const eg = ctx.createRadialGradient(x, y - 40 * k, 6, x, y - 40 * k, 92 * k);
    eg.addColorStop(0, 'rgba(30,38,28,0.15)');
    eg.addColorStop(0.6, 'rgba(30,38,28,0.07)');
    eg.addColorStop(1, 'rgba(30,38,28,0)');
    ctx.fillStyle = eg;
    ctx.beginPath();
    ctx.ellipse(x, y - 40 * k, 92 * k, 108 * k, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 柔和接触阴影（脚下压一层模糊暗晕，小怪站进地面）
    ctx.save();
    ctx.fillStyle = 'rgba(12,18,12,0.28)';
    ctx.shadowColor = 'rgba(12,18,12,0.46)';
    ctx.shadowBlur = 9;
    ctx.beginPath();
    ctx.ellipse(x, y + 48 * k, 34 * k, 7 * k, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const img = IMG[g.kind === 'eye' ? 'enemy_eye' : 'enemy_waist'];
    if (img) {
      const dh = (g.kind === 'eye' ? 172 : 154) * k;
      const dw = dh * img.width / img.height;
      ctx.save();
      ctx.translate(x, y);
      if (g.flash > 0) ctx.globalAlpha = 0.55 + Math.sin(now * 40) * 0.3;
      ctx.shadowColor = 'rgba(10,18,12,0.45)';
      ctx.shadowBlur = 12;
      ctx.drawImage(img, -dw / 2, 44 * k - dh, dw, dh);
      ctx.restore();
    }

    // 亚健康标注
    if (g.kind === 'waist') {
      ctx.save();
      ctx.font = '600 10px "Noto Serif SC","Songti SC",serif';
      ctx.fillStyle = '#9e6232';
      ctx.textAlign = 'center';
      ctx.fillText('酸痛', x - 44 * k, y - 30 * k);
      ctx.fillText('酸痛', x + 42 * k, y - 12 * k);
      ctx.restore();
    }

    drawNamePlate(x, y + 52 * k, g.name);
  }
}

/* ============================================================
   离屏缓存：全屏渐变只在布局改变时生成一次，
   之后每帧只是一次 drawImage 位块传输（对手机显卡非常友好）
   ============================================================ */
const Cache = { key: '', backdrop: null, edge: null, fever: null, flash: null };

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function buildCache() {
  const W = Math.round(Layout.W), H = Math.round(Layout.H);
  const key = W + 'x' + H;
  if (Cache.key === key) return;
  Cache.key = key;

  // 1. 上下暗角 + 地面薄雾
  const bd = makeCanvas(W, H);
  const bc = bd.getContext('2d');
  const vg = bc.createLinearGradient(0, 0, 0, H);
  vg.addColorStop(0, 'rgba(18,26,20,0.34)');
  vg.addColorStop(0.26, 'rgba(18,26,20,0)');
  vg.addColorStop(0.72, 'rgba(18,26,20,0)');
  vg.addColorStop(1, 'rgba(18,26,20,0.40)');
  bc.fillStyle = vg;
  bc.fillRect(0, 0, W, H);

  const gy = H - 96;
  const gg = bc.createLinearGradient(0, gy, 0, H);
  gg.addColorStop(0, 'rgba(228,236,222,0)');
  gg.addColorStop(0.55, 'rgba(228,236,222,0.22)');
  gg.addColorStop(1, 'rgba(214,226,208,0.42)');
  bc.fillStyle = gg;
  bc.fillRect(0, gy, W, 96);

  // 1b. 四周暗角 + 暖色墨洗（去拼接：把画面压成一个氛围，音符区留亮）
  const vg2 = bc.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.42, W / 2, H * 0.45, Math.max(W, H) * 0.72);
  vg2.addColorStop(0, 'rgba(20,26,18,0)');
  vg2.addColorStop(1, 'rgba(20,26,18,0.20)');
  bc.fillStyle = vg2;
  bc.fillRect(0, 0, W, H);
  const ww = bc.createLinearGradient(0, 0, 0, H);
  ww.addColorStop(0, 'rgba(216,186,140,0.05)');
  ww.addColorStop(0.5, 'rgba(216,186,140,0)');
  ww.addColorStop(1, 'rgba(190,160,110,0.06)');
  bc.fillStyle = ww;
  bc.fillRect(0, 0, W, H);
  Cache.backdrop = bd;

  // 2. 连击热浪（四周金光）
  const eg = makeCanvas(W, H);
  const ec = eg.getContext('2d');
  const cx = Geo.scroll.cx, cy = Geo.track.judgeY;
  const rg = ec.createRadialGradient(cx, cy, H * 0.34, cx, cy, W * 0.62);
  rg.addColorStop(0, 'rgba(255,215,110,0)');
  rg.addColorStop(1, 'rgba(255,196,90,1)');
  ec.fillStyle = rg;
  ec.fillRect(0, 0, W, H);
  Cache.edge = eg;

  // 3. 天人合一金色氛围
  const fg = makeCanvas(W, H);
  const fc = fg.getContext('2d');
  const rg2 = fc.createRadialGradient(cx, cy, 40, cx, cy, W * 0.6);
  rg2.addColorStop(0, 'rgba(255,215,110,1)');
  rg2.addColorStop(1, 'rgba(255,215,110,0)');
  fc.fillStyle = rg2;
  fc.fillRect(0, 0, W, H);
  Cache.fever = fg;

  // 4. 全屏闪光
  const xg = makeCanvas(W, H);
  const xc = xg.getContext('2d');
  const rg3 = xc.createRadialGradient(cx, cy, 20, cx, cy, W * 0.62);
  rg3.addColorStop(0, 'rgba(255,246,214,0.95)');
  rg3.addColorStop(0.5, 'rgba(255,215,110,0.35)');
  rg3.addColorStop(1, 'rgba(255,215,110,0)');
  xc.fillStyle = rg3;
  xc.fillRect(0, 0, W, H);
  Cache.flash = xg;
}

/* ---------------- 局内背景氛围 ---------------- */
/* 西湖关程序化背景：湖面渐变 + 远山 + 断桥剪影 + 荷花/柳枝（真美术到位前用它） */
function drawXihuBackdrop(now) {
  const W = Layout.W, H = Layout.H;
  if (IMG.bgXihu) {
    // v6 真美术：cover-fit + 轻纱（保音符对比），再留几道湖面微光作动态
    const iw = IMG.bgXihu.width, ih = IMG.bgXihu.height;
    const k = Math.max(W / iw, H / ih);
    const dw = iw * k, dh = ih * k;
    ctx.drawImage(IMG.bgXihu, (W - dw) / 2, (H - dh) / 2, dw, dh);
    ctx.fillStyle = 'rgba(223,233,220,0.16)';
    ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const yy = 330 + i * 38 + Math.sin(now * 0.7 + i) * 4;
      ctx.globalAlpha = 0.07;
      ctx.fillStyle = '#eaf6ee';
      ctx.fillRect(40 + (i % 3) * 90, yy, 200 - i * 12, 2.5);
    }
    ctx.restore();
    return;
  }
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#dfe9dc');
  g.addColorStop(0.45, '#c3d8c8');
  g.addColorStop(0.46, '#9dc3b2');
  g.addColorStop(1, '#5e9683');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.globalAlpha = 0.35; ctx.fillStyle = '#5f7d6e';
  ctx.beginPath(); ctx.moveTo(0, 250);
  for (let x = 0; x <= W; x += 40) ctx.lineTo(x, 250 - Math.sin(x * 0.008 + 1.2) * 46 - Math.sin(x * 0.02) * 14);
  ctx.lineTo(W, 290); ctx.lineTo(0, 290); ctx.closePath(); ctx.fill(); ctx.restore();
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 7; i++) {
    const yy = 300 + i * 38 + Math.sin(now * 0.7 + i) * 4;
    ctx.globalAlpha = 0.10;
    ctx.fillStyle = '#eaf6ee';
    ctx.fillRect(40 + (i % 3) * 90, yy, 200 - i * 12, 2.5);
  }
  ctx.restore();
  ctx.save(); ctx.globalAlpha = 0.30; ctx.strokeStyle = '#2c463c'; ctx.lineWidth = 10; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(W - 60, H + 30, 150, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.fillStyle = 'rgba(38,96,66,0.55)';
  for (const [lx, ly, lr] of [[70, H - 30, 46], [150, H - 14, 58], [30, H - 70, 34]]) {
    ctx.beginPath(); ctx.ellipse(lx, ly, lr, lr * 0.36, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = 'rgba(244,178,196,0.85)';
  for (let k = 0; k < 6; k++) {
    const a = -Math.PI / 2 + (k - 2.5) * 0.5;
    ctx.beginPath(); ctx.ellipse(120 + Math.cos(a) * 16, H - 66 + Math.sin(a) * 20, 9, 15, a, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = '#ffd76e';
  ctx.beginPath(); ctx.arc(120, H - 66, 5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.save(); ctx.strokeStyle = 'rgba(74,110,80,0.5)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  for (let i = 0; i < 5; i++) {
    const x0 = 30 + i * 26;
    ctx.beginPath(); ctx.moveTo(x0, 0);
    ctx.quadraticCurveTo(x0 + 18, 70, x0 + 6, 130 + i * 8);
    ctx.stroke();
  }
  ctx.restore();
}

/* 西湖前景点缀：荷花左下、柳枝右上（小尺寸，画在角色之前作背景层，绝不遮判定盘与音符） */
function drawXihuDecor(now) {
  if (!G.song || !G.song.xihu || G.state !== 'playing') return;
  const W = Layout.W, H = Layout.H;
  if (IMG.fgLotus) {
    const w = 170, h = w * IMG.fgLotus.height / IMG.fgLotus.width;
    ctx.save(); ctx.globalAlpha = 0.92;
    ctx.drawImage(IMG.fgLotus, 6, H - h - 4, w, h);
    ctx.restore();
  }
  if (IMG.fgWillow) {
    const w = 130, h = w * IMG.fgWillow.height / IMG.fgWillow.width;
    ctx.save(); ctx.globalAlpha = 0.92;
    ctx.drawImage(IMG.fgWillow, W - w - 6, 62, w, h);
    ctx.restore();
  }
}

function drawPlayBackdrop(now) {
  buildCache();
  if (G.song && G.song.xihu && G.state === 'playing') {
    drawXihuBackdrop(now);
    ctx.save(); ctx.globalAlpha = 0.5;
    if (Cache.backdrop) ctx.drawImage(Cache.backdrop, 0, 0, Layout.W, Layout.H);
    ctx.restore();
  } else if (Cache.backdrop) ctx.drawImage(Cache.backdrop, 0, 0, Layout.W, Layout.H);

  if (G.feverLeft > 0 && Cache.fever) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.10 + Math.sin(now * 6) * 0.04;
    ctx.drawImage(Cache.fever, 0, 0, Layout.W, Layout.H);
    ctx.restore();
  }

  // 连击热浪：连击越高，画面四周越是泛起金光（太鼓达人式递增反馈）
  if (G.comboGlow > 0.02 && G.state === 'playing' && Cache.edge) {
    const pulse = 0.55 + Math.sin(now * 7) * 0.45;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = G.comboGlow * 0.14 * pulse;
    ctx.drawImage(Cache.edge, 0, 0, Layout.W, Layout.H);
    ctx.restore();
  }
}

/* 画卷前景描金角纹（衬出画面层次，不构成"画框"） */
function drawCornerOrnaments(now) {
  const img = IMG.ornament;
  if (!img) return;
  const w = 118;
  const h = w * img.height / img.width;
  const H = Layout.H;
  ctx.save();
  ctx.globalAlpha = 0.42;
  ctx.translate(0, H);
  ctx.scale(1, -1);
  ctx.drawImage(img, 4, 0, w, h);
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = 0.42;
  ctx.translate(Layout.W, H);
  ctx.scale(-1, -1);
  ctx.drawImage(img, 4, 0, w, h);
  ctx.restore();
}

/* 前景底部水墨（让地面有落点） */
function drawGroundMist(now) {
  ctx.save();
  const y = Layout.H - 96;
  const g = ctx.createLinearGradient(0, y, 0, Layout.H);
  g.addColorStop(0, 'rgba(228,236,222,0)');
  g.addColorStop(0.55, 'rgba(228,236,222,0.22)');
  g.addColorStop(1, 'rgba(214,226,208,0.42)');
  ctx.fillStyle = g;
  ctx.fillRect(0, y, Layout.W, 96);
  // 3～4 团薄雾横向缓慢漂移（每团约 45 秒走一程，低透明度，不抢音符）
  const W = Layout.W, H = Layout.H;
  const mists = [
    { base: 0.18, spd: 0.021, r: 130, a: 0.13 },
    { base: 0.55, spd: 0.015, r: 170, a: 0.10 },
    { base: 0.82, spd: 0.027, r: 110, a: 0.16 },
  ];
  for (const m of mists) {
    const cx = ((m.base + now * m.spd) % 1.3 - 0.15) * W;
    const mg = ctx.createRadialGradient(cx, H - 26, 4, cx, H - 26, m.r);
    mg.addColorStop(0, `rgba(228,236,222,${m.a})`);
    mg.addColorStop(1, 'rgba(228,236,222,0)');
    ctx.fillStyle = mg;
    ctx.beginPath(); ctx.ellipse(cx, H - 26, m.r, 34, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

/* 实战教程 v8：冻结时的引导光束——从滑行中的音符垂到判定线 + 判定线脉冲光环 */
function drawTutGuide(now) {
  if (!G.tutFrozen || !G.tutorial || !G.tutorial.target) return;
  const n = G.tutorial.target;
  const y = noteY(n.time);
  const cx = trackCX(Math.min(y, Geo.track.judgeY));
  const jy = Geo.track.judgeY;
  const pulse = 0.65 + Math.sin(now * 6) * 0.35;
  ctx.save();
  if (y < jy - 4) {
    const g = ctx.createLinearGradient(0, y, 0, jy);
    g.addColorStop(0, `rgba(255,220,130,${0.75 * pulse})`);
    g.addColorStop(1, `rgba(255,220,130,${0.15 * pulse})`);
    ctx.strokeStyle = g;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.setLineDash([10, 8]);
    ctx.lineDashOffset = -now * 46;
    ctx.beginPath(); ctx.moveTo(cx, y); ctx.lineTo(cx, jy); ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.strokeStyle = `rgba(255,226,150,${0.85 * pulse})`;
  ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.arc(cx, jy, 26 + Math.sin(now * 6) * 5, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = `rgba(255,226,150,${0.35 * pulse})`;
  ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.arc(cx, jy, 36 + Math.sin(now * 6) * 6, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

/* ============================================================
   渲染管线
   ============================================================ */
function render() {
  const now = performance.now() / 1000;

  ctx.setTransform(ctxScale, 0, 0, ctxScale, 0, 0);
  ctx.clearRect(0, 0, Layout.W, Layout.H);

  ctx.save();
  if (G.shake > 0) {
    const s = G.shake * 10;
    ctx.translate(rand(-s, s), rand(-s, s) * 0.7);
  }

  // 通用氛围
  drawPetals(now);
  drawMotes(now);
  drawWindStreaks(now);

  if (G.state === 'home' || G.state === 'menu') {
    ctx.restore();
    return;
  }

  drawPlayBackdrop(now);
  drawStageLayers(now);      // v12：分层远景/中景/地面（有图才生效）
  drawBackFog(now);          // v12：人物背后的景深雾
  drawGroundMist(now);
  drawXihuDecor(now);
  drawScrollTrack(now);

  // 判定盘分三层：底纹（漩涡/墨环/判定线）→ 太极盘 → 音符 → 命中高光
  // v11.1：初版把整块判定盘画在音符之上，判定瞬间音符被盖住、还叠了 multiply 压暗，
  // 玩家根本看不清该不该按。现在音符永远压在盘面之上。
  drawJudgeBack(now);
  drawJudgePad(now);
  if (G.state === 'playing' || G.state === 'result') drawNotes();
  drawJudgeFront(now);
  if (G.tutFrozen) drawTutGuide(now);

  // v12：天人合一的「墨气登仙」演出（墨柱 + 地面墨阵 + 诗句），画在角色之后
  drawFeverAscent(now);

  // 打斗期间把本体压暗一档：墨灵读作前景庆祝特效，不与实体角色抢视线（不改布局与判定）
  const duelDim = Duel.active();
  if (duelDim) { ctx.save(); ctx.globalAlpha = 0.35; }
  drawHero(now);
  drawEnemies(now);
  if (duelDim) { ctx.restore(); }

  drawFrontFog(now);         // v12：人物脚前的薄雾——把立绘"埋"回画面
  drawStageFore(now);        // v12：前景剪影（有图用图，没图用程序化竹叶）

  drawProjectiles();
  drawWindBlades();
  drawVortex();

  // ---- 水墨比武：卷轴两侧边距，不遮挡主界面 ----
  if (Duel.active()) Duel.draw(now);

  drawSlashes();
  drawRings();
  drawComboWaves();
  drawSparks();
  drawInkDrops();
  drawFireworks();
  drawPopups();
  drawMilestones(now);
  drawComboCounter(now);
  drawCornerOrnaments(now);

  // 全屏闪光（连击里程碑 / 天人合一）
  if (G.flash > 0.001 && Cache.flash) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = clamp(G.flash, 0, 1) * 0.5;
    ctx.drawImage(Cache.flash, 0, 0, Layout.W, Layout.H);
    ctx.restore();
  }

  // v12：最后一层纸材质统一调色——纸纹 + 暖冷分离 + 暗角 + 上下积墨。
  // 这一层把背景、角色、特效压进同一张宣纸，是"去塑料"最关键的一步。
  drawGrade(now);

  ctx.restore();
}
