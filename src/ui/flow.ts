/**
 * 流程与开关：开始 / 暂停 / 结束 / 切镜头 / 极坐标 / 轨迹线 / 雷达。
 * 所有会写 `state` 的地方都在这个文件里，别处只读。
 */
import { CAM_PRESETS, DIFFICULTIES, ROUND, TRAINING } from '../config';
import { cam, polar, projView } from '../core/camera';
import { COLORS } from '../core/color';
import { isTouch } from '../core/device';
import { flags } from '../input/flags';
import { look, lookHintOn, reqLock } from '../input/pointer';
import { boss, bullets, clock, freeze, opts, player, reset, session, setState, state, stats, training } from '../state';
import { clearField, selectPattern } from '../systems/training';
import { initTrainPanel, openTrainPick, refreshTrainPanel } from './training';
import { initOverlays, syncOverlays } from './overlays';
import type { DifficultyKey, EndReason, PatternName } from '../types';
import { el } from './dom';
import { updateHud } from './hud';
import { toast } from './toast';
import { allAchievements, unlockNoHit } from './achievements';

const TRAIL_NAMES = ['关闭', '拖尾（已飞过的路径）', '预测（接下来往哪飞）', '拖尾 + 预测'];
let trailBtnEl: HTMLElement | null = null;
let miniBtnEl: HTMLElement | null = null;
/** 从哪个状态进入暂停的（训练场暂停后要继续练，不是继续打 boss） */
let pausedFrom: 'playing' | 'training' | null = null;

/* ============ 难度 ============ */
/**
 * 切难度只做三件事：记编号、换弹速倍率、更新菜单上的按钮与说明。
 * 出招密度由 `systems/boss.ts` 读 DIFFICULTIES 决定，选招池由 patterns 读 session.difficulty。
 */
export function setDifficulty(k: DifficultyKey): void {
  session.difficulty = k;
  session.bulletSpeed = DIFFICULTIES[k].bulletSpeed;

  const btns = document.querySelectorAll<HTMLElement>('.lv-card');
  for (let i = 0; i < btns.length; i++) {
    btns[i].classList.toggle('on', Number(btns[i].dataset.diff) === k);
  }
  const note = document.getElementById('diffNote');
  if (note) note.textContent = DIFFICULTIES[k].note;
}

/* ============ 镜头 ============ */
export function enterOrbit(silent: boolean): void {
  if (!cam.orbit) {
    cam.orbit = true;
    cam.preset = 3;
    cam.pitch = CAM_PRESETS[3].pitch;
    cam.dist = CAM_PRESETS[3].dist;
  }
  if (!silent) {
    el.camName.textContent = CAM_PRESETS[3].name;
    toast('环绕视角 · Q/E 或横向拖动旋转', 1200, COLORS.player);
  }
}

export function cycleCam(): void {
  cam.preset = (cam.preset + 1) % CAM_PRESETS.length;
  const p = CAM_PRESETS[cam.preset];
  if (!(p as { orbit?: boolean }).orbit) cam.yaw = p.yaw;
  cam.pitch = p.pitch;
  cam.dist = p.dist;
  cam.orbit = !!(p as { orbit?: boolean }).orbit;
  el.camName.textContent = p.name;
  toast('镜头：' + p.name, 1100, COLORS.player);
}

/* ============ 极坐标 ============ */
function polarNote(): string {
  return isTouch
    ? '极坐标模式 · 上下 = 进出中心，左右 = 绕中心转'
    : '极坐标模式 · 上下 = 进出中心，左右 / 鼠标横移 = 绕中心转';
}

export function togglePolar(force?: boolean): void {
  polar.on = (typeof force === 'boolean') ? force : !polar.on;
  if (polar.on) {
    cam.orbit = false;
    const p = player;
    p.pr = Math.max(1.0, Math.hypot(p.x, p.z));
    p.pa = Math.atan2(p.z, p.x);
    p.pvr = 0;
    p.pw = 0;
    p.vx = 0;
    p.vz = 0;
    polar.pitch = Math.max(0.12, Math.min(0.98, cam.pitch));
    polar.dist = Math.max(9, Math.min(22, cam.dist));
    el.camName.textContent = '极坐标 · 径向朝前';
    toast(polarNote(), 2200, COLORS.player);
  } else {
    // 退出时把极坐标速度转成世界速度，避免瞬移感
    player.vx = Math.cos(player.pa) * player.pvr - Math.sin(player.pa) * player.pw * player.pr;
    player.vz = Math.sin(player.pa) * player.pvr + Math.cos(player.pa) * player.pw * player.pr;
    el.camName.textContent = CAM_PRESETS[cam.preset] ? CAM_PRESETS[cam.preset].name : '跟随视角';
    toast('自由视角模式', 1400, COLORS.player);
  }
  const b = document.getElementById('btnPolar');
  if (b) b.classList.toggle('on', polar.on);
  document.body.classList.toggle('polaron', polar.on);
}

