'use strict';
/* ============================================================
   game.js —— 玩法流程 / 判定 / 界面控制 / 主循环
   ============================================================ */

/* ---------------- 二维码目标地址（v7） ----------------
   根治“屏上二维码扫了打不开”：码里必须是真实可用的公开链接。
   部署流程：父级先把 v7 包部署到公开站拿到 URL → 把 URL 填进下面的
   PUBLIC_GAME_URL（留空则回退当前页面地址）→ 重打、重新部署到同一站（URL 不变），
   码里就是活链接。file:// / localhost 下留空也无妨，码照编但扫了进不去是正常的。 */
const PUBLIC_GAME_URL = 'https://silly-crumble-2a8182.netlify.app/'; // 永久站根地址（v9 注入）
function publicGameUrl() {
  const u = (PUBLIC_GAME_URL || '').trim();
  if (u) return u;
  try { return location.href.split('#')[0]; } catch (e) { return location.href; }
}

/* ------------------------------------------------------------
   1. 谱面生成
   ------------------------------------------------------------ */
/* ---------------- 阴阳轮转（v6）：相位每 4 拍翻转 ---------------- */
const PHASE_BEATS = 4;
function phaseAtBeat(beat) { return Math.floor(beat / PHASE_BEATS) % 2; }
function currentPhase() {
  if (!G.song || G.state !== 'playing') return 0;
  return phaseAtBeat(G.songTime / (60 / G.song.bpm));
}

function generateChart(song, diff) {
  const spb = 60 / song.bpm;
  const chart = [];
  const typeCycle = ['tap', 'tap', 'slide', 'tap', 'hold', 'tap', 'slide', 'tap', 'tap', 'hold', 'slide', 'tap'];
  let typePos = 0, slideDir = 1, holdUntilBeat = -1;

  for (let beat = 4; beat < song.beats - 2; beat++) {
    if (beat < holdUntilBeat) continue;
    if (!song.density[beat % song.density.length]) continue;
    const type = typeCycle[typePos % typeCycle.length];
    typePos++;
    const note = { type, time: beat * spb, judged: false, holding: false, holdDone: false, phase: phaseAtBeat(beat) };
    if (type === 'slide') { note.dir = slideDir; slideDir = -slideDir; }
    if (type === 'hold') { note.dur = 2 * spb; holdUntilBeat = beat + 2; }
    chart.push(note);
  }

  if (diff === 'easy') {
    return fixHoldFollow(chart.filter((n, i) => n.type === 'hold' || (i * 7) % 10 < 7), spb);
  }
  if (diff === 'hard') {
    const extra = [];
    for (let i = 0; i + 1 < chart.length && extra.length < 14; i++) {
      const a = chart[i], b = chart[i + 1];
      if (a.type === 'hold' || b.type === 'hold') continue;
      if (b.time - a.time >= spb * 1.85) {
        extra.push({ type: 'tap', time: (a.time + b.time) / 2, judged: false, holding: false, holdDone: false, phase: phaseAtBeat(((a.time + b.time) / 2) / spb) });
      }
    }
    return fixHoldFollow(chart.concat(extra).sort((a, b) => a.time - b.time), spb);
  }
  return fixHoldFollow(chart, spb);
}


/* 长按衔接规则：长按结束 2 拍内若紧跟空格点按，改成左右闪身。
   （按住空格过长按、松开再迅速敲下，几乎不可能按准；闪身键是独立的手指动作） */
function fixHoldFollow(chart, spb) {
  let slideDir = 1;
  for (let i = 1; i < chart.length; i++) {
    const prev = chart[i - 1], cur = chart[i];
    if (prev.type === 'hold' && cur.type === 'tap' &&
        cur.time - (prev.time + (prev.dur || 0)) < 2 * spb) {
      cur.type = 'slide'; cur.dir = slideDir; slideDir = -slideDir;
    }
  }
  return chart;
}

/* ------------------------------------------------------------
   2. 背景切换
   ------------------------------------------------------------ */
const BG_MAP = {
  home: ['home'],
  'home-xihu': ['home-xihu'],
  menu: ['menu'],
  play: ['play'],
  night: ['night'],
  fever: ['night', 'fever'],
  xihu: ['xihu']
};

/* 首页背景：已解锁西湖者用湖景首页（bg_home_xihu.jpg 叠 bg_home2.jpg 兜底），否则原首页 */
function homeBgMode() { return isXihuUnlocked() ? 'home-xihu' : 'home'; }

function setBackground(mode) {
  const on = BG_MAP[mode] || ['home'];
  document.querySelectorAll('.bg-img').forEach(el => {
    el.classList.toggle('on', on.indexOf(el.dataset.bg) >= 0);
  });
  document.body.classList.remove('state-home', 'state-menu', 'state-play', 'state-fever', 'state-night');
  document.body.classList.add('state-' + mode);
}

/* 局内应当使用哪张背景：子时曲目走夜色，天人合一走墨夜 */
function playBgMode() {
  if (G.feverLeft > 0) return 'fever';
  if (G.song && G.song.xihu) return 'xihu';
  return (G.song && G.song.id === 5) ? 'night' : 'play';
}

/* ------------------------------------------------------------
   3. 记录存取
   ------------------------------------------------------------ */
function loadBest(id, diff) {
  try {
    const raw = localStorage.getItem('tcr_best_' + id + '_' + diff);
    const b = JSON.parse(raw || 'null');
    return b && b.score ? b : null;
  } catch (e) { return null; }
}
function loadBestAny(id) {
  let best = null;
  for (const d of ['easy', 'normal', 'hard']) {
    const b = loadBest(id, d);
    if (b && (!best || b.score > best.score)) best = b;
  }
  return best;
}
function saveBest(id, score, grade, combo, diff) {
  try {
    localStorage.setItem('tcr_best_' + id + '_' + diff, JSON.stringify({ score, grade, combo }));
  } catch (e) { /* 隐私模式下忽略 */ }
}

/* ---------------- 墨币与解锁（v7） ---------------- */
const COINS_KEY = 'tcr_coins_v1';
const UNLOCKS_KEY = 'tcr_unlocks_v1';
const SONG5_UNLOCK_COST = 300; // 冬至 · 子时解锁价：2–3 首正常发挥即可攒够
const COIN_GRADE_BONUS = { '甲': 30, '乙': 20, '丙': 10, '丁': 5, '励': 0 };
const GRADE_RANK = { '甲': 5, '乙': 4, '丙': 3, '丁': 2, '励': 1 };
function loadCoins() { try { return Math.max(0, parseInt(localStorage.getItem(COINS_KEY) || '0', 10) || 0); } catch (e) { return 0; } }
function saveCoins(n) { try { localStorage.setItem(COINS_KEY, String(Math.max(0, Math.floor(n)))); } catch (e) {} }
function loadUnlocks() { try { const u = JSON.parse(localStorage.getItem(UNLOCKS_KEY) || 'null'); return u && Array.isArray(u.songs) ? u : { songs: [] }; } catch (e) { return { songs: [] }; } }
function saveUnlocks(u) { try { localStorage.setItem(UNLOCKS_KEY, JSON.stringify(u)); } catch (e) {} }
/* 冬至关（第 6 首常规曲，id 5）是否已解锁：只有花 300 墨币购买才解锁（v10）。
   v7 的祖父条款（有最佳成绩 / 手札通关即自动解锁）已废弃——它让锁对老玩家从不生效。
   购买单独记账（tcr_purchases_v1），与解锁列表分开。 */
const PURCHASES_KEY = 'tcr_purchases_v1';
function loadPurchases() { try { const p = JSON.parse(localStorage.getItem(PURCHASES_KEY) || 'null'); return p && p.songs && typeof p.songs === 'object' ? p : { songs: {} }; } catch (e) { return { songs: {} }; } }
function savePurchases(p) { try { localStorage.setItem(PURCHASES_KEY, JSON.stringify(p)); } catch (e) {} }
function recordPurchase(id, cost) { const p = loadPurchases(); p.songs[id] = { cost, at: Date.now() }; savePurchases(p); }
function hasPurchase(id) { const p = loadPurchases(); return !!(p.songs && p.songs[id]); }
function isSongUnlocked(id) {
  if (id !== 5) return true;
  return loadUnlocks().songs.indexOf(5) >= 0;
}
function unlockSong(id) { const u = loadUnlocks(); if (u.songs.indexOf(id) < 0) { u.songs.push(id); saveUnlocks(u); } }
/* v10 一次性迁移（只跑一次）：v7 未单独记账购买，无法区分旧解锁是“买过”还是
   “祖父条款自动开的”；唯一真实玩家（用户本人）确认从未购买，故清理全部旧的
   冬至解锁（只清 id 5，不动其他）；自 v10 起购买单独记账，不会再误清。 */
function migrateSongUnlocksV10() {
  try {
    if (localStorage.getItem('tcr_unlock_mig_v10')) return;
    const u = loadUnlocks();
    if (u.songs.indexOf(5) >= 0) { u.songs = u.songs.filter(id => id !== 5); saveUnlocks(u); }
    localStorage.setItem('tcr_unlock_mig_v10', '1');
  } catch (e) {}
}
/* ---------------- 火烧卷轴染色解锁动画（v10 通用组件） ----------------
   用法：playDyeUnlock(el, { fixClone, onDone, target, sealText })
   - el 必须是当前仍带锁定态（灰度）的元素；函数克隆一个彩色版盖在上面，
     用 clip-path 从左向右揭开，火焰带跟在揭开边缘；揭完后调 onDone() 让调用方
     把真实元素改成解锁态（去灰度类 / 重渲染等），随后在最终态元素上金光一闪 +
     “已解锁”印章盖下。target 可传函数，返回重渲染后的新元素（供金光/印章落点）。
   - 火焰/金光/印章全部代码绘制，无需新美术。接在三条解锁路径上：
     墨币购买（冬至）、跨端同步（西湖）、难度解锁（难度章）。 */
function playDyeUnlock(el, opts) {
  opts = opts || {};
  if (!el || !el.isConnected || el.dataset.dyePlaying) return;
  el.dataset.dyePlaying = '1';
  const rect = el.getBoundingClientRect();
  const W = Math.max(10, rect.width);
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
  // 彩色克隆：去掉锁定类与锁提示行，露出解锁后的样子
  const clone = el.cloneNode(true);
  clone.removeAttribute('id');
  clone.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
  clone.classList.remove('locked', 'locked-coins');
  clone.classList.add('dye-clone');
  const lockLine = clone.querySelector('.sri-lock');
  if (lockLine) lockLine.remove();
  clone.style.filter = 'none';
  clone.style.clipPath = 'inset(0 100% 0 0)';
  if (opts.fixClone) opts.fixClone(clone);
  el.appendChild(clone);
  // 火焰带：跟在揭开边缘
  const flame = document.createElement('div');
  flame.className = 'dye-flame';
  flame.innerHTML = '<span class="dye-ember"></span><span class="dye-ember"></span><span class="dye-ember"></span>';
  el.appendChild(flame);
  const DUR = 1400, t0 = performance.now();
  const step = (now) => {
    const p = Math.min(1, (now - t0) / DUR);
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; // easeInOut
    clone.style.clipPath = 'inset(0 ' + ((1 - e) * 100).toFixed(1) + '% 0 0)';
    flame.style.left = (e * (W + 30) - 30).toFixed(1) + 'px';
    if (p < 1) { requestAnimationFrame(step); return; }
    flame.remove();
    clone.remove();
    if (opts.onDone) opts.onDone();
    // 金光 + 印章（盖在最终态的元素上）
    const target = (typeof opts.target === 'function' ? opts.target() : (opts.target || el));
    if (target && target.isConnected) {
      if (getComputedStyle(target).position === 'static') target.style.position = 'relative';
      const flash = document.createElement('div');
      flash.className = 'dye-flash';
      target.appendChild(flash);
      const seal = document.createElement('div');
      seal.className = 'dye-seal';
      seal.textContent = opts.sealText || '已解锁';
      target.appendChild(seal);
      setTimeout(() => { flash.remove(); seal.remove(); delete el.dataset.dyePlaying; }, 1500);
    } else {
      delete el.dataset.dyePlaying;
    }
  };
  requestAnimationFrame(step);
}

/* 结算墨币公式（v7）：准×2 + 可×1 + 评级奖励（甲30/乙20/丙10/丁5/励0）+ 连击奖励（≥100 → +20；≥50 → +10），
   再 × 难度倍率（初学 0.8 / 入室 1.0 / 天人 1.5），向下取整。重打永远能赚钱，不死锁。 */
function calcCoinsEarned(grade) {
  const gb = COIN_GRADE_BONUS[grade] || 0;
  const cb = G.maxCombo >= 100 ? 20 : G.maxCombo >= 50 ? 10 : 0;
  const mult = (DIFFS[G.diff] || DIFFS.normal).mult;
  const earned = Math.max(0, Math.floor((G.countPerfect * 2 + G.countGood + gb + cb) * mult));
  return { earned, gb, cb, mult };
}
/* 难度解锁（v7）：初学常开；入室需该曲初学乙及以上；天人需该曲入室乙及以上。
   已有高难度成绩者直接放行（祖父条款，避免老玩家被锁在默认难度外） */
