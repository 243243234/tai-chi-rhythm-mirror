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

/* ---------------- 太极阴阳（程序化） ---------------- */
function drawTaiChi(x, y, r, rot) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = '#fffdf2'; ctx.fill();
  ctx.lineWidth = Math.max(1, r * 0.09);
  ctx.strokeStyle = '#22301f'; ctx.stroke();

  ctx.beginPath(); ctx.arc(0, 0, r, Math.PI / 2, Math.PI * 1.5);
  ctx.fillStyle = '#22301f'; ctx.fill();
  ctx.beginPath(); ctx.arc(0, -r / 2, r / 2, 0, Math.PI * 2); ctx.fillStyle = '#22301f'; ctx.fill();
  ctx.beginPath(); ctx.arc(0, r / 2, r / 2, 0, Math.PI * 2); ctx.fillStyle = '#fffdf2'; ctx.fill();
  ctx.beginPath(); ctx.arc(0, -r / 2, r / 6, 0, Math.PI * 2); ctx.fillStyle = '#fffdf2'; ctx.fill();
  ctx.beginPath(); ctx.arc(0, r / 2, r / 6, 0, Math.PI * 2); ctx.fillStyle = '#22301f'; ctx.fill();
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

/* ---------------- 判定盘 ---------------- */
function drawJudgeArea(now) {
  const cx = Geo.scroll.cx;
  const cy = Geo.track.judgeY;
  const R = Geo.scroll.judgeR;
  const fever = G.feverLeft > 0;
  const pulse = fever ? 1 + Math.sin(now * 11) * 0.06 : 1 + Math.sin(now * 2.2) * 0.02;

  ctx.save();

  // 水墨漩涡（旋转，和太极盘同向）
  if (IMG.inkWater) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(now * 0.35);
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = fever ? 0.42 : 0.24;
    const rw = R * 2.3 * pulse;
    ctx.drawImage(IMG.inkWater, -rw / 2, -rw / 2, rw, rw);
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

  // 判定线（v7）：去掉横贯全盘的直尺金线，改成盘两侧两笔淡金墨痕（笔触两端收细、中间略粗，像毛笔一抹）；
  // 直线 + 绿底是用户点名的“绿色横线”，墨痕与盘同色系，不再有横线感
  const halfW = R * 1.32;
  const brushStroke = (x1, x2) => {
    const h = 4.6; // 笔触最粗处半高
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x1, cy);
    ctx.quadraticCurveTo((x1 + x2) / 2, cy - h, x2, cy);
    ctx.quadraticCurveTo((x1 + x2) / 2, cy + h, x1, cy);
    ctx.closePath();
    ctx.fillStyle = fever ? 'rgba(255,225,150,0.92)' : 'rgba(198,150,74,0.85)';
    ctx.fill();
    // 笔锋高光
    ctx.beginPath();
    ctx.moveTo(x1 + 6, cy - 0.8);
    ctx.quadraticCurveTo((x1 + x2) / 2, cy - h * 0.55, x2 - 6, cy - 0.8);
    ctx.quadraticCurveTo((x1 + x2) / 2, cy + h * 0.2, x1 + 6, cy - 0.8);
    ctx.closePath();
    ctx.fillStyle = fever ? 'rgba(255,246,214,0.9)' : 'rgba(255,228,160,0.55)';
    ctx.fill();
    ctx.restore();
  };
  ctx.save();
  brushStroke(cx - halfW - 40, cx - halfW * 0.66);
  brushStroke(cx + halfW * 0.66, cx + halfW + 40);
  // 两端云纹金点（保留）
  ctx.fillStyle = fever ? '#ffe9a8' : '#b8861d';
  [cx - halfW - 40, cx + halfW + 40].forEach(x => {
    ctx.beginPath(); ctx.arc(x, cy, 3.2, 0, Math.PI * 2); ctx.fill();
  });
  ctx.restore();

  // 中央太极盘
  const tr = R * 0.66 * pulse;
  const koi = IMG.taichiKoi;
  ctx.save();
  // 玉璧金环
  ctx.beginPath();
  ctx.arc(cx, cy, tr + 5, 0, Math.PI * 2);
  ctx.strokeStyle = fever ? 'rgba(255,236,180,0.95)' : 'rgba(214,172,96,0.8)';
  ctx.lineWidth = 2.4;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, tr + 10, 0, Math.PI * 2);
  ctx.strokeStyle = fever ? 'rgba(255,215,110,0.45)' : 'rgba(214,172,96,0.32)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(now * 0.9);
  ctx.shadowColor = fever ? 'rgba(255,215,110,0.95)' : 'rgba(255,214,110,0.8)';
  ctx.shadowBlur = fever ? 20 : 12;
  if (koi) {
    ctx.save();
    ctx.beginPath(); ctx.arc(0, 0, tr, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(koi, -tr, -tr, tr * 2, tr * 2);
    ctx.restore();
  } else {
    drawTaiChi(0, 0, tr, 0);
  }
  ctx.restore();

  // 判定高光（命中瞬间）
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

  ctx.restore();
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

  for (const n of G.chart) {
    if (n.judged) continue;
    const y = noteY(n.time);
    if (y < Geo.scroll.top - 20) continue;
    if (n.type !== 'hold' && y > judgeY + 60) continue;

    const cx = trackCX(Math.min(y, judgeY));
    let near = 1 - Math.min(1, Math.abs(n.time - G.songTime) / 0.5);
    if (G.tutFrozen && G.tutorial && G.tutorial.target === n) near = 1; // 冻结的目标音符已滑到判定线，按“已到”渲染
    const fadeIn = clamp((y - (Geo.scroll.top - 20)) / 70, 0, 1);

    ctx.save();
    ctx.globalAlpha = fadeIn;

    // 阴阳轮转相位环（v6）：金环=阳、蓝环=阴，与 HUD 太极盘相位一致时踩准得加成
    // v8：贴合音符形状——闪身叶片用叶片形描边（圆环套扁叶片会多出一圈空白，像按钮没做对）；
    // 远处淡入、靠近才亮满，不在卷轴顶端留一圈孤零零的圆
    if (typeof n.phase === 'number') {
      const phaseA = 0.9 * (0.25 + 0.75 * near);
      ctx.save();
      ctx.strokeStyle = n.phase === 1 ? `rgba(255,215,110,${phaseA})` : `rgba(127,179,213,${phaseA})`;
      ctx.lineWidth = 2;
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
      tg.addColorStop(0, 'rgba(184,59,38,0)');
      tg.addColorStop(1, `rgba(184,59,38,${0.18 + near * 0.24})`);
      ctx.fillStyle = tg;
      ctx.fillRect(cx - 11, y - 76, 22, 76);

      // 朱砂印圆牌
      ctx.save();
      ctx.shadowColor = 'rgba(220,70,45,0.9)';
      ctx.shadowBlur = 10 + near * 18;
      const grad = ctx.createRadialGradient(cx - 6, y - 7, 2, cx, y, 21);
      grad.addColorStop(0, '#c9462e');
      grad.addColorStop(0.6, '#a02a18');
      grad.addColorStop(1, '#6d1a0e');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(cx, y, 20, 0, Math.PI * 2); ctx.fill();

      ctx.strokeStyle = '#ffd76e';
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,236,180,0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, y, 15.5, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();

      // 中心太极 / 推字
      if (IMG.taichiKoi) {
        ctx.save();
        ctx.beginPath(); ctx.arc(cx, y, 11, 0, Math.PI * 2); ctx.clip();
        ctx.drawImage(IMG.taichiKoi, cx - 11, y - 11, 22, 22);
        ctx.restore();
      } else {
        ctx.font = '700 13px "Ma Shan Zheng","STKaiti","KaiTi",serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff8e6';
        ctx.fillText('推', cx, y);
      }

      // 接近判定时的收束光圈
      if (near > 0.05) {
        ctx.save();
        ctx.globalAlpha = fadeIn * near * 0.9;
        ctx.strokeStyle = 'rgba(255,226,150,0.9)';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(cx, y, 20 + (1 - near) * 34, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    } else if (n.type === 'slide') {
      const sign = n.dir < 0 ? -1 : 1;
      const bladeLen = 52;
      const bladeH = 21;
      ctx.save();
      ctx.translate(cx, y);
      ctx.shadowColor = `rgba(104,231,184,${0.65 + near * 0.35})`;
      ctx.shadowBlur = 10 + near * 16;

      ctx.beginPath();
      ctx.moveTo(sign * bladeLen, 0);
      ctx.quadraticCurveTo(sign * 14, -bladeH, -sign * (bladeLen * 0.42), -bladeH * 0.32);
      ctx.quadraticCurveTo(-sign * (bladeLen * 0.72), 0, -sign * (bladeLen * 0.42), bladeH * 0.32);
      ctx.quadraticCurveTo(sign * 14, bladeH, sign * bladeLen, 0);
      ctx.closePath();

      const bg = ctx.createLinearGradient(-sign * 26, 0, sign * bladeLen, 0);
      bg.addColorStop(0, 'rgba(16,30,22,0.95)');
      bg.addColorStop(0.42, 'rgba(36,88,62,0.95)');
      bg.addColorStop(0.86, '#48b885');
      bg.addColorStop(1, '#b6ffdc');
      ctx.fillStyle = bg;
      ctx.fill();
      ctx.strokeStyle = '#ffd76e';
      ctx.lineWidth = 1.7;
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-sign * 14, 0);
      ctx.lineTo(sign * (bladeLen - 6), 0);
      ctx.stroke();

      ctx.font = '700 13px "Ma Shan Zheng","STKaiti","KaiTi",serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0,0,0,0.9)';
      ctx.shadowBlur = 4;
      ctx.fillText('闪', -sign * 2, 0);
      ctx.font = '700 12px \"Ma Shan Zheng\",\"STKaiti\",\"KaiTi\",serif';
      ctx.fillStyle = '#ffd76e';
      ctx.fillText(n.dir < 0 ? '《' : '》', sign * 22, 0);
      ctx.restore();
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
      ctx.strokeStyle = n.holding ? 'rgba(96,206,140,0.92)' : 'rgba(46,132,76,0.82)';
      ctx.lineWidth = 24;
      ctx.stroke();

      path();
      ctx.strokeStyle = n.holding ? '#d8ffe6' : '#9ceeb4';
      ctx.lineWidth = 7;
      ctx.stroke();

      ctx.save();
      ctx.shadowColor = n.holding ? 'rgba(120,255,180,0.95)' : 'rgba(104,231,184,0.8)';
      ctx.shadowBlur = (n.holding ? 20 : 10) + near * 12;
      ctx.globalAlpha = headY > Geo.scroll.top - 4 ? 1 : 0;
      ctx.beginPath(); ctx.arc(headCx, headY, 19, 0, Math.PI * 2);
      ctx.fillStyle = n.holding ? '#33b26c' : '#225d36';
      ctx.fill();
      ctx.strokeStyle = '#ffd76e';
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.font = '700 13px "Ma Shan Zheng","STKaiti","KaiTi",serif';
      ctx.fillStyle = '#fffdf0';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('纳', headCx, headY);
      ctx.restore();

      if (n.holding) {
        ctx.beginPath();
        ctx.arc(headCx, headY, 26 + Math.sin(performance.now() / 90) * 4, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(150,250,190,0.9)';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}

/* ---------------- 名牌 ---------------- */
function drawNamePlate(x, y, name) {
  ctx.save();
  ctx.font = '700 12px "Ma Shan Zheng","STKaiti","KaiTi",serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = ctx.measureText(name).width + 26;
  const h = 21;

  ctx.fillStyle = 'rgba(248,242,223,0.94)';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x - w / 2, y, w, h, 4); else ctx.rect(x - w / 2, y, w, h);
  ctx.fill();
  ctx.strokeStyle = '#a88948';
  ctx.lineWidth = 1.4;
  ctx.stroke();

  ctx.fillStyle = '#6b4f24';
  ctx.fillRect(x - w / 2 - 3.5, y - 2, 4.5, h + 4);
  ctx.fillRect(x + w / 2 - 1, y - 2, 4.5, h + 4);

  ctx.fillStyle = '#2b3627';
  ctx.fillText(name, x, y + h / 2 + 0.5);
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

  // 地面描金圆盘
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = 'rgba(255,215,110,0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(baseX, baseY + 8, 66 * k, 15 * k, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(20,32,22,0.26)';
  ctx.beginPath();
  ctx.ellipse(baseX, baseY + 8, 60 * k, 13 * k, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 柔和接触阴影（脚下压一层模糊暗晕，人物站进地面而不是贴在上面）
  ctx.save();
  ctx.fillStyle = 'rgba(12,18,12,0.30)';
  ctx.shadowColor = 'rgba(12,18,12,0.55)';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.ellipse(baseX, baseY + 9, 48 * k, 9 * k, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 气场环
  ctx.save();
  ctx.translate(cx, cy - 40 * k);
  ctx.rotate(now * 1.6);
  ctx.strokeStyle = `rgba(104,231,184,${0.35 + G.comboGlow * 0.4})`;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(0, 0, 54 * k, 0, Math.PI * 1.35);
  ctx.stroke();
  ctx.strokeStyle = `rgba(255,215,110,${G.feverLeft > 0 ? 0.8 : 0.32 + G.comboGlow * 0.3})`;
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
      ctx.strokeStyle = 'rgba(104,231,184,0.55)';
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

    // 脚下光环
    ctx.save();
    ctx.strokeStyle = 'rgba(255,215,110,0.42)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, y + 46 * k, 46 * k, 10 * k, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // 柔和接触阴影（脚下压一层模糊暗晕，小怪站进地面）
    ctx.save();
    ctx.fillStyle = 'rgba(12,18,12,0.30)';
    ctx.shadowColor = 'rgba(12,18,12,0.50)';
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
      ctx.font = '700 11px "Ma Shan Zheng","STKaiti","KaiTi",serif';
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
  ctx.globalAlpha = 0.9;
  ctx.translate(0, H);
  ctx.scale(1, -1);
  ctx.drawImage(img, 4, 0, w, h);
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = 0.9;
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
  drawGroundMist(now);
  drawXihuDecor(now);
  drawScrollTrack(now);


  if (G.state === 'playing' || G.state === 'result') drawNotes();
  drawJudgeArea(now);
  if (G.tutFrozen) drawTutGuide(now);
  // 打斗期间把本体压暗一档：墨灵读作前景庆祝特效，不与实体角色抢视线（不改布局与判定）
  const duelDim = Duel.active();
  if (duelDim) { ctx.save(); ctx.globalAlpha = 0.35; }
  drawHero(now);
  drawEnemies(now);
  if (duelDim) { ctx.restore(); }
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

  ctx.restore();
}
