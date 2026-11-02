/**
 * 龙骨炮炮口：纯视觉实体。
 *
 * 只负责两件事：生命倒计时、张嘴程度。真正的伤害在 patterns/shots.ts 里生成的弹束上，
 * 炮口本身不参与判定 —— 但它决定了玩家"看不看得懂这束弹从哪来"。
 */
import { blasters } from '../state';

export function updateBlasters(dt: number): void {
  for (let i = blasters.length - 1; i >= 0; i--) {
    const b = blasters[i];
    b.t -= dt;
    // 最后 0.3s 张嘴；其余时间闭嘴蓄力
    const target = b.t <= 0.3 ? 1 : 0;
    b.open += (target - b.open) * Math.min(1, dt * 16);
    if (b.t <= 0) blasters.splice(i, 1);
  }
}