function diffUnlocked(songId, diff) {
  if (diff === 'easy') return true;
  if (loadBest(songId, diff) || (diff === 'normal' && loadBest(songId, 'hard'))) return true;
  const prev = diff === 'normal' ? 'easy' : 'normal';
  const b = loadBest(songId, prev);
  return !!b && (GRADE_RANK[b.grade] || 0) >= 4;
}
function diffLockNote(songId, diff) {
  if (diff === 'normal') return '入室：需初学达到乙及以上';
  if (diff === 'hard') return '天人：需入室达到乙及以上';
  return '';
}
/* 若当前选中难度对该曲未解锁，退到已解锁的最高档 */
function ensureDiffUnlocked(songId) {
  if (diffUnlocked(songId, selectedDiff)) return;
  for (const d of ['hard', 'normal', 'easy']) if (diffUnlocked(songId, d)) { selectedDiff = d; return; }
  selectedDiff = 'easy';
}
/* 首页 / 选曲页的墨币余额显示 */
function refreshCoinDisplays() {
  const bal = loadCoins();
  const h = $('home-coins-num'); if (h) h.textContent = String(bal);
  const q = $('qupu-coins-num'); if (q) q.textContent = String(bal);
}

/* ---------------- 成就手札（localStorage 新 key，与 tcr_best_ 互不干扰） ---------------- */
const HANDBOOK_KEY = 'tcr_handbook_v1';
function loadHandbook() {
  try {
    const raw = localStorage.getItem(HANDBOOK_KEY);
    if (!raw) return { cleared: [], seals: {}, totals: { plays: 0, perfect: 0, good: 0, miss: 0 }, moves: {}, xihu: false };
    const hb = JSON.parse(raw);
    if (!hb || typeof hb !== 'object') throw new Error('bad handbook');
    hb.cleared = Array.isArray(hb.cleared) ? hb.cleared : [];
    hb.seals = hb.seals && typeof hb.seals === 'object' ? hb.seals : {};
    hb.totals = hb.totals && typeof hb.totals === 'object' ? hb.totals : {};
    for (const k of ['plays', 'perfect', 'good', 'miss']) if (typeof hb.totals[k] !== 'number') hb.totals[k] = 0;
    hb.moves = hb.moves && typeof hb.moves === 'object' ? hb.moves : {};
    hb.xihu = !!hb.xihu;
    return hb;
  } catch (err) {
    return { cleared: [], seals: {}, totals: { plays: 0, perfect: 0, good: 0, miss: 0 }, moves: {}, xihu: false };
  }
}
function saveHandbook(hb) {
  try { localStorage.setItem(HANDBOOK_KEY, JSON.stringify(hb)); } catch (err) { /* 隐私模式忽略 */ }
}
/* 结算时记入手札：通关曲目、甲/乙/丙印章、累计准/可/乱 */
function recordHandbook(grade) {
  const hb = loadHandbook();
  const idx = SONGS.indexOf(G.song);
  if (idx >= 0 && !hb.cleared.includes(idx)) hb.cleared.push(idx);
  if (grade === '甲' || grade === '乙' || grade === '丙') hb.seals[grade] = true;
  if (G.song && G.song.xihu) hb.xihu = true;
  hb.totals.plays += 1;
  hb.totals.perfect += G.countPerfect;
  hb.totals.good += G.countGood;
  hb.totals.miss += G.countMiss;
  saveHandbook(hb);
}
/* 打开手札时渲染：贴士图鉴（点亮/墨渍锁定）+ 印章 + 修行统计 */
function renderHandbook() {
  const hb = loadHandbook();
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  let html = '<div class="hb-sec"><div class="hb-sec-title">贴士图鉴 · ' + hb.cleared.length + ' / ' + SONGS.length + ' 首已通关</div><div class="hb-grid">';
  for (let i = 0; i < SONGS.length; i++) {
    const s = SONGS[i];
    if (hb.cleared.includes(i)) {
      html += '<div class="hb-cell"><img src="assets/' + s.tipImg + '" alt=""><div class="hb-name">' + esc(s.title) + '</div><div class="hb-tip">' + esc(s.tip) + '</div></div>';
    } else {
      html += '<div class="hb-cell hb-locked"><div class="hb-ink">？</div><div class="hb-name">' + esc(s.title) + '</div><div class="hb-tip">尚未通关，贴士未解锁</div></div>';
    }
  }
  html += '</div></div>';
  const sealMap = { '甲': 'seal_tian.png', '乙': 'seal_miao.png', '丙': 'seal_ji.png' };
  html += '<div class="hb-sec"><div class="hb-sec-title">印章收集</div><div class="hb-seals">';
  for (const g of ['甲', '乙', '丙']) {
    if (hb.seals[g]) html += '<div class="hb-seal"><img src="assets/' + sealMap[g] + '" alt="' + g + '"><span>' + g + '等印章</span></div>';
    else html += '<div class="hb-seal locked"><span class="hb-inkdot">？</span><span>' + g + '等印章未获得</span></div>';
  }
  html += '</div></div>';
  /* 八段锦八式图鉴（v6）：七首歌的贴士覆盖 1/2/3/4/5/6/8 式，第 7 式「攒拳怒目增气力」无对应曲目，在此补全 */
  const BA_FORMS = [
    { n: '第一式', name: '双手托天理三焦', song: 0, note: '双手交叉上托到头顶，停两秒再放下' },
    { n: '第二式', name: '左右开弓似射雕', song: 3, note: '跨马步拉弓展胸，双眼凝视指尖' },
    { n: '第三式', name: '调理脾胃须单举', song: 1, note: '一手托天一手按地，舒展胃脘肋腹' },
    { n: '第四式', name: '五劳七伤往后瞧', song: 4, note: '展肩旋臂，头颈缓缓后瞧' },
    { n: '第五式', name: '摇头摆尾去心火', song: 2, note: '马步微下，上身缓缓摇摆，左右各 3 次' },
    { n: '第六式', name: '两手攀足固肾腰', song: 5, note: '双手沿腿后侧摸向脚背，轻按后腰' },
    { n: '第七式', name: '攒拳怒目增气力', song: -1, note: '马步攒拳怒目，增气力、强筋骨（图鉴收录，尚无对应曲目）' },
    { n: '第八式', name: '背后七颠百病消', song: 6, note: '脚跟提起再轻落，颠七次' }
  ];
  html += '<div class="hb-sec"><div class="hb-sec-title">八段锦八式图鉴</div><div class="hb-stats">';
  for (const f of BA_FORMS) {
    const lit = f.song >= 0 && hb.cleared.includes(f.song);
    html += '<span>' + esc(f.n + '「' + f.name + '」') + (lit ? ' <b>已悟</b>' : (f.song < 0 ? ' · 图鉴' : ' · 未悟')) + ' —— ' + esc(f.note) + '</span>';
  }
  html += '</div></div>';
  if (hb.xihu) html += '<div class="hb-sec"><div class="hb-sec-title">西湖打卡</div><div class="hb-stats"><img src="assets/seal_xihu.png" alt="西湖印" style="width:54px;height:54px;vertical-align:middle" onerror="this.remove()"><span>已打卡西湖隐藏关 · 断桥残雪印已盖</span></div></div>';
  const _moveNames = Object.keys(hb.moves || {});
  if (_moveNames.length) {
    html += '<div class="hb-sec"><div class="hb-sec-title">招式收集 · ' + _moveNames.length + ' / ' + MOVE_PATTERNS.length + '</div><div class="hb-stats">';
    for (const p of MOVE_PATTERNS) html += '<span>' + esc(p.name) + (hb.moves[p.name] ? ' <b>×' + hb.moves[p.name] + '</b>' : ' · 未悟') + '</span>';
    html += '</div></div>';
  }
  html += '<div class="hb-sec" style="padding-bottom:12px"><div class="hb-sec-title">修行统计</div><div class="hb-stats"><span>累计游玩 <b>' + hb.totals.plays + '</b> 曲</span><span>准 <b>' + hb.totals.perfect + '</b></span><span>可 <b>' + hb.totals.good + '</b></span><span>乱 <b>' + hb.totals.miss + '</b></span><span>墨币 <b>' + loadCoins() + '</b></span></div></div>';
  $('hb-body').innerHTML = html;
}

/* ---------------- 西湖隐藏关：扫码解锁（?spot=xihu）+ 本地持久化 ---------------- */
const XIHU_KEY = 'tcr_xihu_v1';
function isXihuUnlocked() {
  try { return localStorage.getItem(XIHU_KEY) === '1'; } catch (e) { return false; }
}
function unlockXihu() {
  try { localStorage.setItem(XIHU_KEY, '1'); } catch (e) {}
}
function xihuPlayUrl() {
  try {
    const u = new URL(publicGameUrl());
    u.searchParams.set('spot', 'xihu');
    return u.toString();
  } catch (e) { return publicGameUrl(); }
}
/* 本地二维码编码（qrcode-generator，无需联网；换部署地址也不用重打）
   v6 扫码失败修复：纠错等级 M→H（约 30% 容错，屏摄反光/摩尔纹下仍可读），
   单元 6→8px、静区 8→16px，显示尺寸同步加大 */
function qrDataUrl(text) {
  try {
    if (typeof qrcode === 'undefined') return '';
    const qr = qrcode(0, 'H');
    qr.addData(text);
    qr.make();
    return qr.createDataURL(8, 16);
  } catch (e) { return ''; }
}
function openXihuLock() {
  const m = $('xihu-lock');
  if (!m) return;
  // v10：每次打开生成新的配对码，二维码编进 ?spot=xihu&sync=<码>，并开始轮询
  xihuSyncCode = makeSyncCode();
  const img = $('qr-xihu-img');
  if (img) img.src = qrDataUrl(xihuPlayUrlWithSync(xihuSyncCode));
  const link = $('xihu-link');
  if (link) link.textContent = xihuPlayUrlWithSync(xihuSyncCode);
  const codeEl = $('xihu-sync-code');
  if (codeEl) codeEl.textContent = xihuSyncCode;
  setSyncStatus('');
  const inp = $('xihu-sync-input'); if (inp) inp.value = '';
  m.classList.remove('hidden');
  startXihuSyncPoll();
}
function closeXihuLock() { const m = $('xihu-lock'); if (m) m.classList.add('hidden'); stopXihuSyncPoll(); }
/* v9：扫码不再直接进游戏/弹旧弹窗——未解锁时走独立的西湖解锁仪式
   （3 幕西湖故事 → 锁松动脱落 → 印章“西湖已解锁”，终场才持久化解锁）；
   已解锁时再扫码不再重播仪式，直接选中西湖曲。 */
function checkXihuUnlockParam() {
  try {
    const q = new URLSearchParams(location.search);
    xihuSyncCodeFromUrl = (q.get('sync') || '').toUpperCase(); // v10：手机端带来的配对码
    if (q.get('spot') === 'xihu' || q.get('unlock') === 'xihu') {
      if (!isXihuUnlocked()) {
        setTimeout(() => playXihuCeremony('full', 'play'), 600);
      } else {
        setTimeout(() => {
          selectedSong = SONGS.findIndex(s => s.xihu);
          backToMenu();
          selectSong(selectedSong, true);
        }, 600);
      }
    }
  } catch (e) {}
}

/* ---------------- 跨端同步解锁（v10）：配对码 + Netlify Functions + Blobs ----------------
   事实：手机和电脑浏览器之间没有直连，localStorage 各存各的；同步要一个轻量云中继。
   流程：电脑西湖弹窗每次打开生成一个 6 位配对码，二维码编进 ?spot=xihu&sync=<码>；
   手机扫码进仪式、终场写云端“已解锁”；电脑每 2 秒轮询，收到后自动取消二维码界面、
   播放染色解锁动画、本地持久化。云端不可用时优雅降级：游戏照常玩，同步只是不触发；
   弹窗里另有“输入同步码”手动入口（手机仪式终场会显示同步码），云端不可用时按码本地解锁。 */
