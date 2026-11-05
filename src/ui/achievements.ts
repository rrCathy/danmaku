/**
 * 成就系统：localStorage 持久化，本机浏览器内有效。
 *
 * 每个关卡一枚奖牌，按「该关历史最低受击数」定级：
 *   0 伤 = 金 / 1 伤 = 银 / 2 伤 = 铜 / 3 伤及以上 = 无牌。
 * 只有击破 boss（win=true，见 ui/flow.ts 的 endGame）才记账；
 * 重打更好会升级，差成绩不覆盖已有奖牌。
 *
 * 旧存档（v1 的 nofx-N 无伤成就）读取时折算为对应关卡金牌，写入时统一新格式。
 */
import type { DifficultyKey } from '../types';

/** 沿用旧 key —— 换 key 就读不到 v1 存档，无法做金牌迁移 */
const STORE_KEY = 'danmaku.achievements.v1';
const SAVE_VERSION = 2;

export type MedalRank = 'gold' | 'silver' | 'bronze';

export const MEDAL_LABEL: Record<MedalRank, string> = {
  gold: '金牌', silver: '银牌', bronze: '铜牌'
};

/** 受击数 → 牌级；3 及以上返回 null（无牌）。hits 是本局 stats.hits，不会为负 */
export function rankForHits(hits: number): MedalRank | null {
  if (hits === 0) return 'gold';
  if (hits === 1) return 'silver';
  if (hits === 2) return 'bronze';
  return null;
}

export function labelForHits(hits: number): string {
  const r = rankForHits(hits);
  return r ? MEDAL_LABEL[r] : '无牌';
}

export interface Achievement {
  id: string;
  /** 显示名，例如「Level 1 · 金牌」 */
  title: string;
  /** 达成条件 / 当前成绩说明 */
  desc: string;
  /** 历史最低受击数；-1 = 尚未获得奖牌 */
  best: number;
  rank: MedalRank | null;
}

/** 一次结算的记账结果 */
export interface AwardResult {
  /** 本局牌级（与历史成绩无关；null = 本局无牌、不记账） */
  rank: MedalRank | null;
  /** 本次是否首次拿牌或从低级升上来（结算页据此弹「成就解锁」） */
  improved: boolean;
  /** 记账前的历史最低受击数，-1 = 之前无牌 */
  previous: number;
}

/** v2 存档：best[难度] = 历史最低受击数（只可能是 0/1/2） */
interface SaveV2 {
  v: 2;
  best: Record<string, number>;
}

function sanitize(obj: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!obj || typeof obj !== 'object') return out;
  for (const [k, n] of Object.entries(obj as Record<string, unknown>)) {
    if (/^[1-4]$/.test(k) && typeof n === 'number' && n >= 0 && n <= 2) out[k] = n;
  }
  return out;
}

function save(best: Record<string, number>): void {
  try {
    const data: SaveV2 = { v: SAVE_VERSION, best };
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
  } catch (e) {
    // 隐私模式 / 空间满：静默失败，成就只在本次会话有效
  }
}

/**
 * 读存档。旧格式是 { 'nofx-1': 时间戳, ... }（v1 无伤成就），
 * 折算成 { 1: 0, ... } 即对应关卡金牌，并立即落地 v2 格式，只迁移一次。
 */
function load(): Record<string, number> {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return {};
    const j: unknown = JSON.parse(raw);
    if (!j || typeof j !== 'object') return {};
    const rec = j as Record<string, unknown>;
    if (rec.v === SAVE_VERSION) return sanitize(rec.best);

    const migrated: Record<string, number> = {};
    for (const [k, at] of Object.entries(rec)) {
      const m = /^nofx-([1-4])$/.exec(k);
      if (m && at) migrated[m[1]] = 0;   // 旧「无伤」= 0 伤 = 金牌
    }
    if (Object.keys(migrated).length) save(migrated);
    return migrated;
  } catch (e) {
    return {};
  }
}

/** 全部成就（含未获牌的灰态），供主界面成就条渲染 */
export function allAchievements(): Achievement[] {
  const best = load();
  return ([1, 2, 3, 4] as DifficultyKey[]).map((d) => {
    const h = best[String(d)] ?? -1;
    const rank = rankForHits(h);
    return {
      id: 'medal-' + d,
      title: 'Level ' + d + ' · ' + (rank ? MEDAL_LABEL[rank] : '未获得奖牌'),
      desc: rank ? '历史最好 · 受击 ' + h + ' 次' : '击破 boss 且受击不超过 2 次',
      best: h,
      rank
    };
  });
}

/**
 * 结算记账：只有 0/1/2 伤才落库，取历史最低；返回本局牌级与是否升级。
 * 调用方（endGame）负责保证只有 win=true 才调这里。
 */
export function awardMedal(diff: DifficultyKey, hits: number): AwardResult {
  const rank = rankForHits(hits);
  if (!rank) return { rank: null, improved: false, previous: -1 };

  const key = String(diff);
  const best = load();
  const previous = best[key] ?? -1;
  const improved = previous < 0 || hits < previous;
  if (improved) {
    best[key] = hits;
    save(best);
  }
  return { rank, improved, previous };
}

/** 清空（调试用） */
export function resetAchievements(): void {
  save({});
}