/* ============ 读 Aid 开关 ============ */
export function cycleTrail(): void {
  opts.trailMode = (opts.trailMode + 1) % 4;
  for (let i = 0; i < bullets.length; i++) bullets[i].trail = null;
  if (trailBtnEl) trailBtnEl.classList.toggle('on', opts.trailMode > 0);
  toast('轨迹线：' + TRAIL_NAMES[opts.trailMode], 1000, COLORS.player);
  syncSettings();
}

export function toggleMini(): void {
  opts.mini = !opts.mini;
  const w = document.getElementById('miniWrap');
  if (w) w.classList.toggle('off', !opts.mini);
  if (miniBtnEl) miniBtnEl.classList.toggle('on', opts.mini);
  toast(opts.mini ? '俯视雷达：开' : '俯视雷达：关', 900, COLORS.player);
  syncSettings();
}

export function toggleShadows(): void {
  opts.shadows = !opts.shadows;
  toast(opts.shadows ? '地面投影：开' : '地面投影：关', 900, COLORS.player);
  syncSettings();
}

export function toggleGuides(): void {
  opts.guides = !opts.guides;
  toast(opts.guides ? '高度引导线：开' : '高度引导线：关', 900, COLORS.player);
  syncSettings();
}

export function toggleHitbox(): void {
  opts.hitbox = !opts.hitbox;
  toast(opts.hitbox ? '擦弹圈：显示' : '擦弹圈：隐藏', 900, COLORS.player);
  syncSettings();
}

/** 碰撞箱显示/隐藏（玩家的判定光棒本体） */
export function togglePlayerBox(): void {
  opts.playerBox = !opts.playerBox;
  toast(opts.playerBox ? '碰撞箱：显示' : '碰撞箱：隐藏', 900, COLORS.player);
  syncSettings();
}

/** 人物模型（方块人本体）显示开关。关掉只剩辉光 + 判定胶囊，视线最干净 */
export function togglePlayerModel(): void {
  opts.playerModel = !opts.playerModel;
  toast(opts.playerModel ? '人物模型：显示' : '人物模型：隐藏', 900, COLORS.player);
  syncSettings();
}

/** 训练场定格：冻结时间但保留相机控制，用来从各角度观察子弹的 3D 建模 */
export function toggleFreeze(): void {
  if (state !== 'training') return;
  freeze.on = !freeze.on;
  toast(freeze.on ? '定格：开 · 转视角看子弹' : '定格：关', 1000, COLORS.player);
  updateHud();
}

/* ============ 暂停卡 · 设置面板 ============ */
const TRAIL_LABELS = ['关', '拖尾', '预测', '拖尾+预测'];

function settingsState(key: string): { on: boolean; label: string } {
  switch (key) {
    case 'shadows': return { on: opts.shadows, label: opts.shadows ? '开' : '关' };
    case 'guides': return { on: opts.guides, label: opts.guides ? '开' : '关' };
    case 'hitbox': return { on: opts.hitbox, label: opts.hitbox ? '显示' : '隐藏' };
    case 'playerBox': return { on: opts.playerBox, label: opts.playerBox ? '显示' : '隐藏' };
    case 'playerModel': return { on: opts.playerModel, label: opts.playerModel ? '显示' : '隐藏' };
    case 'mini': return { on: opts.mini, label: opts.mini ? '开' : '关' };
    case 'trail': return { on: opts.trailMode > 0, label: TRAIL_LABELS[opts.trailMode] };
    default: return { on: false, label: '' };
  }
}

const SET_KEYS: Record<string, string> = {
  shadows: 'G', guides: 'H', hitbox: 'K', playerBox: 'B', playerModel: 'N', mini: 'M', trail: 'T'
};