const SYNC_API_PATH = '/.netlify/functions/xihu-sync';
const SYNC_CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;
const SYNC_POLL_MS = 2000;
const SYNC_CODE_TTL_MS = 10 * 60 * 1000;
let xihuSyncCode = '';        // 本次弹窗的配对码（电脑生成）
let xihuSyncTimer = null;     // 轮询定时器
let xihuSyncFails = 0;        // 连续失败计数
let xihuSyncBusy = false;     // 轮询进行中标志（防重叠请求）
let xihuSyncStartedAt = 0;
let xihuSyncCodeFromUrl = ''; // 手机端：URL 里带来的配对码
let xihuSyncPosted = false;   // 手机端：终场是否已向云端写过解锁
function syncApiBase() {
  // 测试用：仅允许 localhost 覆盖（Playwright 模拟手机端写入 + 电脑端轮询）
  try {
    const q = new URLSearchParams(location.search);
    const o = q.get('syncapi') || '';
    if (o && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(o)) return o.replace(/\/$/, '');
  } catch (e) {}
  return '';
}
function syncApiUrl(path) { const b = syncApiBase(); return b ? b + path : path; }
function makeSyncCode() {
  const CH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  try { const a = new Uint32Array(6); crypto.getRandomValues(a); for (const n of a) s += CH[n % CH.length]; }
  catch (e) { for (let i = 0; i < 6; i++) s += CH[Math.floor(Math.random() * CH.length)]; }
  return s;
}
function xihuPlayUrlWithSync(code) {
  try {
    const u = new URL(xihuPlayUrl());
    if (code) u.searchParams.set('sync', code);
    return u.toString();
  } catch (e) { return xihuPlayUrl(); }
}
async function syncPostUnlock(code) {
  try {
    const r = await fetch(syncApiUrl(SYNC_API_PATH), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'unlock', code }) });
    if (!r.ok) return false;
    const j = await r.json().catch(() => null);
    return !!(j && j.ok);
  } catch (e) { return false; }
}
async function syncGetStatus(code) {
  // 返回 'unlocked' | 'pending' | 'expired' | 'down'（down = 云端不可用）
  try {
    const r = await fetch(syncApiUrl(SYNC_API_PATH) + '?code=' + encodeURIComponent(code), { cache: 'no-store' });
    if (!r.ok) return 'down';
    const j = await r.json().catch(() => null);
    return (j && (j.status === 'unlocked' || j.status === 'expired')) ? j.status : 'pending';
  } catch (e) { return 'down'; }
}
function setSyncStatus(text) { const el = $('xihu-sync-status'); if (el) el.textContent = text || ''; }
function stopXihuSyncPoll() { if (xihuSyncTimer) { clearInterval(xihuSyncTimer); xihuSyncTimer = null; } }
function startXihuSyncPoll() {
  stopXihuSyncPoll();
  xihuSyncFails = 0;
  xihuSyncStartedAt = Date.now();
  let interval = SYNC_POLL_MS;
  const tick = async () => {
    if (xihuSyncBusy) return;
    const m = $('xihu-lock');
    if (!m || m.classList.contains('hidden') || isXihuUnlocked() || !xihuSyncCode) { stopXihuSyncPoll(); return; }
    if (Date.now() - xihuSyncStartedAt > SYNC_CODE_TTL_MS) { stopXihuSyncPoll(); setSyncStatus('同步码已过期，请关闭后重新打开弹窗'); return; }
    xihuSyncBusy = true;
    try {
      const st = await syncGetStatus(xihuSyncCode);
      if (st === 'unlocked') { onXihuSyncUnlocked('auto'); return; }
      if (st === 'down') {
        xihuSyncFails++;
        if (xihuSyncFails >= 3 && interval === SYNC_POLL_MS) {
          interval = 5000; // 退避：改 5 秒一轮，不报错、不刷屏
          stopXihuSyncPoll();
          xihuSyncTimer = setInterval(tick, interval);
        }
        return;
      }
      xihuSyncFails = 0;
    } finally { xihuSyncBusy = false; }
  };
  xihuSyncTimer = setInterval(tick, interval);
}
async function onXihuSyncManualSubmit() {
  const inp = $('xihu-sync-input');
  const code = (inp && inp.value || '').toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, '').slice(0, 6);
  if (code.length !== 6) { setSyncStatus('同步码是 6 位（字母+数字，不含 0/O/1/I/L）'); return; }
  setSyncStatus('正在核对同步码…');
  const st = await syncGetStatus(code);
  if (st === 'unlocked') { onXihuSyncUnlocked('manual'); return; }
  if (st === 'down') {
    // 云端不可用：按码本地解锁（码是用户自己手机上看到的共享密钥，等同于用户本人在两端确认）
    onXihuSyncUnlocked('manual-offline');
    return;
  }
  setSyncStatus(st === 'expired' ? '同步码已过期，请在手机上重新扫码' : '还没收到解锁信号：请先在手机上完成西湖仪式');
}
function onXihuSyncUnlocked(source) {
  stopXihuSyncPoll();
  unlockXihu();
  const m = $('xihu-lock');
  if (m) m.classList.add('hidden'); // 二维码界面自动取消
  const idx = SONGS.findIndex(s => s.xihu);
  const finish = () => {
    renderSongList();
    selectSong(idx, true);
    showSyncToast('解锁成功 · 西湖隐藏关已开启');
  };
  const card = document.querySelectorAll('#song-list .song-scroll-item')[idx];
  if (card && card.classList.contains('locked')) {
    card.scrollIntoView({ block: 'nearest' });
    playDyeUnlock(card, { onDone: finish, target: () => document.querySelectorAll('#song-list .song-scroll-item')[idx] });
  } else finish();
}
function showSyncToast(text) {
  const t = $('sync-toast'); if (!t) return;
  t.textContent = text;
  t.classList.remove('hidden');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.add('hidden'), 3000);
}
function showXihuCerSync(text) {
  const el = $('xihu-cer-sync'); if (!el) return;
  el.textContent = text || '';
  el.classList.toggle('hidden', !text);
}

/* ---------------- 冬至关：墨币解锁弹窗（v7） ---------------- */
function openSongUnlock(id) {
  const m = $('song-unlock'); if (!m) return;
  const bal = loadCoins();
  const costEl = $('song-unlock-cost');
  if (costEl) costEl.textContent = '解锁费用：' + SONG5_UNLOCK_COST + ' 墨币';
  const balEl = $('song-unlock-balance');
  if (balEl) balEl.textContent = '当前共有：' + bal + ' 墨币' + (bal >= SONG5_UNLOCK_COST ? '' : '（还差 ' + (SONG5_UNLOCK_COST - bal) + '，多打几首歌即可攒够）');
  const btn = $('btn-song-unlock-confirm');
  if (btn) {
    btn.disabled = bal < SONG5_UNLOCK_COST;
    btn.textContent = bal >= SONG5_UNLOCK_COST ? '确认解锁' : '墨币不足';
  }
  m.classList.remove('hidden');
}
function closeSongUnlock() { const m = $('song-unlock'); if (m) m.classList.add('hidden'); }
function confirmSongUnlock() {
  if (loadCoins() < SONG5_UNLOCK_COST) return;
  saveCoins(loadCoins() - SONG5_UNLOCK_COST);
  unlockSong(5);
  recordPurchase(5, SONG5_UNLOCK_COST); // v10：购买单独记账，迁移不再误清
  refreshCoinDisplays();
  // v10：先关弹窗，再在旧的锁定卡片上播放染色动画（黑白烧出彩色），揭完再重渲染成解锁态
  closeSongUnlock();
  const idx = SONGS.findIndex(s => s.id === 5);
  const finish = () => { renderSongList(); selectSong(5, true); };
  const card = document.querySelectorAll('#song-list .song-scroll-item')[idx];
  if (card && card.classList.contains('locked-coins')) {
    card.scrollIntoView({ block: 'nearest' });
    playDyeUnlock(card, { onDone: finish, target: () => document.querySelectorAll('#song-list .song-scroll-item')[idx] });
  } else finish();
}
function onSongUnlockConfirmClick() {
  if (isSongUnlocked(5)) { closeSongUnlock(); startGame(5); return; }
  confirmSongUnlock();
}

/* ---------------- 新手教程：首次进入弹出，可跳过（v6） ---------------- */
const TUTORIAL_KEY = 'tcr_tutorial_v1';
let tutStep = 0;
function tutorialSeen() { try { return localStorage.getItem(TUTORIAL_KEY) === '1'; } catch (e) { return false; } }
function markTutorialSeen() { try { localStorage.setItem(TUTORIAL_KEY, '1'); } catch (e) {} }
function showTutorial(step) {
  const m = $('tutorial-modal'); if (!m) return;
  tutStep = Math.max(0, Math.min(3, step));
  m.querySelectorAll('.tut-step').forEach(el => el.classList.toggle('hidden', +el.dataset.step !== tutStep));
  m.querySelectorAll('.tut-dots span').forEach((el, i) => el.classList.toggle('on', i === tutStep));
  $('btn-tut-prev').classList.toggle('hidden', tutStep === 0);
  $('btn-tut-next').classList.toggle('hidden', tutStep === 3);
  $('btn-tut-done').classList.toggle('hidden', tutStep !== 3);
  m.classList.remove('hidden');
}
function closeTutorial() { const m = $('tutorial-modal'); if (m) m.classList.add('hidden'); markTutorialSeen(); }

/* ---------------- 新手实战教程（v7）：半速真局 + 逐字提示 ----------------
   做法：开一局第 1 首的半速克隆（bpm 减半，谱面与旋律都按半速生成，音乐与音符天然同步；
   中途改速会让音乐（绝对音频时钟调度）与音符脱节，所以整局慢放而不是窗口慢放）。
   每步：目标音符临近 2.5 秒时弹出提示，踩准即进下一步，错过则等下一个同类音符再试。
   全程可跳过（右上按钮 / Esc），跳过后直接进正常游戏；完成或跳过都记 seen。 */
/* ---------------- 新手实战教程（v8 商业级）：正常速度 + 教学点冻结慢放 ----------------
   v7 的错误：整局统一 0.5× 半速——从头到尾都是慢歌，感觉不到“慢放”。
   v8 做法（商业音游标准）：正常速度进场；目标音符快到判定线时冻结游戏时钟
   （songTime 停住、音乐 suspend，音画绝不脱节），音符在 0.75 秒内缓滑到判定线，
   同时全场变暗、聚光罩只留目标音符与要按的键，引导光束 + 按键脉冲 + 文字提示；
   玩家按对后恢复正常速度继续。按错只温柔提示，不扣分、不推进。 */
const TUT_FREEZE_LEAD = 0.6;   // 目标音符离判定线 ≤0.6 秒时冻结
const TUT_GLIDE_MS = 750;      // 冻结后音符缓滑到判定线的时长
const TUT_STEPS = [
  { type: 'tap', title: '第 1 步 · 推掌点按', keyHtml: '按 <span class="tut-keycap">空格</span> 或点按推掌键', desc: '红色圆牌顺墨河落下来，快到太极盘时会慢下来定住——其他地方变暗，只留推掌键亮着。看准了，点按它（或按空格）。' },
  { type: 'slide', title: '第 2 步 · 闪身步滑动', keyHtml: '按 <span class="tut-keycap">←</span><span class="tut-keycap">→</span> 或向箭头方向滑动', desc: '绿色的利刃音符来了，顺着箭头方向滑。快到太极盘时它会慢下来等你，跟着箭头按 ← 或 →（或向对应方向滑动）。' },
  { type: 'hold', title: '第 3 步 · 站桩吐纳长按', keyHtml: '按住 <span class="tut-keycap">空格</span> 不放', desc: '长条音符是站桩：快到时慢下来定住，按住空格（或长按站桩键）不放吸气蓄力，蓄满再松手。提前松手会断。' },
  { type: 'fever', title: '第 4 步 · 阴阳能量与天人合一', keyHtml: '', desc: '连击攒阴阳能量，攒满进入「天人合一」：水墨小人出池比武，全场双倍得分。太极盘每 4 拍轮转一次阴阳，相位一致时踩准得「轮转」加成。' }
];
function startTutorial() {
  // 正常速度开局（v7 的半速克隆已废弃）：原曲、原速、easy 难度
  startGame(0, { tutorial: { step: 0, target: null, promptShown: false, primed: false, feverShown: false }, diff: 'easy' });
  if (!G.tutorial) return;
  G.tutFrozen = false; G.tutGlide = 0;
  showTutLive();
}
function showTutLive() { const el = $('tut-live'); if (el) el.classList.remove('hidden'); }
function hideTutLive() {
  const el = $('tut-live'); if (el) el.classList.add('hidden');
  const p = $('tut-live-prompt'); if (p) p.classList.add('hidden');
  const d = $('tut-done'); if (d) d.classList.add('hidden');
  hideTutSpot();
}
function showTutStepPrompt(step) {
  const p = $('tut-live-prompt'); if (!p) return;
  $('tut-live-step').textContent = step.title;
  $('tut-live-desc').textContent = step.desc;
  const k = $('tut-live-key');
  if (k) { k.innerHTML = step.keyHtml || ''; k.classList.toggle('hidden', !step.keyHtml); }
  const done = $('btn-tut-live-done');
  if (done) done.classList.toggle('hidden', step.type !== 'fever');
  p.classList.remove('hidden');
}
function hideTutPrompt() { const p = $('tut-live-prompt'); if (p) p.classList.add('hidden'); }
function showTutHint(text) {
  const h = $('tut-live-hint'); if (!h) return;
  h.textContent = text;
  h.classList.remove('hidden');
  clearTimeout(h._t);
  h._t = setTimeout(() => h.classList.add('hidden'), 2500);
}
function shakeTutPrompt() {
  const p = $('tut-live-prompt'); if (!p) return;
  p.classList.remove('tut-shake');
  void p.offsetWidth;
  p.classList.add('tut-shake');
  clearTimeout(p._shakeT);
  p._shakeT = setTimeout(() => p.classList.remove('tut-shake'), 700);
}
function advanceTutStep() {
  const t = G.tutorial;
  if (!t) return;
  t.step++;
  t.target = null; t.promptShown = false; t.primed = false;
  clearTutTarget();
  hideTutPrompt();
  hideTutSpot();
}

/* ---- 冻结 / 恢复：复用 pauseGame 的时钟+音频冻结，但不弹暂停屏 ---- */
function tutFreeze() {
  if (G.tutFrozen) return;
  G.tutFrozen = true;
  G.tutGlide = 0;
  G.paused = true;
  Clock.pause();
  if (AudioSys.ac) AudioSys.ac.suspend();
}
function tutUnfreeze() {
  if (!G.tutFrozen) return;
  G.tutFrozen = false;
  G.paused = false;
  Clock.resume();
  if (AudioSys.ac) AudioSys.ac.resume();
}

