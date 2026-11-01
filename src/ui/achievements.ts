/**
 * 成就系统：localStorage 持久化，本机浏览器内有效。
 *
 * 目前只有一族成就 —— 「无伤通过 Level N」，一个关卡一个。
 * 解锁时机在 ui/flow.ts 的 endGame()：通关且 stats.hits === 0 时记账。
 */
import type { DifficultyKey } from '../types';

const STORE_KEY = 'danmaku.achievements.v1';

/** 每个关卡的无伤成就 */
export interface Achievement {
  id: string;
  /** 显示名，例如「无伤 Level 1」 */
  title: string;
  /** 达成条件说明 */
  desc: string;
  /** 已解锁时间戳（ms），未解锁为 0 */
  at: number;
}

/** 成就定义（静态）+ 本机解锁记录（动态）合在一张表里读写 */
function defs(): Achievement[] {
  return [
    { id: 'nofx-1', title: '无伤 Level 1', desc: '在 Level 1 击破 boss，全程不被击中', at: 0 },
    { id: 'nofx-2', title: '无伤 Level 2', desc: '在 Level 2 击破 boss，全程不被击中', at: 0 },
    { id: 'nofx-3', title: '无伤 Level 3', desc: '在 Level 3 击破 boss，全程不被击中', at: 0 }
  ];
}

function load(): Record<string, number> {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return {};
    const j = JSON.parse(raw);
    return j && typeof j === 'object' ? j : {};
  } catch (e) {
    return {};
  }
}

function save(map: Record<string, number>): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(map));
  } catch (e) {
    // 隐私模式 / 空间满：静默失败，成就只在本次会话有效
  }
}

/** 全部成就（含未解锁的灰态），供主界面成就条渲染 */
export function allAchievements(): Achievement[] {
  const map = load();
  return defs().map((d) => ({ ...d, at: map[d.id] || 0 }));
}

export function isUnlocked(id: string): boolean {
  return !!load()[id];
}

/**
 * 解锁某个关卡的无伤成就。
 * 返回 true = 本次是**新**解锁（结算页要弹提示）；已解锁过返回 false。
 */
export function unlockNoHit(diff: DifficultyKey): boolean {
  const id = 'nofx-' + diff;
  const map = load();
  if (map[id]) return false;
  map[id] = Date.now();
  save(map);
  return true;
}

/** 清空（调试用） */
export function resetAchievements(): void {
  save({});
}