/** 把设置面板每个按钮刷成当前开关状态（任何入口改了 opts 都要调它） */
export function syncSettings(): void {
  const grid = document.getElementById('setGrid');
  if (!grid) return;
  const btns = grid.querySelectorAll<HTMLElement>('.set-btn');
  for (let i = 0; i < btns.length; i++) {
    const key = btns[i].dataset.set || '';
    const st = settingsState(key);
    btns[i].classList.toggle('on', st.on);
    const em = btns[i].querySelector('em');
    if (em) em.textContent = SET_KEYS[key] + ' · ' + st.label;
  }
  // 透视程度滑条
  const slider = document.getElementById('projSlider') as HTMLInputElement | null;
  if (slider) slider.value = String(Math.round(projView.mix * 100));
  const pLabel = document.getElementById('projLabel');
  if (pLabel) pLabel.textContent = projLabelText(projView.mix);
}

/** 透视程度文案：0 → 1 从「透视」到「正交」 */
function projLabelText(mix: number): string {
  if (mix <= 0.01) return '透视';
  if (mix >= 0.99) return '正交';
  if (mix < 0.34) return '偏透视';
  if (mix < 0.67) return '伪正交';
  return '偏正交';
}

function initSettings(): void {
  const grid = document.getElementById('setGrid');
  if (!grid) return;
  const btns = grid.querySelectorAll<HTMLElement>('.set-btn');
  for (let i = 0; i < btns.length; i++) {
    btns[i].addEventListener('click', function () {
      switch (btns[i].dataset.set) {
        case 'shadows': toggleShadows(); break;
        case 'guides': toggleGuides(); break;
        case 'hitbox': toggleHitbox(); break;
        case 'playerBox': togglePlayerBox(); break;
        case 'playerModel': togglePlayerModel(); break;
        case 'mini': toggleMini(); break;
        case 'trail': cycleTrail(); break;
      }
    });
  }
  const slider = document.getElementById('projSlider') as HTMLInputElement | null;
  if (slider) {
    slider.addEventListener('input', function () {
      projView.mix = Number(slider.value) / 100;
      const pLabel = document.getElementById('projLabel');
      if (pLabel) pLabel.textContent = projLabelText(projView.mix);
    });
  }
  syncSettings();
}

/* ============ 流程 ============ */
function requestLandscape(): void {
  if (!isTouch) return;
  const root = document.documentElement;
  try {
    if (root.requestFullscreen) {
      const pr = root.requestFullscreen() as unknown as Promise<void> | undefined;
      if (pr && pr.catch) pr.catch(function () {});
    }
  } catch (err) {}
  try {
    const so = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    if (so && so.lock) {
      const pr2 = so.lock('landscape');
      if (pr2 && pr2.catch) pr2.catch(function () {});
    }
  } catch (err) {}
}

export function startGame(): void {
  requestLandscape();
  reset();
  pausedFrom = null;
  session.mode = 'game';
  setState('playing');
  el.startOverlay.classList.add('hidden');
  el.endOverlay.classList.add('hidden');
  document.body.classList.remove('training');
  flags.jump = false;
  flags.fire = false;
  // PC：开局顺手锁定鼠标，之后移动鼠标就是转视角（失败了也没关系，点画面即可）
  if (look.ok) reqLock();
  lookHintOn();
  syncOverlays();
  toast(isTouch ? '击破 boss 即可通关 · 限时 2 分钟' : '击破 boss 即可通关 · 移动鼠标转视角', 2000, COLORS.player);
}

/**
 * 训练场：不计时、双方都不掉血，选中的图案循环播放。
 *
 * 刻意不锁指针 —— 面板要能点。转视角用右键拖动 / Q E。
 */
export function startTraining(pattern?: PatternName): void {
  requestLandscape();
  reset();
  pausedFrom = null;
  session.mode = 'training';
  setState('training');
  el.startOverlay.classList.add('hidden');
  el.endOverlay.classList.add('hidden');
  flags.jump = false;
  flags.fire = false;
  initTrainPanel();
  document.body.classList.add('training');
  selectPattern(pattern || (training.pattern as PatternName) || (TRAINING.first as PatternName));
  refreshTrainPanel();
  // 训练场也锁指针：鼠标转视角要跟正常对局一致（早先不锁，导致鼠标划到画外没反应）
  if (look.ok) reqLock();
  lookHintOn();
  syncOverlays();
  toast('训练场 · 换个格子就换一招', 1800, COLORS.player);
}