/* ---- 聚光罩：SVG 遮罩，两处开孔（目标音符/太极盘 + 要按的键）---- */
function showTutSpot(step, target) {
  const svg = $('tut-spot'); if (!svg) return;
  svg.setAttribute('viewBox', '0 0 ' + Layout.W + ' ' + Layout.H);
  const mask = $('tut-spot-mask'); if (mask) { mask.setAttribute('width', Layout.W); mask.setAttribute('height', Layout.H); }
  const bg = $('tut-mask-bg'); if (bg) { bg.setAttribute('width', Layout.W); bg.setAttribute('height', Layout.H); }
  const dim = $('tut-spot-dim'); if (dim) { dim.setAttribute('width', Layout.W); dim.setAttribute('height', Layout.H); }
  svg.classList.remove('hidden');
  const p = $('tut-live-prompt'); if (p) p.classList.add('frozen');
  updateTutSpot();
}
function hideTutSpot() {
  const svg = $('tut-spot'); if (svg) svg.classList.add('hidden');
  const p = $('tut-live-prompt'); if (p) p.classList.remove('frozen');
}
function updateTutSpot() {
  const svg = $('tut-spot'); if (!svg || svg.classList.contains('hidden')) return;
  const t = G.tutorial; if (!t) return;
  svg.setAttribute('viewBox', '0 0 ' + Layout.W + ' ' + Layout.H);
  const mask = $('tut-spot-mask'); if (mask) { mask.setAttribute('width', Layout.W); mask.setAttribute('height', Layout.H); }
  const holeN = $('tut-hole-note');
  if (holeN) {
    if (t.target) {
      const y = noteY(t.target.time); // noteY 已含滑行偏移，孔位自动跟随音符
      holeN.setAttribute('cx', trackCX(Math.min(y, Geo.track.judgeY)));
      holeN.setAttribute('cy', y);
      holeN.setAttribute('r', 82);
    } else {
      holeN.setAttribute('cx', Geo.scroll.cx);
      holeN.setAttribute('cy', Geo.track.judgeY);
      holeN.setAttribute('r', 95);
    }
  }
  const holeB = $('tut-hole-btn');
  if (holeB) {
    const el = tutTargetEl(TUT_STEPS[t.step], t.target);
    if (el) {
      const r = el.getBoundingClientRect();
      const wr = worldEl.getBoundingClientRect();
      const s = Layout.scale || 1;
      if (r.width > 4 && r.height > 4) {
        holeB.setAttribute('x', (r.left - wr.left) / s - 14);
        holeB.setAttribute('y', (r.top - wr.top) / s - 12);
        holeB.setAttribute('width', r.width / s + 28);
        holeB.setAttribute('height', r.height / s + 24);
        holeB.style.display = '';
      } else holeB.style.display = 'none';
    } else holeB.style.display = 'none';
  }
}

/* ---- 目标按键：触屏用实体按钮，键鼠用底部键位提示条 ---- */
let tutTargetElCache = null;
function tutTargetEl(step, target) {
  if (!step || step.type === 'fever') return null;
  if (!document.body.classList.contains('is-touch')) return $('key-hint');
  if (step.type === 'tap') return $('btn-tap');
  if (step.type === 'hold') return $('btn-hold');
  if (step.type === 'slide') return target && target.dir < 0 ? $('btn-left') : $('btn-right');
  return null;
}
function markTutTarget(step, target) {
  clearTutTarget();
  const el = tutTargetEl(step, target);
  if (!el) return;
  tutTargetElCache = el;
  el.classList.add('tut-target');
  if (el.id === 'key-hint') { el.classList.add('show'); clearTimeout(el._t); }
}
function clearTutTarget() {
  if (tutTargetElCache) { tutTargetElCache.classList.remove('tut-target'); tutTargetElCache = null; }
  const kh = $('key-hint'); if (kh) kh.classList.remove('show');
}

/* ---- 冻结中的输入：只认当前步骤的正确操作，按对即判完美并恢复 ---- */
function tutFrozenInput(action, dir) {
  const t = G.tutorial;
  if (!t || !G.tutFrozen || t.step >= 3) return false;
  const step = TUT_STEPS[t.step];
  const target = t.target;
  if (!target || target.judged) return false;
  if (step.type === 'tap' && action === 'tap') return tutFrozenHit(target);
  if (step.type === 'slide' && action === 'slide') {
    if (dir !== target.dir) { showTutHint('方向反了——跟着箭头走'); shakeTutPrompt(); return false; }
    return tutFrozenHit(target);
  }
  if (step.type === 'hold' && action === 'hold') {
    // 提前抓住站桩头：判头为完美起手，玩家继续按住，条走完即判整段
    target.holding = true; target.startDiff = 0;
    t.primed = true;
    G.pressHeld = true;
    G.character = { action: 'breathe', until: G.songTime + target.dur, dir: 0 };
    AudioSys.actionSound('hold');
    tutUnfreeze(); hideTutSpot(); clearTutTarget();
    showTutHint('按住别松手——吸气蓄力中');
    return true;
  }
  showTutHint(step.type === 'tap' ? '现在要推掌——点按 / 空格' : step.type === 'slide' ? '现在要闪身步——按 ← 或 →' : '现在要站桩——按住不放');
  shakeTutPrompt();
  return false;
}
function tutFrozenHit(note) {
  // 冻结时音符已滑到判定线，按对即判完美（onHit 内含进下一步）
  G.character = { action: note.type === 'slide' ? 'dodge' : 'push', until: G.songTime + 0.3, dir: note.dir || 0 };
  if (note.type === 'slide') spawnWindBlades(note.dir, Geo.scroll.cx, Geo.track.judgeY);
  AudioSys.actionSound(note.type === 'slide' ? 'slide' : 'push');
  G.pressHeld = false;
  onHit(note, 'perfect');
  tutUnfreeze(); hideTutSpot(); clearTutTarget();
  return true;
}
function tutFrozenKey(e) {
  if (e.repeat) return;
  const t = G.tutorial; if (!t) return;
  const step = TUT_STEPS[t.step];
  if (!step || step.type === 'fever') return;
  if (e.code === 'Space') {
    e.preventDefault();
    G.pressHeld = true;
    if (step.type === 'tap') tutFrozenInput('tap');
    else if (step.type === 'hold') tutFrozenInput('hold');
    else { showTutHint('现在要闪身步——按 ← 或 →'); shakeTutPrompt(); }
  } else if (e.code === 'ArrowLeft') {
    e.preventDefault();
    tutFrozenInput('slide', -1);
  } else if (e.code === 'ArrowRight') {
    e.preventDefault();
    tutFrozenInput('slide', 1);
  }
}
function updateTutorial(dt) {
  const t = G.tutorial;
  if (!t || t.step >= TUT_STEPS.length) return;
  const step = TUT_STEPS[t.step];
  if (step.type === 'fever') {
    if (!t.feverShown) {
      t.feverShown = true;
      // 小 Fever 演示：直接拉满进天人合一（与 onHit 里的触发一致）；不冻结，比武正常播
      G.energy = 0;
      G.feverLeft = FEVER_SECONDS;
      Duel.start();
      addPopup('天人合一', '#2f5b42', true);
      setBackground(playBgMode());
      G.flash = 0.5;
      spawnFirework(Geo.scroll.cx, Geo.track.judgeY, 2.6, 0.4);
      spawnRing(Geo.scroll.cx, Geo.track.judgeY, 20, 340, 'rgba(255,236,180,0.9)', 0.9, 4);
      if (AudioSys.ac) AudioSys.gong(AudioSys.ac.currentTime, 1.6);
      showTutStepPrompt(step);
      showTutSpot(step, null); // 只留太极盘聚光，不冻结
    }
    return;
  }
  if (G.tutFrozen) return;
  if (!t.target || t.target.judged) {
    t.target = null; t.promptShown = false; t.primed = false; clearTutTarget();
    for (const n of G.chart) {
      if (n.type === step.type && !n.judged && n.time > G.songTime - 0.5) { t.target = n; break; }
    }
    if (!t.target) return;
  }
  const target = t.target;
  const lead = target.time - G.songTime;
  // 就绪：正常速度下提前 2.5 秒亮提示 + 目标键微光
  if (lead <= 2.5 && !t.promptShown) {
    t.promptShown = true;
    showTutStepPrompt(step);
    markTutTarget(step, target);
  }
  // 慢放：快到判定线时冻结，音符缓滑到线、聚光、等玩家按
  if (lead <= TUT_FREEZE_LEAD && lead > -0.05 && !t.primed) {
    tutFreeze();
    showTutSpot(step, target);
  }
}
function endTutorial(opts) {
  opts = opts || {};
  if (!G.tutorial) return;
  if (G.tutFrozen) tutUnfreeze();
  hideTutSpot();
  clearTutTarget();
  G.tutorial = false;
  hideTutLive();
  markTutorialSeen();
  if (opts.completed) {
    backToMenu();
    const d = $('tut-done');
    if (d) d.classList.remove('hidden');
  } else if (opts.skipped) {
    startGame(0);
  }
}

/* ---------------- 故事前情提要：动漫开场式（v7） ----------------
   4 幕，每幕一句旁白（逐字打出）+ 全屏画面（Ken Burns 缓推）+ 墨色转场。
   画面优先用前情插画（assets/prologue_actN.jpg，到货即自动顶替，见美术清单 10）；
   未到货时用现有背景图兜底，绝不用占位图冒充成品。点击推进，跳过按钮直达故事正文。 */
const PROLOGUE_ACTS = [
  { bg: 'prologue_act1.jpg', fallback: 'bg_menu.jpg', title: '第一幕 · 墨河', text: '墨河蜿蜒，流过千年的夜色。阴阳本应相生相济，如今却失了衡。' },
  { bg: 'prologue_act2.jpg', fallback: 'bg_fever_ink.jpg', title: '第二幕 · 浊气', text: '阴阳失衡，浊气横生。亚健康的小怪从墨河里爬出来，悄悄偷走了人们的气息。' },
  { bg: 'prologue_act3.jpg', fallback: 'bg_stage_dark.jpg', title: '第三幕 · 传人', text: '小道童拾起太极盘，以节奏为呼吸，以推掌、闪身、站桩调息应战。' },
  { bg: 'prologue_act4.jpg', fallback: 'bg_home_xihu.jpg', title: '第四幕 · 启程', text: '一曲未终，一息未乱。墨河的尽头，断桥残雪在等一个传说。' }
];
let prologueIdx = 0, prologueTyping = null, prologueTypingDone = false;
function resolveAssetUrl(filename) {
  try {
    if (window.__ASSET_DATA__ && window.__ASSET_DATA__[filename]) return window.__ASSET_DATA__[filename];
  } catch (e) {}
  return 'assets/' + filename;
}
function loadPrologueBg(filename, fallback, onDone) {
  const img = new Image();
  img.onload = () => onDone(resolveAssetUrl(filename));
  img.onerror = () => onDone(resolveAssetUrl(fallback));
  img.src = resolveAssetUrl(filename);
}
function playPrologue() {
  const p = $('prologue'); if (!p) return;
  prologueIdx = 0;
  p.classList.remove('hidden');
  showPrologueAct(0);
}
function showPrologueAct(i) {
  prologueIdx = i;
  const act = PROLOGUE_ACTS[i];
  const bgEl = $('prologue-bg');
  const ink = $('prologue-ink');
  // 标题与打字状态立即更新（不要等 350ms 转场，否则快点会跳幕）；
  // 旁白逐字在墨色转场后才开始
  $('prologue-act').textContent = act.title;
  if (prologueTyping) { clearInterval(prologueTyping); prologueTyping = null; }
  prologueTypingDone = false;
  const cont0 = $('prologue-continue');
  if (cont0) cont0.classList.add('hidden');
  if (ink) ink.classList.add('wipe');
  setTimeout(() => {
    loadPrologueBg(act.bg, act.fallback, (url) => {
      if (bgEl) bgEl.style.backgroundImage = 'url("' + url + '")';
      if (ink) ink.classList.remove('wipe');
    });
    typePrologueLine(act.text);
  }, 350);
}
function typePrologueLine(text) {
  const el = $('prologue-line');
  const cont = $('prologue-continue');
  if (!el) return;
  // 转场期间用户已点过“补全”：直接显示整句，不重打
  if (prologueTypingDone) {
    el.textContent = text;
    if (cont) cont.classList.remove('hidden');
    return;
  }
  if (prologueTyping) clearInterval(prologueTyping);
  el.textContent = '';
  if (cont) cont.classList.add('hidden');
  let n = 0;
  prologueTyping = setInterval(() => {
    n++;
    el.textContent = text.slice(0, n);
    if (n >= text.length) {
      clearInterval(prologueTyping); prologueTyping = null;
      prologueTypingDone = true;
      if (cont) cont.classList.remove('hidden');
    }
  }, 70);
}
function advancePrologue() {
  if (!prologueTypingDone) {
    if (prologueTyping) clearInterval(prologueTyping);
    prologueTyping = null;
    $('prologue-line').textContent = PROLOGUE_ACTS[prologueIdx].text;
    prologueTypingDone = true;
    const cont = $('prologue-continue');
    if (cont) cont.classList.remove('hidden');
    return;
  }
  if (prologueIdx + 1 < PROLOGUE_ACTS.length) showPrologueAct(prologueIdx + 1);
  else endPrologue();
}
function endPrologue() {
  const p = $('prologue'); if (p) p.classList.add('hidden');
  if (prologueTyping) { clearInterval(prologueTyping); prologueTyping = null; }
  const s = $('home-story');
  if (s) s.classList.remove('hidden');
}

