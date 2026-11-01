/** boss 的几何：卫星炮位置。发射、绘制、雷达都要用，单独拆出来避免循环依赖。 */
import { boss } from '../state';
import type { Vec3 } from '../types';

export function satPos(i: number): Vec3 {
  const a = boss.spin * 1.55 + boss.sats[i];
  return {
    x: boss.x + Math.cos(a) * 2.75,
    y: boss.y + Math.sin(boss.spin * 2.2 + i * 2.1) * 0.85,
    z: boss.z + Math.sin(a) * 2.75
  };
}