/**
 * 暂停 / 继续。
 *
 * 暂停时必须把「从哪儿暂停的」记住 —— 训练场暂停后要继续练，不是继续打 boss。
 * 暂停时顺手放掉指针锁，否则鼠标被吃住点不到卡片。
 */
export function pauseGame(): void {
  if (state !== 'playing' && state !== 'training') return;
  pausedFrom = state;
  setState('paused');
  if (document.pointerLockElement) document.exitPointerLock();
  openTrainPick();          // 训练场：顺便把选招区刷成最新
  syncSettings();           // 设置面板：按钮状态永远反映当前 opts
  lookHintOn();
  syncOverlays();
}

export function resumeGame(): void {
  if (state !== 'paused') return;
  setState(pausedFrom || 'playing');
  pausedFrom = null;
  el.toast.classList.remove('on');
  relock();
  lookHintOn();
  syncOverlays();
}

/** 回到对局 / 训练时把指针锁回去，否则鼠标会划到画面外 */
export function relock(): void {
  if (!look.ok) return;
  if (state === 'playing' || state === 'training') reqLock();
}

export function togglePause(): void {
  if (state === 'paused') resumeGame();
  else pauseGame();
}

/** 暂停卡上的「重开」：从训练场暂停就重开训练场 */
export function restartLast(): void {
  if (session.mode === 'training') startTraining(training.pattern as PatternName);
  else startGame();
}

export function backToMenu(): void {
  renderAchievements();
  reset();
  clearField();
  pausedFrom = null;
  setState('menu');
  if (document.pointerLockElement) document.exitPointerLock();
  lookHintOn();
  document.body.classList.remove('training');
  el.endOverlay.classList.add('hidden');
  el.startOverlay.classList.remove('hidden');
  syncOverlays();
}

export function endGame(win: boolean, reason?: EndReason): void {
  if (state === 'over') return;
  pausedFrom = null;
  setState('over');
  document.body.classList.remove('training');
  if (document.pointerLockElement) document.exitPointerLock();
  lookHintOn();

  const used = ROUND.time - Math.max(0, clock.timeLeft);
  const diffName = DIFFICULTIES[session.difficulty].name;
  const noHit = stats.hits === 0;

  // 结算三块大数字：关卡难度 · 受击次数 · 用时（受击是核心指标）
  el.endDiff.textContent = 'LV.' + session.difficulty;
  el.endDiffName.textContent = diffName;
  el.endHits.textContent = String(stats.hits);
  el.endHits.className = noHit ? 'zero' : '';
  el.endTime.textContent = used.toFixed(1);

  if (win) {
    el.endKicker.textContent = 'BOSS DEFEATED';
    el.endTitle.textContent = noHit ? '无伤击破' : '击破';
    el.endTitle.style.color = '#8ff0ff';
    el.endLead.textContent = '在 ' + diffName + ' 用时 ' + used.toFixed(1) + ' 秒击破 boss，受击 ' + stats.hits + ' 次。' +
      '如果是第一次玩，请回想：每次被击中时，你是否能说出“我为什么被打中”？';
  } else if (reason === 'time') {
    el.endKicker.textContent = 'TIMEOUT';
    el.endTitle.textContent = '超时';
    el.endTitle.style.color = '#ffb46a';
    el.endLead.textContent = diffName + ' · 2 分钟结束，boss 剩余 ' + Math.ceil(boss.hp) + ' 点血量。' +
      '超时说明输出窗口不够 —— 但也可能是「不敢靠近输出」造成的，看看受击类型分布。';
  } else {
    el.endKicker.textContent = 'DEFEATED';
    el.endTitle.textContent = '被击坠';
    el.endTitle.style.color = '#ff8aa8';
    el.endLead.textContent = diffName + ' · 坚持了 ' + used.toFixed(1) + ' 秒，boss 剩余 ' + Math.ceil(boss.hp) + ' 点血量。' +
      '重点看下面的受击分布：哪一类最多，就说明哪一类最“读不出来”。';
  }

  // 无伤成就：只有通关且 0 受击才算。新解锁才弹提示。
  if (win && noHit && unlockNoHit(session.difficulty)) {
    el.endBadge.className = 'end-badge unlock';
    el.endBadge.innerHTML = '<b>成就解锁</b><span>无伤 ' + diffName + '</span>';
  } else if (win && noHit) {
    el.endBadge.className = 'end-badge';
    el.endBadge.innerHTML = '<b>无伤</b><span>' + diffName + ' · 成就已达成</span>';
  } else {
    el.endBadge.className = 'end-badge hidden';
  }

  // 受击分布：低空 / 中空 / 高空 / 落点雨。受击总数已在上面的大数字里，这里不重复
  const dist: Array<[string, number, string]> = [
    ['低空弹', stats.low, COLORS.low],
    ['中空弹', stats.mid, COLORS.mid],
    ['高空弹', stats.high, COLORS.high],
    ['落点雨', stats.rain, COLORS.rain]
  ];
  let maxV = 1;
  for (let i = 0; i < dist.length; i++) if (dist[i][1] > maxV) maxV = dist[i][1];
  let bars = '';
  for (let i = 0; i < dist.length; i++) {
    const n = dist[i][1];
    const w = n <= 0 ? 0 : Math.max(5, Math.round(n / maxV * 100));
    bars += '<div class="sb"><span class="sb-k">' + dist[i][0] + '</span>' +
      '<div class="sb-t"><i style="width:' + w + '%;background:rgb(' + dist[i][2] + ')"></i></div>' +
      '<b class="sb-v" style="color:rgb(' + dist[i][2] + ')">' + n + '</b></div>';
  }

  // 擦弹：擦头 / 擦身 / 擦脚三联。受击少 + 擦弹多 = 又稳又敢贴
  el.endStats.innerHTML =
    '<div class="stat-graze">' +
      '<b class="sg-n">' + stats.graze + '</b><span class="sg-t">GRAZE</span>' +
      '<div class="sg-parts">' +
        '<span><i>擦头</i><b>' + stats.grazeHead + '</b></span>' +
        '<span><i>擦身</i><b>' + stats.grazeBody + '</b></span>' +
        '<span><i>擦脚</i><b>' + stats.grazeFoot + '</b></span>' +
      '</div>' +
    '</div>' +
    '<div class="stat-bars">' + bars + '</div>';

  el.endOverlay.classList.remove('hidden');
  syncOverlays();
}