/* ---------------- 西湖解锁仪式：扫码解锁的独立解说界面（v9） ----------------
   触发：?spot=xihu 且未解锁（完整仪式，终场锁脱落后才持久化解锁）；
   锁弹窗里的“先看一段西湖故事”（仅 3 幕故事预览，不解锁、不进终场）；
   选曲详情里的“重看解锁仪式”（已解锁后回放完整仪式）。
   画面优先用仪式插画（assets/ceremony_xihu_actN.jpg，到货即自动顶替，见美术清单 12）；
   未到货时用现有湖景图兜底。点击推进，跳过按钮直达锁终场（预览模式则直接结束）。
   锁、光束、印章全部代码绘制，无需新美术。 */
const XIHU_CEREMONY_ACTS = [
  { bg: 'ceremony_xihu_act1.jpg', fallback: 'bg_xihu.jpg', title: '第一幕 · 断桥残雪', text: '断桥残雪，湖光潋滟。千年西湖，一半藏在诗里，一半落在雾里。' },
  { bg: 'ceremony_xihu_act2.jpg', fallback: 'bg_home_xihu.jpg', title: '第二幕 · 墨河引水', text: '墨河蜿蜒至此，饮了一口西湖水。湖波荡开，锁上的锈，也松了三分。' },
  { bg: 'ceremony_xihu_act3.jpg', fallback: 'bg_fever_ink.jpg', title: '第三幕 · 湖心引路', text: '小道童循着湖光走来，太极盘轻叩断桥——只听一声轻响。' }
];
let xihuCerIdx = 0, xihuCerTyping = null, xihuCerTypingDone = false, xihuCerWipeTimer = null;
let xihuCerMode = 'full'; // 'full' 完整仪式 | 'preview' 仅故事预览
let xihuCerAfter = 'play'; // 终场后去向：'play' 进西湖关 | 'menu' 回选曲
let xihuCerTimers = [];
let xihuCerInLock = false;
let xihuCerJustUnlocked = false; // v10：本次仪式刚解锁过，回选曲时给西湖卡片播染色动画
function xihuCerClearTimers() {
  for (const t of xihuCerTimers) clearTimeout(t);
  xihuCerTimers = [];
}
function xihuCerLater(fn, ms) { xihuCerTimers.push(setTimeout(fn, ms)); }
function xihuCerIdxOf() { return SONGS.findIndex(s => s.xihu); }
function playXihuCeremony(mode, after) {
  const c = $('xihu-ceremony'); if (!c) return;
  xihuCerMode = mode || 'full';
  xihuCerAfter = after || 'play';
  xihuCerInLock = false;
  xihuCerClearTimers();
  // 复位终场
  const lock = $('xihu-cer-lock'); if (lock) lock.classList.add('hidden');
  const anim = $('xihu-cer-lockanim');
  if (anim) anim.classList.remove('shaking', 'dropping');
  const sh = $('xihu-cer-shackle'); if (sh) sh.classList.remove('open');
  const burst = $('xihu-cer-burst'); if (burst) burst.classList.remove('go');
  const seal = $('xihu-cer-seal'); if (seal) { seal.classList.add('hidden'); seal.classList.remove('stamp'); }
  const done = $('xihu-cer-done'); if (done) done.classList.add('hidden');
  const cta = $('xihu-cer-cta'); if (cta) cta.classList.add('hidden');
  const text = $('xihu-cer-text'); if (text) text.classList.remove('hidden');
  showXihuCerSync('');
  xihuCerIdx = 0;
  c.classList.remove('hidden');
  showXihuCerAct(0);
}
function showXihuCerAct(i) {
  xihuCerIdx = i;
  const act = XIHU_CEREMONY_ACTS[i];
  const bgEl = $('xihu-cer-bg');
  const ink = $('xihu-cer-ink');
  $('xihu-cer-act').textContent = act.title;
  if (xihuCerTyping) { clearInterval(xihuCerTyping); xihuCerTyping = null; }
  xihuCerTypingDone = false;
  const cont0 = $('xihu-cer-continue');
  if (cont0) cont0.classList.add('hidden');
  if (ink) ink.classList.add('wipe');
  if (xihuCerWipeTimer) clearTimeout(xihuCerWipeTimer);
  xihuCerWipeTimer = setTimeout(() => {
    loadPrologueBg(act.bg, act.fallback, (url) => {
      if (bgEl) bgEl.style.backgroundImage = 'url("' + url + '")';
      if (ink) ink.classList.remove('wipe');
    });
    typeXihuCerLine(act.text);
  }, 350);
}
function typeXihuCerLine(text) {
  const el = $('xihu-cer-line');
  const cont = $('xihu-cer-continue');
  if (!el) return;
  if (xihuCerTypingDone) {
    el.textContent = text;
    if (cont) cont.classList.remove('hidden');
    return;
  }
  if (xihuCerTyping) clearInterval(xihuCerTyping);
  el.textContent = '';
  if (cont) cont.classList.add('hidden');
  let n = 0;
  xihuCerTyping = setInterval(() => {
    n++;
    el.textContent = text.slice(0, n);
    if (n >= text.length) {
      clearInterval(xihuCerTyping); xihuCerTyping = null;
      xihuCerTypingDone = true;
      if (cont) cont.classList.remove('hidden');
    }
  }, 70);
}
function advanceXihuCeremony() {
  if (xihuCerInLock) return; // 终场进行中不响应点击
  if (!xihuCerTypingDone) {
    if (xihuCerTyping) clearInterval(xihuCerTyping);
    xihuCerTyping = null;
    $('xihu-cer-line').textContent = XIHU_CEREMONY_ACTS[xihuCerIdx].text;
    xihuCerTypingDone = true;
    const cont = $('xihu-cer-continue');
    if (cont) cont.classList.remove('hidden');
    return;
  }
  if (xihuCerIdx + 1 < XIHU_CEREMONY_ACTS.length) showXihuCerAct(xihuCerIdx + 1);
  else if (xihuCerMode === 'preview') endXihuCeremony('back');
  else xihuCerLockFinale();
}
function skipXihuCeremony() {
  if (xihuCerInLock) return;
  if (xihuCerTyping) { clearInterval(xihuCerTyping); xihuCerTyping = null; }
  if (xihuCerMode === 'preview') endXihuCeremony('back');
  else xihuCerLockFinale();
}
/* 锁终场：锁现身 → 摇晃松动 → 锁扣弹开、锁身坠落 + 金光墨花 → 印章盖下 → 按钮 */
function xihuCerLockFinale() {
  xihuCerInLock = true;
  if (xihuCerTyping) { clearInterval(xihuCerTyping); xihuCerTyping = null; }
  const text = $('xihu-cer-text'); if (text) text.classList.add('hidden');
  const lock = $('xihu-cer-lock'); if (lock) lock.classList.remove('hidden');
  const anim = $('xihu-cer-lockanim');
  const shackle = $('xihu-cer-shackle');
  const burst = $('xihu-cer-burst');
  const seal = $('xihu-cer-seal');
  const done = $('xihu-cer-done');
  const cta = $('xihu-cer-cta');
  // 终场一开始就持久化解锁（刷新也不丢）；重复调用无副作用
  const _wasLocked = !isXihuUnlocked();
  unlockXihu();
  if (_wasLocked && xihuCerMode === 'full') xihuCerJustUnlocked = true;
  // v10 跨端同步：终场写云端“已解锁”，让电脑端自动解锁
  const _syncCode = xihuSyncCodeFromUrl;
  if (_syncCode && SYNC_CODE_RE.test(_syncCode)) {
    xihuSyncPosted = false;
    syncPostUnlock(_syncCode).then(ok => {
      xihuSyncPosted = ok;
      showXihuCerSync(ok ? '已同步到电脑 · 电脑将自动解锁' : '同步码 ' + _syncCode + '（电脑没反应时，在电脑西湖弹窗输入此码）');
    });
  } else {
    // 没有配对码（直接打开的链接）：现场生成一个并写云端，显示出来供手动输入
    const _c = makeSyncCode();
    xihuSyncCodeFromUrl = _c;
    xihuSyncPosted = false;
    syncPostUnlock(_c).then(ok => {
      xihuSyncPosted = ok;
      showXihuCerSync(ok ? '同步码 ' + _c + ' · 已同步到电脑' : '同步码 ' + _c + '（在电脑西湖弹窗输入此码即可同步解锁）');
    });
  }
  const gong = () => { try { if (AudioSys.ac) AudioSys.gong(AudioSys.ac.currentTime, 1.6); } catch (e) {} };
  xihuCerLater(() => { if (anim) anim.classList.add('shaking'); }, 400);
  xihuCerLater(() => {
    if (anim) anim.classList.remove('shaking');
    if (shackle) shackle.classList.add('open');
    if (anim) anim.classList.add('dropping');
    if (burst) burst.classList.add('go');
    xihuCerSparks();
    gong();
  }, 1300);
  xihuCerLater(() => {
    if (seal) { seal.classList.remove('hidden'); seal.classList.add('stamp'); }
    if (done) done.classList.remove('hidden');
    if (cta) cta.classList.remove('hidden');
    gong();
  }, 2100);
}
/* 金光粒子：12 颗从锁心向四周飞散 */
function xihuCerSparks() {
  const wrap = $('xihu-cer-lockwrap'); if (!wrap) return;
  for (let i = 0; i < 12; i++) {
    const s = document.createElement('span');
    s.className = 'xihu-cer-spark';
    const ang = (i / 12) * Math.PI * 2 + Math.random() * 0.5;
    const dist = 70 + Math.random() * 90;
    s.style.setProperty('--dx', (Math.cos(ang) * dist).toFixed(0) + 'px');
    s.style.setProperty('--dy', (Math.sin(ang) * dist).toFixed(0) + 'px');
    wrap.appendChild(s);
    setTimeout(() => s.remove(), 1000);
  }
}
function endXihuCeremony(where) {
  xihuCerClearTimers();
  if (xihuCerTyping) { clearInterval(xihuCerTyping); xihuCerTyping = null; }
  xihuCerInLock = false;
  const c = $('xihu-ceremony'); if (c) c.classList.add('hidden');
  if (where === 'play') startGame(xihuCerIdxOf());
  else if (where === 'menu') {
    backToMenu();
    const idx = xihuCerIdxOf();
    // v10：本次仪式刚解锁过——backToMenu 已重渲染成彩色，先把卡片临时恢复黑白锁定态，
    // 再播染色动画揭出彩色（火焰经过处锁定角标一并烧掉），揭完再重渲染成解锁态
    if (xihuCerJustUnlocked) {
      xihuCerJustUnlocked = false;
      const card = document.querySelectorAll('#song-list .song-scroll-item')[idx];
      if (card) {
        card.classList.add('locked');
        card.scrollIntoView({ block: 'nearest' });
        playDyeUnlock(card, { onDone: () => { renderSongList(); selectSong(idx, true); }, target: () => document.querySelectorAll('#song-list .song-scroll-item')[idx] });
        return;
      }
    }
    selectSong(idx, true);
  }
  // 'back'：什么都不做——锁弹窗还开在底下，直接回到它
}
function skipPrologue() { endPrologue(); }

/* ------------------------------------------------------------
   4. 流程
   ------------------------------------------------------------ */
function startGame(songIdx, opts) {
  opts = opts || {};
  const _song = opts.song || SONGS[songIdx] || SONGS[0];
  if (_song.xihu && !isXihuUnlocked()) { openXihuLock(); return; }
  if (_song.id === 5 && !isSongUnlocked(5)) { openSongUnlock(5); return; }
  if (!opts.tutorial) ensureDiffUnlocked(_song.id);
  AudioSys.init();
  MenuBGM.stop();

  const song = _song;
  G.song = song;
  G.diff = opts.diff || selectedDiff;
  G.approachMult = DIFFS[G.diff].approach;
  G.chart = generateChart(song, G.diff);
  G.tutorial = opts.tutorial || false;
  G.tutFrozen = false; G.tutGlide = 0;

  G.paused = false;
  G.score = 0; G.combo = 0; G.maxCombo = 0;
  G.countPerfect = 0; G.countGood = 0; G.countMiss = 0;
  G.disorder = 0; G.energy = 0; G.feverLeft = 0;
  G.pressHeld = false;
  G.character = { action: 'idle', until: 0, dir: 0 };
  G.enemies.forEach(e => { e.advance = 0; e.flash = 0; });
  G.shake = 0; G.flash = 0; G.hitFlash = 0; G.swordT = 0;
  G.comboPop = 0; G.comboGlow = 0;
  G.duelT = -99;
  G.recentMoves = [];
  G.popups.length = 0; G.sparks.length = 0; G.ink.length = 0;
  G.rings.length = 0; G.slashes.length = 0; G.fireworks.length = 0;
  G.vortex.length = 0; G.milestones.length = 0;
  G.verses.length = 0; G.projectiles.length = 0; G.purifications.length = 0;
  G.comboWaves.length = 0; G.windBlades.length = 0; G.qiStream.length = 0;

  AudioSys.melodyIdx = 0;
  AudioSys.beatIdx = 0;
  if (AudioSys.ac) G.startAt = AudioSys.ac.currentTime + 0.8;
  Clock.start(0.8);            // 0.8 秒预备拍
  G.songTime = -0.8;

  G.state = 'playing';
  setBackground(playBgMode());

  $('screen-home').classList.add('hidden');
  $('screen-menu').classList.add('hidden');
  $('screen-result').classList.add('hidden');
  $('screen-pause').classList.add('hidden');
  $('xihu-lock').classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('touch-controls').classList.remove('hidden');
  $('rotate-hint').classList.toggle('hidden', !Layout.portrait);

  $('hud-song-title').textContent = song.title;
  $('hud-diff-seal').textContent = DIFFS[G.diff].name;

  // 键鼠提示：浮出 5.5 秒后淡出
  const hint = $('key-hint');
  if (hint) {
    hint.classList.add('show');
    clearTimeout(hint._t);
    hint._t = setTimeout(() => hint.classList.remove('show'), 5500);
  }

  AudioSys.startScheduler();
  if (song.xihu) AudioSys.startWater(); else AudioSys.stopWater();
  updateHud();
}

