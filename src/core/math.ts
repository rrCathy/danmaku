export const TAU = Math.PI * 2;

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const rand = (a: number, b: number): number => a + Math.random() * (b - a);

/** 点到线段的最短距离。玩家判定用的是竖直胶囊，这一步只算平面 + 高度两个分量。 */
export function segPointDist(
  px: number, py: number, pz: number,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number
): number {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const ab2 = abx * abx + aby * aby + abz * abz;
  let t = ab2 > 1e-8 ? (apx * abx + apy * aby + apz * abz) / ab2 : 0;
  t = clamp(t, 0, 1);
  const cx = ax + abx * t, cy = ay + aby * t, cz = az + abz * t;
  return Math.hypot(px - cx, py - cy, pz - cz);
}
