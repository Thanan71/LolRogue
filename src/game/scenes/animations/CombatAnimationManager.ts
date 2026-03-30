/**
 * CombatAnimationManager — all visual combat effects using Phaser tweens.
 *
 * Animations: projectile, impact burst, heal (green particles),
 * shield (pulsing barrier), death (fade + particles).
 */

import Phaser from 'phaser';

const ICON_SIZE = 48;

const COL = {
  heal: 0x22c55e,
  healText: '#22c55e',
  shield: 0x60a5fa,
  shieldText: '#60a5fa',
  projectile: 0xffd700,
  projectileCrit: 0xff6b6b,
};

export interface VisEntry {
  container: Phaser.GameObjects.Container;
  side: 'player' | 'enemy';
}

export class CombatAnimationManager {
  constructor(private scene: Phaser.Scene) {}

  pos(vis: VisEntry): { x: number; y: number } {
    return { x: vis.container.x, y: vis.container.y };
  }

  /** Golden/red projectile from source → target */
  playProjectile(
    source: { x: number; y: number },
    target: { x: number; y: number },
    isCrit: boolean,
    cb?: () => void,
  ): void {
    const col = isCrit ? COL.projectileCrit : COL.projectile;
    const r = isCrit ? 8 : 5;
    const proj = this.scene.add.graphics();
    proj.fillStyle(col, 1).fillCircle(0, 0, r).setPosition(source.x, source.y);
    const glow = this.scene.add.graphics();
    glow.fillStyle(col, 0.3).fillCircle(0, 0, r * 2).setPosition(source.x, source.y);
    this.scene.tweens.add({
      targets: [proj, glow], x: target.x, y: target.y,
      duration: 250, ease: 'Quad.easeIn',
      onComplete: () => { proj.destroy(); glow.destroy(); cb?.(); },
    });
  }