function songDuration() {
  return G.song ? G.song.beats * (60 / G.song.bpm) : 0;
}

function endGame() {
  if (G.state !== 'playing') return;
  G.state = 'result';
  AudioSys.stopScheduler();
  AudioSys.stopWater();
  MenuBGM.start();
  setBackground(playBgMode());

  G.chart.forEach(n => { if (!n.judged) { n.judged = true; G.countMiss++; } });

  const total = G.chart.length;
  const acc = total ? Math.min(1, (G.countPerfect + G.countGood * 0.5) / total) : 0;
  const grade = acc >= 0.95 ? '甲' : acc >= 0.85 ? '乙' : acc >= 0.7 ? '丙' : acc >= 0.5 ? '丁' : '励';
  const prevBest = loadBest(G.song.id, G.diff);
  const isRecord = !G.tutorial && total > 0 && (!prevBest || G.score > prevBest.score);
  if (!G.tutorial) {
    if (isRecord) saveBest(G.song.id, G.score, grade, G.maxCombo, G.diff);
    recordHandbook(grade);
  }

  /* 墨币结算（v7）：教程局不发 */
  let coinsEarned = 0, coinsBreakdown = '';
  if (!G.tutorial) {
    const c = calcCoinsEarned(grade);
    coinsEarned = c.earned;
    saveCoins(loadCoins() + coinsEarned);
    coinsBreakdown = '准 ' + G.countPerfect + '×2=' + (G.countPerfect * 2) + ' · 可 ' + G.countGood + '×1=' + G.countGood + ' · 评级 +' + c.gb + ' · 连击 +' + c.cb + ' · 难度 ×' + c.mult + ' = ' + c.earned;
  }

  $('result-song').textContent =
    G.song.title + '（' + G.song.meridian + '）修习完毕' + (isRecord ? ' · ★ 创下新纪录' : '');
  $('result-grade').textContent = grade;
  /* 结算印：甲→天、乙→妙、丙→极，图加载成功才替换文字，失败保持文字 */
  const gradeSeal = { '甲': 'seal_tian.png', '乙': 'seal_miao.png', '丙': 'seal_ji.png' }[grade];
  if (gradeSeal) {
    const gradeEl = $('result-grade');
    const sealImg = new Image();
    sealImg.alt = grade;
    sealImg.onload = () => { gradeEl.textContent = ''; gradeEl.appendChild(sealImg); };
    sealImg.src = 'assets/' + gradeSeal;
  }
  $('r-score').textContent = String(G.score);
  $('r-combo').textContent = String(G.maxCombo);
  $('r-counts').textContent = G.countPerfect + ' / ' + G.countGood + ' / ' + G.countMiss;
  $('r-acc').textContent = Math.round(acc * 100) + '%';
  $('r-coins').textContent = G.tutorial ? '教程局不发' : '+' + coinsEarned;
  $('r-coins-total').textContent = String(loadCoins());
  const cn = $('result-coins-note');
  if (cn) cn.textContent = G.tutorial ? '新手教程局不发墨币，正式修习即可赚取。' : ('墨币算法：' + coinsBreakdown);
  $('result-tip').textContent = G.song.tip;
  $('result-tip-img').src = 'assets/' + G.song.tipImg;

  $('screen-result').classList.remove('hidden');
  $('hud').classList.add('hidden');
  $('touch-controls').classList.add('hidden');
  renderSongList();
  selectSong(G.song.id, true);
}

function backToMenu() {
  if (G.tutorial) { G.tutorial = false; hideTutLive(); }
  G.state = 'menu';
  AudioSys.stopScheduler();
  AudioSys.stopWater();
  MenuBGM.start();
  setBackground('menu');
  const hint = $('key-hint');
  if (hint) hint.classList.remove('show');
  $('screen-result').classList.add('hidden');
  $('screen-pause').classList.add('hidden');
  $('screen-home').classList.add('hidden');
  $('screen-menu').classList.remove('hidden');
  $('hud').classList.add('hidden');
  $('touch-controls').classList.add('hidden');
  $('rotate-hint').classList.add('hidden');
  renderSongList();
}

function goHome() {
  G.state = 'home';
  AudioSys.stopScheduler();
  MenuBGM.start();
  setBackground(homeBgMode());
  $('screen-result').classList.add('hidden');
  $('screen-menu').classList.add('hidden');
  $('screen-pause').classList.add('hidden');
  $('screen-home').classList.remove('hidden');
  $('hud').classList.add('hidden');
  $('touch-controls').classList.add('hidden');
  $('rotate-hint').classList.add('hidden');
  refreshCoinDisplays();
}

function pauseGame() {
  if (G.state !== 'playing' || G.paused) return;
  G.paused = true;
  G.pressHeld = false;
  Clock.pause();
  if (AudioSys.ac) AudioSys.ac.suspend();
  $('screen-pause').classList.remove('hidden');
}
function resumeGame() {
  if (!G.paused) return;
  G.paused = false;
  Clock.resume();
  if (AudioSys.ac) AudioSys.ac.resume();
  $('screen-pause').classList.add('hidden');
}
function quitDuringPlay() {
  if (G.state !== 'playing') return;
  if (G.tutFrozen) { tutUnfreeze(); hideTutLive(); hideTutSpot(); clearTutTarget(); G.tutorial = false; markTutorialSeen(); }
  G.paused = false;
  G.pressHeld = false;
  if (AudioSys.ac) AudioSys.ac.resume();
  backToMenu();
}
function quitFromPause() {
  G.paused = false;
  if (AudioSys.ac) AudioSys.ac.resume();
  backToMenu();
}

/* ------------------------------------------------------------
   5. 判定
   ------------------------------------------------------------ */
function nearestNote(types) {
  let best = null, bestDiff = 1e9;
  for (const n of G.chart) {
    if (n.judged || types.indexOf(n.type) < 0) continue;
    const d = Math.abs(n.time - G.songTime);
    if (d <= WIN_GOOD && d < bestDiff) { best = n; bestDiff = d; }
  }
  return best;
}

function onHit(note, level) {
  note.judged = true;
  const mult = (G.feverLeft > 0 ? 2 : 1) * (DIFFS[G.diff] || DIFFS.normal).mult;
  const isPerf = level === 'perfect';
  const cx = Geo.scroll.cx;
  const cy = Geo.track.judgeY;

  if (isPerf) {
    G.score += Math.round(SCORE_PERFECT * mult);
    G.countPerfect++;
    G.energy = Math.min(100, G.energy + ENERGY_PERFECT);
    // 阴阳轮转加成（v6）：踩准时相位与音符相位一致，能量 +2
    const phaseMatch = note.phase === currentPhase();
    if (phaseMatch) G.energy = Math.min(100, G.energy + 2);
    addPopup(phaseMatch ? '准 · 轮转' : '准', '#b8352a');
    AudioSys.judgeSound('perfect');
    fxHitPerfect(cx, cy);
    G.swordT = 0.3;
  } else {
    G.score += Math.round(SCORE_GOOD * mult);
    G.countGood++;
    G.energy = Math.min(100, G.energy + ENERGY_GOOD);
    addPopup('可', '#a8791f');
    AudioSys.judgeSound('good');
    fxHitGood(cx, cy);
  }

  G.combo++;
  G.maxCombo = Math.max(G.maxCombo, G.combo);
  if (navigator.vibrate) { try { navigator.vibrate(isPerf ? 12 : 8); } catch (e) {} }
  trackMove(note.type);
  spawnProjectile(G.combo % 2);
  fxMilestone(G.combo, cx, cy);

  // 阴阳集满 -> 天人合一：水墨比武
  if (G.energy >= 100 && G.feverLeft <= 0) {
    G.energy = 0;
    G.feverLeft = FEVER_SECONDS;
    Duel.start();
    addPopup('天人合一', '#2f5b42', true);
    setBackground(playBgMode());
    G.flash = 0.5;
    spawnFirework(cx, cy, 2.6, 0.4);
    spawnRing(cx, cy, 20, 340, 'rgba(255,236,180,0.9)', 0.9, 4);
    if (AudioSys.ac) AudioSys.gong(AudioSys.ac.currentTime, 1.6);
  }

  G.enemies.forEach(e => {
    e.flash = 0.3;
    e.advance = Math.max(0, e.advance - 14);
  });

  // 实战教程（v7）：踩准当前步骤的目标操作即进下一步
  if (G.tutorial && G.tutorial.step < 3 && note.type === TUT_STEPS[G.tutorial.step].type) advanceTutStep();

  updateHud();
}

/* 招式名横幅：连续踩准的音符凑成八段锦招式，飘名 + 奖励 */
const MOVE_PATTERNS = [
  { seq: ['tap', 'hold', 'slide', 'tap'], name: '双手托天理三焦' },
  { seq: ['slide', 'tap', 'slide', 'tap'], name: '左右开弓似射雕' },
  { seq: ['hold', 'tap', 'tap', 'slide'], name: '摇头摆尾去心火' },
  { seq: ['tap', 'tap', 'hold', 'tap'], name: '调理脾胃须单举' },
  { seq: ['slide', 'slide', 'hold', 'tap'], name: '五劳七伤往后瞧' }
];
function trackMove(type) {
  G.recentMoves = (G.recentMoves || []).concat([type]).slice(-4);
  for (const p of MOVE_PATTERNS) {
    const s = p.seq;
    if (G.recentMoves.slice(-s.length).join(',') === s.join(',')) {
      G.recentMoves = [];
      G.score += 200;
      G.energy = Math.min(100, G.energy + 4);
      const hb = loadHandbook();
      hb.moves = hb.moves || {};
      hb.moves[p.name] = (hb.moves[p.name] || 0) + 1;
      saveHandbook(hb);
      showMoveBanner(p.name);
      break;
    }
  }
}
function showMoveBanner(name) {
  const el = $('move-banner');
  if (!el) return;
  el.querySelector('.mb-name').textContent = name;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 1800);
  if (AudioSys.ac) AudioSys.gong(AudioSys.ac.currentTime, 2);
}
/* 化劲容错：差一点点没踩准（0.19–0.30 秒）不算乱，化去力道、得少量阴阳 */
function nearestHuajin(types) {
  let best = null, bestDiff = 1e9;
  for (const n of G.chart) {
    if (n.judged || types.indexOf(n.type) < 0) continue;
    const d = Math.abs(n.time - G.songTime);
    if (d > WIN_GOOD && d <= WIN_HUAJIN && d < bestDiff) { best = n; bestDiff = d; }
  }
  return best;
}
function onHuajin(note) {
  note.judged = true;
  G.energy = Math.min(100, G.energy + 3);
  G.score += 50;
  addPopup('化劲', '#2f7d4f');
  if (AudioSys.ac) AudioSys.ksPluck(660, AudioSys.ac.currentTime, 0.3, 0.14);
  if (navigator.vibrate) { try { navigator.vibrate(8); } catch (e) {} }
  updateHud();
}

function onMiss(note) {
  if (note) note.judged = true;
  G.countMiss++;
  G.combo = 0;
  G.disorder = Math.min(100, G.disorder + DISORDER_MISS);
  fxMiss(Geo.scroll.cx, Geo.track.judgeY);
  addPopup('乱', '#6b6b60');
  AudioSys.judgeSound('miss');
  G.character = { action: 'stagger', until: G.songTime + 0.4, dir: 0 };
  G.enemies.forEach(e => { e.advance = Math.min(96, e.advance + 18); });
  // 实战教程（v7）：错过当前步骤的目标操作，温柔提醒再试一次（不进下一步）
  if (G.tutorial && note && G.tutorial.step < 3 && note.type === TUT_STEPS[G.tutorial.step].type) {
    showTutHint('没打中，再试一次——等音符落到太极盘时再按');
  }
  updateHud();
}

function tryTap() {
  if (G.state !== 'playing' || G.paused) return;
  const n = nearestNote(['tap']);
  if (!n) {
    const h = nearestHuajin(['tap']);
    if (h) { onHuajin(h); G.character = { action: 'push', until: G.songTime + 0.28, dir: 0 }; return; }
    if (!G.tutorial && !nearestNote(['hold'])) G.disorder = Math.min(100, G.disorder + DISORDER_STRAY);
    return;
  }
  const d = Math.abs(n.time - G.songTime);
  G.character = { action: 'push', until: G.songTime + 0.28, dir: 0 };
  AudioSys.actionSound('push');
  onHit(n, d <= WIN_PERFECT ? 'perfect' : 'good');
}

