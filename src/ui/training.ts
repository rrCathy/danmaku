/**
 * 训练场的「选招式」区 —— 挂在暂停卡里，**不是常驻面板**。
 *
 * 早先版本把它常驻在左下角，结果压住虚拟摇杆、挡手势，而且练的时候一直占着屏幕。
 * 现在的规矩：练的时候画面干净（和正常对局一样），要换招就按 P 暂停。
 *
 * 点一格 = 立刻开练（选完自动继续）；调弹速 = 留在原地，方便先设速度再选招。
 */
import { TRAINING } from '../config';
import { ALL_PATTERNS } from '../patterns';
import { PATTERN_LABELS } from '../patterns/sequence';
import { VERB_INFO, classifyLine, classifyShort, primaryVerb, type DodgeVerb } from '../patterns/taxonomy';
import { logs, session, stats, training } from '../state';
import { replay, selectPattern, setGap, setSpeed } from '../systems/training';
import type { PatternName } from '../types';
import { renderDiag } from './diag';
import { resumeGame } from './flow';

const pick = document.getElementById('trainPick');
let built = false;
/** 选招面板当前的主解法过滤器（null = 全部） */
let verbFilter: DodgeVerb | null = null;

/** 换招时把「受击 N 次」清零，这个数字才是"这一招我挨了几下" */
function resetTrainingStats(): void {
  stats.hits = 0;
  stats.low = 0;
  stats.mid = 0;
  stats.high = 0;
  stats.rain = 0;
  stats.grid = 0;
  stats.graze = 0;
  stats.grazeHead = 0;
  stats.grazeFoot = 0;
  stats.grazeBody = 0;
  logs.length = 0;
  renderDiag();
}

export function initTrainPanel(): void {
  if (!pick || built) return;
  built = true;

  const grid = document.getElementById('tpGrid')!;
  for (let i = 0; i < ALL_PATTERNS.length; i++) {
    const name = ALL_PATTERNS[i];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tp-pat';
    b.dataset.pat = name;
    b.textContent = PATTERN_LABELS[name].name;
    b.title = PATTERN_LABELS[name].hint + '\n' + classifyLine(name);
    b.addEventListener('click', function () {
      resetTrainingStats();
      selectPattern(name);
      refreshTrainPanel();
      resumeGame();           // 选完就开练，不用再点一次「继续」
    });
    grid.appendChild(b);
  }

  const filters = document.getElementById('tpFilters');
  if (filters && !filters.childElementCount) {
    const chips: Array<{ v: DodgeVerb | null; label: string; tip: string }> = [
      { v: null, label: '全部', tip: '显示全部招式' }
    ];
    for (const v of Object.keys(VERB_INFO) as DodgeVerb[]) {
      chips.push({ v, label: VERB_INFO[v].name, tip: '主解法「' + VERB_INFO[v].name + '」· ' + VERB_INFO[v].tip });
    }
    for (const c of chips) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tp-chip';
      b.dataset.verb = c.v || '';
      b.textContent = c.label;
      b.title = c.tip;
      b.addEventListener('click', function () {
        verbFilter = c.v;
        refreshTrainPanel();
      });
      filters.appendChild(b);
    }
  }

  const speedBox = document.getElementById('tpSpeed')!;
  for (let i = 0; i < TRAINING.speeds.length; i++) {
    const v = TRAINING.speeds[i];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tp-sp';
    b.dataset.sp = String(v);
    b.textContent = v + '×';
    b.title = '弹速 ' + v + ' 倍';
    b.addEventListener('click', function () {
      setSpeed(v);
      refreshTrainPanel();    // 调速度不自动继续，留在暂停卡里
    });
    speedBox.appendChild(b);
  }

  const gapBox = document.getElementById('tpGap');
  if (gapBox && !gapBox.childElementCount) {
    for (const v of TRAINING.gaps) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tp-sp';
      b.dataset.gap = String(v);
      b.textContent = v + 's';
      b.title = '上一招放完后，间隔 ' + v + ' 秒再放下一招';
      b.addEventListener('click', function () {
        setGap(v);
        refreshTrainPanel();  // 调间隔不自动继续，留在暂停卡里
      });
      gapBox.appendChild(b);
    }
  }

  const replayBtn = document.getElementById('tpReplay');
  if (replayBtn) {
    replayBtn.addEventListener('click', function () {
      replay();
      resumeGame();
    });
  }

  refreshTrainPanel();
}

export function refreshTrainPanel(): void {
  if (!pick || !built) return;

  const pats = pick.querySelectorAll<HTMLElement>('.tp-pat');
  for (let i = 0; i < pats.length; i++) {
    const name = pats[i].dataset.pat as PatternName;
    pats[i].classList.toggle('on', name === training.pattern);
    pats[i].classList.toggle('hide', verbFilter !== null && primaryVerb(name) !== verbFilter);
  }

  const chips = pick.querySelectorAll<HTMLElement>('.tp-chip');
  for (let i = 0; i < chips.length; i++) {
    chips[i].classList.toggle('on', (chips[i].dataset.verb || '') === (verbFilter || ''));
  }

  const sps = pick.querySelectorAll<HTMLElement>('.tp-sp');
  for (let i = 0; i < sps.length; i++) {
    const isGap = sps[i].dataset.gap !== undefined;
    const on = isGap
      ? Number(sps[i].dataset.gap) === training.gap
      : Number(sps[i].dataset.sp) === training.speed;
    sps[i].classList.toggle('on', on);
  }

  const stat = document.getElementById('tpStat');
  if (stat) {
    const label = PATTERN_LABELS[training.pattern as PatternName];
    const sp = training.speed * session.bulletSpeed;
    stat.textContent = label.name + ' · ' + classifyShort(training.pattern as PatternName) +
      ' · 受击 ' + stats.hits + ' 次 · 弹速 ' +
      (Math.round(sp * 100) / 100).toString() + '×';
  }
}

/** 训练场里按 P 暂停时调一次，保证选中态和计数是最新的 */
export function openTrainPick(): void {
  if (session.mode !== 'training') return;
  initTrainPanel();
  refreshTrainPanel();
}