/* ============ 初始化 ============ */
export function initUi(): void {
  trailBtnEl = document.getElementById('btnTrail');
  miniBtnEl = document.getElementById('btnMini');
  const polarBtnEl = document.getElementById('btnPolar');

  el.camName.textContent = CAM_PRESETS[0].name;

  if (polarBtnEl) {
    polarBtnEl.addEventListener('pointerdown', function (e) { e.preventDefault(); togglePolar(); });
  }
  if (trailBtnEl) {
    trailBtnEl.classList.toggle('on', opts.trailMode > 0);
    trailBtnEl.addEventListener('pointerdown', function (e) { e.preventDefault(); cycleTrail(); });
  }
  if (miniBtnEl) {
    miniBtnEl.addEventListener('pointerdown', function (e) { e.preventDefault(); toggleMini(); });
  }

  document.getElementById('btnStart')!.addEventListener('click', startGame);
  document.getElementById('btnTrain')!.addEventListener('click', function () { startTraining(); });
  document.getElementById('btnRestart')!.addEventListener('click', startGame);
  document.getElementById('btnMenu')!.addEventListener('click', backToMenu);

  const diffBtns = document.querySelectorAll<HTMLElement>('.lv-card');
  for (let i = 0; i < diffBtns.length; i++) {
    diffBtns[i].addEventListener('click', function () {
      const d = Number(diffBtns[i].dataset.diff);
      if (d === 1 || d === 2 || d === 3 || d === 4) setDifficulty(d);
    });
  }
  setDifficulty(session.difficulty);
  renderAchievements();

  initSettings();
  initOverlays();
}

/** 主界面底部成就条：解锁 = 亮，未解锁 = 灰。每次回主界面都会刷新。 */
export function renderAchievements(): void {
  const bar = document.getElementById('achBar');
  if (!bar) return;
  const list = allAchievements();
  let html = '';
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    const on = a.at > 0;
    html += '<span class="ach' + (on ? ' on' : '') + '">' +
      '<span class="dot"></span>' + a.title +
      (on ? '<em>已达成</em>' : '<em>未达成</em>') + '</span>';
  }
  bar.innerHTML = html;
}