function trySlide(dir) {
  if (G.state !== 'playing' || G.paused) return;
  const n = nearestNote(['slide']);
  G.character = { action: 'dodge', until: G.songTime + 0.3, dir };
  spawnWindBlades(dir, Geo.scroll.cx, Geo.track.judgeY);
  AudioSys.actionSound('slide');
  if (!n) {
    const h = nearestHuajin(['slide']);
    if (h && h.dir === dir) { onHuajin(h); return; }
    if (!G.tutorial) G.disorder = Math.min(100, G.disorder + DISORDER_STRAY);
    return;
  }
  if (n.dir !== dir) { onMiss(n); return; }
  const d = Math.abs(n.time - G.songTime);
  onHit(n, d <= WIN_PERFECT ? 'perfect' : 'good');
}

function updateHold(dt) {
  for (const n of G.chart) {
    if (n.type !== 'hold' || n.judged) continue;
    const headDiff = G.songTime - n.time;

    if (!n.holding) {
      if (G.pressHeld && Math.abs(headDiff) <= WIN_HUAJIN) {
        n.holding = true;
        n.startDiff = Math.abs(headDiff);
        G.character = { action: 'breathe', until: G.songTime + n.dur, dir: 0 };
        AudioSys.actionSound('hold');
      } else if (headDiff > WIN_HUAJIN) {
        onMiss(n);
      }
    } else {
      G.character.until = Math.max(G.character.until, G.songTime + 0.1);

      if (Math.random() < dt * 46) {
        const a = rand(0, Math.PI * 2);
        capPush(G.vortex, {
          x: 0, y: 0,
          angle: a,
          radius: Geo.scroll.judgeR * rand(1.1, 2.0),
          speed: rand(120, 210),
          dir: Math.random() < 0.5 ? 1 : -1,
          color: Math.random() < 0.6 ? '#8dffd0' : '#ffe89e',
          life: 1
        }, FX_LIMIT.vortex);
      }

      if (!G.pressHeld && G.songTime < n.time + n.dur - 0.05) {
        onMiss(n);
      } else if (G.songTime >= n.time + n.dur) {
        onHit(n, (n.startDiff || 0) <= WIN_PERFECT ? 'perfect' : 'good');
      }
    }
  }
}

/* ------------------------------------------------------------
   6. 每帧更新
   ------------------------------------------------------------ */
function update(dt) {
  const now = performance.now() / 1000;

  if (G.state === 'playing' && !G.paused) {
    G.songTime = Clock.now();

    for (const n of G.chart) {
      if (n.judged || n.type === 'hold') continue;
      if (G.songTime - n.time > WIN_HUAJIN) onMiss(n);
    }
    updateHold(dt);
    if (G.tutorial) updateTutorial(dt);

    // 气息自然平复
    G.disorder = Math.max(0, G.disorder - dt * 2.2);

    // 天人合一倒计时
    if (G.feverLeft > 0) {
      G.feverLeft = Math.max(0, G.feverLeft - dt);
      if (G.feverLeft <= 0) setBackground(playBgMode());
    }

    // 墨河灵气
    if (Math.random() < dt * 26) {
      capPush(G.qiStream, {
        y: Geo.track.topY + rand(-30, 40),
        vy: rand(110, 240),
        r: rand(1.4, 2.8),
        seed: rand(0, 6.28),
        gold: Math.random() < 0.5,
        life: 1
      }, FX_LIMIT.qiStream);
    }
    for (const q of G.qiStream) { q.y += q.vy * dt; q.life -= dt * 0.42; }
    G.qiStream = G.qiStream.filter(q => q.life > 0 && q.y < Geo.track.judgeY + 30);


    if (G.swordT > 0) G.swordT -= dt;
    G.enemies.forEach(e => { if (e.flash > 0) e.flash -= dt; });

    updateHud();
    if (G.songTime > songDuration() + 1.4) endGame();
  }

  // 实战教程 v8：冻结时推进慢放滑行 + 跟随聚光孔（主循环暂停时这里仍每帧跑）
  if (G.tutFrozen && G.tutGlide < 1) G.tutGlide = Math.min(1, G.tutGlide + dt / (TUT_GLIDE_MS / 1000));
  if (G.tutFrozen) updateTutSpot();

  updateFx(dt, now);
}

/* ------------------------------------------------------------
   7. HUD
   ------------------------------------------------------------ */
function updateHud() {
  $('hud-score').textContent = String(G.score).padStart(6, '0');
  $('hud-combo').textContent = String(G.combo);
  $('bar-disorder').style.width = G.disorder + '%';
  $('disorder-text').textContent = G.disorder < 30 ? '平稳' : G.disorder < 65 ? '紊乱' : '极乱';

  const pct = G.feverLeft > 0
    ? Math.round(G.feverLeft / FEVER_SECONDS * 100)
    : Math.round(G.energy);
  $('bar-energy').style.width = pct + '%';
  $('energy-text').textContent = G.feverLeft > 0 ? Math.ceil(G.feverLeft) + '秒' : Math.round(G.energy) + '%';
  $('hud-fever').classList.toggle('hidden', G.feverLeft <= 0);
  // 阴阳轮转相位指示（v6）：太极盘随相位翻转 180°，标签同步变色
  const ph = currentPhase();
  const pt = $('phase-text');
  if (pt) { pt.textContent = ph === 0 ? '阴' : '阳'; pt.className = ph === 0 ? 'phase-yin' : 'phase-yang'; }
  const hd = document.querySelector('.hud-disc');
  if (hd) hd.classList.toggle('phase-yang', ph === 1);
  const ht = $('hud-taichi');
  if (ht) ht.style.transform = ph === 1 ? 'rotate(180deg)' : 'rotate(0deg)';
}

/* ------------------------------------------------------------
   8. 曲谱阁
   ------------------------------------------------------------ */
let selectedSong = 0;
let selectedDiff = 'normal';

const GRADE_SEALS = { '甲': '甲等', '乙': '妙', '丙': '极', '丁': '通', '励': '学' };
const DIFF_STARS = { '简单': '★☆☆', '中等': '★★☆', '困难': '★★★' };

function renderSongList() {
  const list = $('song-list');
  if (!list) return;
  list.innerHTML = '';

  SONGS.forEach((song, i) => {
    const best = loadBestAny(song.id);
    const isSel = i === selectedSong;
    const xihuLocked = song.xihu && !isXihuUnlocked();
    const coinLocked = song.id === 5 && !isSongUnlocked(5);
    const locked = xihuLocked || coinLocked;
    const actionMatch = song.tip.match(/「(.*?)」/);
    const actionName = actionMatch ? actionMatch[1] : '八段锦调息';

    const item = document.createElement('div');
    item.className = 'song-scroll-item' + (isSel ? ' selected' : '') + (xihuLocked ? ' locked' : '') + (coinLocked ? ' locked-coins' : '');
    item.innerHTML =
      (isSel ? '<span class="sel-ring"></span>' : '') +
      '<div class="sri-thumb"><img src="assets/' + song.art + '" alt="' + song.title + '"></div>' +
      '<div class="sri-body">' +
        '<div class="sri-title-row">' +
          '<span class="sri-title">' + song.title + '</span>' +
          '<span class="sri-badge">' + song.meridian.split('·')[0].trim() + '</span>' +
        '</div>' +
        '<div class="sri-action">【' + actionName + '】</div>' +
        '<div class="sri-meta">难度 <span class="stars">' + (DIFF_STARS[song.difficulty] || '★★☆') + '</span> · ' +
          song.bpm + ' BPM' + (best ? ' · 最高 ' + best.score.toLocaleString() : '') +
        '</div>' +
        (coinLocked ? '<div class="sri-lock">需墨币 ' + SONG5_UNLOCK_COST + ' 解锁（当前 ' + loadCoins() + '）</div>' : '') +
      '</div>' +
      '<div class="sri-seal' + (best ? '' : ' none') + '">' +
        (best ? (GRADE_SEALS[best.grade] || '妙') : '未修') +
      '</div>';

    item.addEventListener('click', () => {
      if (xihuLocked) { openXihuLock(); return; }
      if (coinLocked) { openSongUnlock(5); return; }
      selectSong(i);
    });
    item.addEventListener('dblclick', () => {
      if (xihuLocked) { openXihuLock(); return; }
      if (coinLocked) { openSongUnlock(5); return; }
      startGame(i);
    });
    list.appendChild(item);
  });
  refreshCoinDisplays();
}

function selectSong(i, keepDiff) {
  if (SONGS[i].xihu && !isXihuUnlocked()) { openXihuLock(); return; }
  selectedSong = i;
  const song = SONGS[i];
  if (!keepDiff) selectedDiff = NATIVE_DIFF[song.difficulty] || 'normal';
  ensureDiffUnlocked(song.id);

  $('detail-img').src = 'assets/' + song.art;
  $('detail-name').textContent = song.title;
  $('detail-meta').textContent = song.composer || '云水谣 / 词：古意';
  $('detail-sub').textContent = song.meridian;
  $('detail-bpm-tag').textContent = song.bpm + ' BPM · ' + song.beats + ' 拍';

  const actionMatch = song.tip.match(/「(.*?)」/);
  $('detail-action').textContent = actionMatch ? actionMatch[1] : '双手托天理三焦';
  $('detail-desc').textContent = song.desc;

  const best = loadBestAny(song.id);
  $('detail-best-seal').textContent = best ? (GRADE_SEALS[best.grade] || '妙') : '未挑战';
  $('detail-best-score').textContent = best ? best.score.toLocaleString() : '000000';
  $('detail-best-combo').textContent = best ? (best.combo || 0) + ' 连' : '0 连';

  /* 冬至关锁定态：开始按钮改成解锁入口 + 提示行 */
  const sb = $('btn-detail-start');
  if (sb) {
    const bEl = sb.querySelector('b'), iEl = sb.querySelector('i');
    if (song.id === 5 && !isSongUnlocked(5)) {
      if (bEl) bEl.textContent = '墨币解锁';
      if (iEl) iEl.textContent = SONG5_UNLOCK_COST + ' 墨币';
    } else {
      if (bEl) bEl.textContent = '开始修行';
      if (iEl) iEl.textContent = '演 练';
    }
  }
  const ln = $('detail-lock-note');
  if (ln) {
    if (song.id === 5 && !isSongUnlocked(5)) {
      ln.textContent = '冬至 · 子时需墨币 ' + SONG5_UNLOCK_COST + ' 解锁（当前 ' + loadCoins() + '）';
      ln.classList.remove('hidden');
    } else ln.classList.add('hidden');
  }

  refreshDiffUI();
  renderSongList();

  /* 西湖已解锁：详情页露出“重看解锁仪式” */
  const xrb = $('btn-detail-xihu-cer');
  if (xrb) xrb.classList.toggle('hidden', !(song.xihu && isXihuUnlocked()));

  const sel = document.querySelector('.song-scroll-item.selected');
  if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

let _diffLockSeen = null; // v10：上次渲染时锁着的难度章（"songId:diff"），用于捕捉“刚解锁”的瞬间
function refreshDiffUI() {
  const songId = (SONGS[selectedSong] || {}).id;
  const DIFF_CN = { easy: '简单', normal: '普通', hard: '困难' };
  if (!_diffLockSeen) _diffLockSeen = new Set();
  document.querySelectorAll('.diff-stamp').forEach(p => {
    const d = p.dataset.diff;
    const unlocked = songId === undefined ? true : diffUnlocked(songId, d);
    const key = songId + ':' + d;
    const wasLocked = _diffLockSeen.has(key);
    if (unlocked) {
      if (wasLocked) {
        // v10：刚解锁——先不去灰度，染色动画揭完再改成解锁态
        _diffLockSeen.delete(key);
        const stamp = p;
        playDyeUnlock(stamp, {
          sealText: '已解锁',
          fixClone: (clone) => { const iEl = clone.querySelector('i'); if (iEl) iEl.textContent = DIFF_CN[d]; },
          onDone: () => {
            stamp.classList.remove('locked');
            stamp.classList.toggle('active', d === selectedDiff);
            const iEl = stamp.querySelector('i');
            if (iEl) iEl.textContent = DIFF_CN[d];
          }
        });
      } else {
        p.classList.toggle('active', d === selectedDiff);
        p.classList.remove('locked');
        const iEl = p.querySelector('i');
        if (iEl) iEl.textContent = DIFF_CN[d];
      }
    } else {
      _diffLockSeen.add(key);
      p.classList.toggle('active', d === selectedDiff);
      p.classList.add('locked');
      const iEl = p.querySelector('i');
      if (iEl) iEl.textContent = '未解锁';
    }
  });
  const note = $('detail-diff-note');
  if (note) {
    if (songId === undefined) { note.classList.add('hidden'); return; }
    const locked = ['easy', 'normal', 'hard'].filter(d => !diffUnlocked(songId, d));
    note.innerHTML = locked.length ? locked.map(d => diffLockNote(songId, d)).join('<br>') : '';
    note.classList.toggle('hidden', !locked.length);
  }
}

/* ------------------------------------------------------------
   9. 布局变化回调
   ------------------------------------------------------------ */
function onLayoutChanged() {
  const W = Layout.W, H = Layout.H;
  for (const p of G.petals) { p.x = clamp(p.x, -40, W + 40); p.y = clamp(p.y, -30, H + 30); }
  for (const m of G.motes) { m.x = clamp(m.x, 0, W); m.y = clamp(m.y, 0, H); }
  if (G.state === 'playing') updateHud();
}

/* ------------------------------------------------------------
   10. 输入
   ------------------------------------------------------------ */
window.addEventListener('keydown', (e) => {
  if (G.tutorial && e.code === 'Escape') { endTutorial({ skipped: true }); return; }
  if (G.tutFrozen) { tutFrozenKey(e); return; }
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (G.state === 'playing') { G.paused ? resumeGame() : pauseGame(); }
    return;
  }
  if (G.paused) return;

  if (G.state === 'menu' && (e.code === 'ArrowUp' || e.code === 'ArrowDown')) {
    e.preventDefault();
    selectSong(clamp(selectedSong + (e.code === 'ArrowDown' ? 1 : -1), 0, SONGS.length - 1));
    return;
  }
  if (e.code === 'Space') {
    e.preventDefault();
    G.pressHeld = true;
    if (!e.repeat) tryTap();
  } else if (e.code === 'ArrowLeft') {
    e.preventDefault(); trySlide(-1);
  } else if (e.code === 'ArrowRight') {
    e.preventDefault(); trySlide(1);
  } else if (e.code === 'Enter' && G.state === 'menu') {
    startGame(selectedSong);
  }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') G.pressHeld = false;
});