  /** Expanding ring + 6 scattered particles */
  playImpact(pos: { x: number; y: number }, color = 0xffaa00): void {
    const ring = this.scene.add.graphics();
    ring.lineStyle(3, color, 1).strokeCircle(0, 0, 5).setPosition(pos.x, pos.y);
    this.scene.tweens.add({
      targets: ring, scaleX: 3, scaleY: 3, alpha: 0,
      duration: 180, ease: 'Quad.easeOut', onComplete: () => ring.destroy(),
    });
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI * 2 * i) / 6 + Math.random() * 0.3;
      const d = 15 + Math.random() * 15;
      const p = this.scene.add.graphics();
      p.fillStyle(color, 1).fillCircle(0, 0, 2 + Math.random() * 2).setPosition(pos.x, pos.y);
      this.scene.tweens.add({
        targets: p, x: pos.x + Math.cos(a) * d, y: pos.y + Math.sin(a) * d,
        alpha: 0, scaleX: 0.3, scaleY: 0.3, duration: 280, ease: 'Quad.easeOut',
        onComplete: () => p.destroy(),
      });
    }
  }

  /** Green cross particles float up + glow + "+X" text */
  playHeal(pos: { x: number; y: number }, amount: number, cb?: () => void): void {
    for (let i = 0; i < 10; i++) {
      const delay = i * 40;
      const sx = pos.x + (Math.random() - 0.5) * ICON_SIZE;
      const sy = pos.y + ICON_SIZE / 2;
      const p = this.scene.add.graphics();
      p.fillStyle(COL.heal, 0.8).fillRect(-2, -5, 4, 10).fillRect(-5, -2, 10, 4);
      p.setPosition(sx, sy).setAlpha(0);
      this.scene.time.delayedCall(delay, () => {
        this.scene.tweens.add({
          targets: p, y: sy - 30 - Math.random() * 20, x: sx + (Math.random() - 0.5) * 20,
          alpha: 1, scaleX: 0.8, scaleY: 0.8, duration: 160, ease: 'Quad.easeOut',
          onComplete: () => {
            this.scene.tweens.add({
              targets: p, alpha: 0, y: p.y - 15, duration: 240, ease: 'Quad.easeIn',
              onComplete: () => p.destroy(),
            });
          },
        });
      });
    }
    const flash = this.scene.add.graphics();
    flash.fillStyle(COL.heal, 0.25).fillCircle(0, 0, ICON_SIZE / 2 + 5).setPosition(pos.x, pos.y);
    this.scene.tweens.add({
      targets: flash, alpha: 0, scaleX: 1.5, scaleY: 1.5,
      duration: 600, ease: 'Quad.easeOut', onComplete: () => flash.destroy(),
    });
    const ht = this.scene.add.text(pos.x + 20, pos.y - 10, '+' + Math.round(amount), {
      fontSize: '14px', color: COL.healText, fontStyle: 'bold',
    }).setOrigin(0.5);
    this.scene.tweens.add({
      targets: ht, y: ht.y - 35, alpha: 0, duration: 700, ease: 'Power2',
      onComplete: () => { ht.destroy(); cb?.(); },
    });
  }

  /** Blue pulsing barrier circle + 8 sparkles */
  playShield(pos: { x: number; y: number }, amount: number, cb?: () => void): void {
    const radius = ICON_SIZE / 2 + 10;
    const barrier = this.scene.add.graphics();
    barrier.lineStyle(3, COL.shield, 0.8).strokeCircle(0, 0, radius);
    barrier.fillStyle(COL.shield, 0.15).fillCircle(0, 0, radius);
    barrier.setPosition(pos.x, pos.y).setScale(0.5).setAlpha(0);
    const inner = this.scene.add.graphics();
    inner.fillStyle(COL.shield, 0.1).fillCircle(0, 0, radius * 0.7);
    inner.setPosition(pos.x, pos.y).setScale(0.5).setAlpha(0);

    this.scene.tweens.add({
      targets: [barrier, inner], scaleX: 1, scaleY: 1, alpha: 1,
      duration: 150, ease: 'Back.easeOut',
      onComplete: () => {
        this.scene.tweens.add({
          targets: barrier, scaleX: 1.08, scaleY: 1.08,
          duration: 125, yoyo: true, ease: 'Sine.easeInOut', repeat: 1,
          onComplete: () => {
            this.scene.tweens.add({
              targets: [barrier, inner], alpha: 0, scaleX: 1.3, scaleY: 1.3,
              duration: 200, ease: 'Quad.easeIn',
              onComplete: () => { barrier.destroy(); inner.destroy(); cb?.(); },
            });
          },
        });
      },
    });
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI * 2 * i) / 8;
      const sx = pos.x + Math.cos(a) * radius;
      const sy = pos.y + Math.sin(a) * radius;
      const sp = this.scene.add.graphics();
      sp.fillStyle(COL.shield, 1).fillCircle(0, 0, 2).setPosition(sx, sy).setAlpha(0);
      this.scene.time.delayedCall(i * 40, () => {
        this.scene.tweens.add({
          targets: sp, alpha: 1, duration: 100, yoyo: true, ease: 'Sine.easeInOut',
          onComplete: () => sp.destroy(),
        });
      });
    }
    const st = this.scene.add.text(pos.x, pos.y - ICON_SIZE / 2 - 15, '🛡 +' + Math.round(amount), {
      fontSize: '12px', color: COL.shieldText, fontStyle: 'bold',
    }).setOrigin(0.5);
    this.scene.tweens.add({
      targets: st, y: st.y - 25, alpha: 0, duration: 700, ease: 'Power2',
      onComplete: () => st.destroy(),
    });
  }

  /** Fade + shrink container, red X, scatter particles */
  playDeath(vis: VisEntry, cb?: () => void): void {
    const p = this.pos(vis);
    this.scene.tweens.add({
      targets: vis.container, alpha: 0.15, scaleX: 0.6, scaleY: 0.6,
      duration: 500, ease: 'Power2',
    });
    const xm = this.scene.add.text(p.x, p.y, '✕', {
      fontSize: '28px', color: '#ff0000', fontStyle: 'bold',
    }).setOrigin(0.5).setAlpha(0).setScale(0.5);
    this.scene.tweens.add({
      targets: xm, alpha: 1, scaleX: 1.2, scaleY: 1.2,
      duration: 250, ease: 'Back.easeOut',
      onComplete: () => {
        this.scene.tweens.add({ targets: xm, scaleX: 1, scaleY: 1, duration: 150, ease: 'Sine.easeOut' });
      },
    });
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI * 2 * i) / 8;
      const d = 20 + Math.random() * 15;
      const pt = this.scene.add.graphics();
      pt.fillStyle(0xff0000, 0.7).fillCircle(0, 0, 2 + Math.random() * 2).setPosition(p.x, p.y);
      this.scene.tweens.add({
        targets: pt, x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d,
        alpha: 0, duration: 650, ease: 'Quad.easeOut', onComplete: () => pt.destroy(),
      });
    }
    this.scene.time.delayedCall(600, () => cb?.());
  }
}