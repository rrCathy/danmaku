/** 一帧的总调度。顺序敏感：先动玩家和 boss，再跑延迟回调，最后处理所有危险物。 */
import { ROUND } from '../config';
import { cam, polar } from '../core/camera';
import { lerp } from '../core/math';
import { boss, clock, player, state, updateTimers } from '../state';
import { updatePlayer } from './player';
import { updateBoss } from './boss';
import { updateBullets, updateShots } from './bullets';
import { updateLasers, updateWalls } from './hazards';
import { updateGhosts, updateParticles, updateRings } from './effects';
import { updateBlasters } from './blasters';
import { updateTraining } from './training';
import { updateHud } from '../ui/hud';
import { toast } from '../ui/toast';
import { endGame } from '../ui/flow';

export function updateGame(dt: number): void {
  const trainingMode = state === 'training';

  clock.elapsed += dt;

  updatePlayer(dt);
  updateBoss(dt);
  updateTimers(dt);
  updateBlasters(dt);
  updateBullets(dt);
  updateLasers(dt);
  updateWalls(dt);
  updateShots(dt);
  updateRings(dt);
  updateParticles(dt);
  updateGhosts(dt);

  // 训练场：由面板驱动出招节奏，不走 boss 的 cd
  if (trainingMode) updateTraining(dt);

  // 自由视角绕玩家转（标准第三人称），只留一点权重给 boss 让它保持在画面里。
  // 玩家静止时冻结目标点：boss 永远在公转（boss.ts 持续推进 ang），若仍每帧混入
  // 13% boss 坐标，目标点会被拖着绕场画圈 —— 站着不动视角也在轻微游移（用户报告）。
  // 阈值 0.05 m/s：低于它的位移每秒不到 5cm，肉眼不可见，视为「站定」。
  const moving = player.dashT > 0
    || Math.hypot(player.vx, player.vz) > 0.05
    || Math.abs(player.vy) > 0.05;
  if (moving) {
    const tx = polar.on ? player.x : player.x * 0.87 + boss.x * 0.13;
    const tz = polar.on ? player.z : player.z * 0.87 + boss.z * 0.13;
    cam.target.x = lerp(cam.target.x, tx, Math.min(1, dt * 3.2));
    cam.target.z = lerp(cam.target.z, tz, Math.min(1, dt * 3.2));
    cam.target.y = lerp(cam.target.y, 2.1 + player.y * 0.25, Math.min(1, dt * 3));
  }

  player.inv = Math.max(0, player.inv - dt);
  clock.dmgFlash = Math.max(0, clock.dmgFlash - dt * 1.9);

  // 计时 / 狂暴 / 超时只在对局里跑
  if (!trainingMode) {
    clock.timeLeft -= dt;
    if (clock.timeLeft <= ROUND.rageAt && !boss.enraged) {
      boss.enraged = true;
      toast('剩余 30 秒 · BOSS 狂暴', 1800, '255,80,80');
    }
    if (clock.timeLeft <= 0) {
      clock.timeLeft = 0;
      endGame(false, 'time');
    }
  }

  updateHud();
}