let pointerStart = null, pointerSwiped = false;
canvasEl.addEventListener('pointerdown', (e) => {
  if (G.state !== 'playing') return;
  if (G.tutFrozen) {
    pointerStart = { x: e.clientX, y: e.clientY };
    pointerSwiped = false;
    G.pressHeld = true;
    try { canvasEl.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
    const t = G.tutorial;
    if (t && TUT_STEPS[t.step] && TUT_STEPS[t.step].type === 'hold') tutFrozenInput('hold');
    return;
  }
  if (G.paused) return;
  pointerStart = { x: e.clientX, y: e.clientY };
  pointerSwiped = false;
  G.pressHeld = true;
  try { canvasEl.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
});
canvasEl.addEventListener('pointermove', (e) => {
  if (!pointerStart || pointerSwiped) return;
  const dx = e.clientX - pointerStart.x;
  if (Math.abs(dx) > 34) {
    if (G.tutFrozen) { tutFrozenInput('slide', dx > 0 ? 1 : -1); pointerSwiped = true; return; }
    trySlide(dx > 0 ? 1 : -1);
    pointerSwiped = true;
  }
});
function pointerEnd() {
  if (pointerStart && !pointerSwiped) {
    if (G.tutFrozen) tutFrozenInput('tap');
    else tryTap();
  }
  pointerStart = null;
  G.pressHeld = false;
}
canvasEl.addEventListener('pointerup', pointerEnd);
canvasEl.addEventListener('pointercancel', pointerEnd);

function bindHoldButton(id, onDown) {
  const el = $(id);
  if (!el) return;
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    G.pressHeld = true;
    if (onDown) onDown();
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev =>
    el.addEventListener(ev, () => { G.pressHeld = false; }));
}
bindHoldButton('btn-tap', () => { if (G.tutFrozen) { tutFrozenInput('tap'); return; } tryTap(); });
bindHoldButton('btn-hold', () => { if (G.tutFrozen) tutFrozenInput('hold'); });
$('btn-left').addEventListener('click', () => { if (G.tutFrozen) { tutFrozenInput('slide', -1); return; } trySlide(-1); });
$('btn-right').addEventListener('click', () => { if (G.tutFrozen) { tutFrozenInput('slide', 1); return; } trySlide(1); });

/* ---------------- 按钮绑定 ---------------- */
function ensureAudio() {
  if (G.paused) return;
  AudioSys.init();
  if (AudioSys.master) AudioSys.master.gain.value = muted ? 0 : 0.55;
  if (G.state === 'home' || G.state === 'menu' || G.state === 'result') MenuBGM.start();
}
document.addEventListener('pointerdown', ensureAudio);

function toggleFullscreen() {
  const el = document.documentElement;
  if (!document.fullscreenElement && !document.webkitFullscreenElement) {
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  } else {
    if (document.exitFullscreen) document.exitFullscreen();
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
  }
}

function toggleMute() {
  muted = !muted;
  if (AudioSys.master) AudioSys.master.gain.value = muted ? 0 : 0.55;
  const btn = $('btn-mute');
  if (btn) btn.textContent = muted ? '✕' : '♪';
}

$('btn-mute').addEventListener('click', toggleMute);
$('btn-fullscreen').addEventListener('click', toggleFullscreen);
$('btn-start').addEventListener('click', () => { ensureAudio(); backToMenu(); });
$('btn-quick-play').addEventListener('click', () => { ensureAudio(); backToMenu(); });
$('nav-songs').addEventListener('click', () => { ensureAudio(); backToMenu(); });
$('nav-records').addEventListener('click', () => { ensureAudio(); renderHandbook(); $('home-handbook').classList.remove('hidden'); });
$('nav-practice').addEventListener('click', () => { ensureAudio(); startGame(5); });
$('nav-story').addEventListener('click', () => { ensureAudio(); playPrologue(); });
$('nav-about').addEventListener('click', () => $('home-members').classList.remove('hidden'));
$('nav-howto').addEventListener('click', () => $('home-howto').classList.remove('hidden'));
$('nav-more').addEventListener('click', () => $('home-howto').classList.remove('hidden'));
$('nav-music').addEventListener('click', toggleMute);
$('btn-close-story').addEventListener('click', () => $('home-story').classList.add('hidden'));
$('btn-story-replay').addEventListener('click', () => { $('home-story').classList.add('hidden'); playPrologue(); });
$('btn-close-howto').addEventListener('click', () => $('home-howto').classList.add('hidden'));
$('btn-close-members').addEventListener('click', () => $('home-members').classList.add('hidden'));
$('btn-close-handbook').addEventListener('click', () => $('home-handbook').classList.add('hidden'));
$('btn-close-xihu').addEventListener('click', closeXihuLock);
const xsm = $('btn-xihu-sync-manual');
if (xsm) xsm.addEventListener('click', onXihuSyncManualSubmit);
const xsi = $('xihu-sync-input');
if (xsi) xsi.addEventListener('keydown', (e) => { if (e.key === 'Enter') onXihuSyncManualSubmit(); });
$('btn-close-song-unlock').addEventListener('click', closeSongUnlock);
$('btn-song-unlock-cancel').addEventListener('click', closeSongUnlock);
$('btn-song-unlock-confirm').addEventListener('click', onSongUnlockConfirmClick);

$('btn-home2').addEventListener('click', goHome);
$('btn-detail-start').addEventListener('click', () => startGame(selectedSong));
$('btn-again').addEventListener('click', () => startGame(G.song ? G.song.id : 0));
$('btn-menu').addEventListener('click', backToMenu);

$('btn-pause').addEventListener('click', pauseGame);
$('btn-exit').addEventListener('click', quitDuringPlay);
$('btn-resume').addEventListener('click', resumeGame);
$('btn-restart').addEventListener('click', () => { const id = G.song ? G.song.id : 0; resumeGame(); startGame(id); });
$('btn-quit').addEventListener('click', quitFromPause);

document.querySelectorAll('.diff-stamp').forEach(p => {
  p.addEventListener('click', () => {
    if (!diffUnlocked((SONGS[selectedSong] || {}).id, p.dataset.diff)) {
      const note = $('detail-diff-note');
      if (note) {
        note.textContent = diffLockNote((SONGS[selectedSong] || {}).id, p.dataset.diff);
        note.classList.remove('hidden');
      }
      return;
    }
    selectedDiff = p.dataset.diff;
    refreshDiffUI();
  });
});

document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });

// 触屏设备标记（首次触摸 / 触控笔输入时补上）
window.addEventListener('touchstart', () => document.body.classList.add('is-touch'), { passive: true });
window.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch') document.body.classList.add('is-touch');
}, { passive: true });

/* ------------------------------------------------------------
   11. 主循环
   ------------------------------------------------------------ */
let lastTs = 0;
function loop(ts) {
  const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0);
  lastTs = ts;
  update(dt);
  render();
  requestAnimationFrame(loop);
}

/* ------------------------------------------------------------
   12. 启动
   ------------------------------------------------------------ */
function boot() {
  const touch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0 ||
    (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  if (touch) document.body.classList.add('is-touch');

  layoutWorld();
  computeGeo();
  initAmbient();
  setBackground(homeBgMode());
  migrateSongUnlocksV10(); // v10：祖父条款作废，一次性清理旧的冬至解锁（见迁移注释）
  renderSongList();
  selectSong(0, true);
  updateHud();
  // 首页扫码即玩：二维码编码公开部署地址（PUBLIC_GAME_URL，见文件顶部）；
  // 留空时回退当前页面地址。扫码失败兜底：二维码下方直接显示可点的链接文本，扫不出也能点进去
  const qp = $('qr-play-img');
  if (qp) qp.src = qrDataUrl(publicGameUrl());
  const ql = $('home-qr-link');
  if (ql) { const u = publicGameUrl(); ql.textContent = u; ql.href = u; }
  // iPhone 没有页内全屏：首次提示“添加到主屏幕”才是真全屏
  const isiOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;
  if (isiOS && !standalone) { const hh = $('homescreen-hint'); if (hh) hh.classList.remove('hidden'); }
  const hb2 = $('btn-close-hint');
  if (hb2) hb2.addEventListener('click', () => $('homescreen-hint').classList.add('hidden'));
  // 新手教程（v7）：首次进入弹欢迎卡（实战版入口）；首页“?”重开欢迎卡；遮罩版保留为“快速回顾”
  const tp = $('btn-tut-prev'), tn = $('btn-tut-next'), ts = $('btn-tut-skip'),
        td = $('btn-tut-done'), tc = $('btn-tut-close'), th = $('btn-help');
  if (tp) tp.addEventListener('click', () => showTutorial(tutStep - 1));
  if (tn) tn.addEventListener('click', () => showTutorial(tutStep + 1));
  if (ts) ts.addEventListener('click', closeTutorial);
  if (td) td.addEventListener('click', closeTutorial);
  if (tc) tc.addEventListener('click', closeTutorial);
  const openTutWelcome = () => { const w = $('tut-welcome'); if (w) w.classList.remove('hidden'); };
  if (th) th.addEventListener('click', openTutWelcome);
  const tw = $('tut-welcome');
  if (tw) {
    $('btn-tut-welcome-start').addEventListener('click', () => { tw.classList.add('hidden'); startTutorial(); });
    $('btn-tut-welcome-review').addEventListener('click', () => { tw.classList.add('hidden'); showTutorial(0); });
    $('btn-tut-welcome-skip').addEventListener('click', () => { tw.classList.add('hidden'); markTutorialSeen(); });
    $('btn-tut-welcome-close').addEventListener('click', () => { tw.classList.add('hidden'); markTutorialSeen(); });
  }
  if (!tutorialSeen()) setTimeout(openTutWelcome, 500);
  // 实战教程局内按钮
  const tls = $('btn-tut-live-skip');
  if (tls) tls.addEventListener('click', () => endTutorial({ skipped: true }));
  const tld = $('btn-tut-live-done');
  if (tld) tld.addEventListener('click', () => endTutorial({ completed: true }));
  const tds = $('btn-tut-done-start');
  if (tds) tds.addEventListener('click', () => { $('tut-done').classList.add('hidden'); startGame(0); });
  const tdm = $('btn-tut-done-menu');
  if (tdm) tdm.addEventListener('click', () => $('tut-done').classList.add('hidden'));
  const tdc = $('btn-tut-done-close');
  if (tdc) tdc.addEventListener('click', () => $('tut-done').classList.add('hidden'));
  // 故事前情提要：点画面推进，跳过按钮直达正文
  const pr = $('prologue');
  if (pr) pr.addEventListener('click', advancePrologue);
  const prs = $('btn-prologue-skip');
  if (prs) prs.addEventListener('click', (e) => { e.stopPropagation(); skipPrologue(); });
  // 西湖解锁仪式：点画面推进，跳过按钮直达锁终场
  const xc = $('xihu-ceremony');
  if (xc) xc.addEventListener('click', advanceXihuCeremony);
  const xcs = $('btn-xihu-cer-skip');
  if (xcs) xcs.addEventListener('click', (e) => { e.stopPropagation(); skipXihuCeremony(); });
  const xcp = $('btn-xihu-cer-play');
  if (xcp) xcp.addEventListener('click', (e) => { e.stopPropagation(); endXihuCeremony('play'); });
  const xcm = $('btn-xihu-cer-menu');
  if (xcm) xcm.addEventListener('click', (e) => { e.stopPropagation(); endXihuCeremony('menu'); });
  const xpv = $('btn-xihu-cer-preview');
  if (xpv) xpv.addEventListener('click', () => playXihuCeremony('preview', 'back'));
  const xrb0 = $('btn-detail-xihu-cer');
  if (xrb0) xrb0.addEventListener('click', () => playXihuCeremony('full', 'menu'));
  checkXihuUnlockParam();
  requestAnimationFrame(loop);
}

boot();
