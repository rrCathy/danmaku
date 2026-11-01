/** 粒子与残影。纯视觉，不参与任何判定。 */
import { TAU, rand } from '../core/math';
import { ghosts, particles, rings } from '../state';

export function spawnSpark(x: number, y: number, z: number, rgb: string, power?: number): void {
  const a = Math.random() * TAU;
  const b = Math.random() * Math.PI - Math.PI / 2;
  const sp = rand(1.5, 5) * (power || 1);
  particles.push({
    x, y, z,
    vx: Math.cos(a) * Math.cos(b) * sp,
    vy: Math.sin(b) * sp + 1.5,
    vz: Math.sin(a) * Math.cos(b) * sp,
    life: rand(0.25, 0.7), max: 0.7,
    rgb, size: rand(0.05, 0.16) * (power || 1)
  });
}

export function updateParticles(dt: number): void {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.vy -= 9 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    if (p.y < 0.03) { p.y = 0.03; p.vy *= -0.35; p.vx *= 0.7; p.vz *= 0.7; }
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

export function updateGhosts(dt: number): void {
  for (let i = ghosts.length - 1; i >= 0; i--) {
    ghosts[i].life -= dt;
    if (ghosts[i].life <= 0) ghosts.splice(i, 1);
  }
}

export function updateRings(dt: number): void {
  for (let i = rings.length - 1; i >= 0; i--) {
    rings[i].t -= dt;
    if (rings[i].t <= -0.15) rings.splice(i, 1);
  }
}
