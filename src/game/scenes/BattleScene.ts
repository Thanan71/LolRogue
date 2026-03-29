/**
 * BattleScene - Phaser 3 scene for 5v5 combat.
 * Integrates with BattleManager for game logic and renders
 * champions, health bars, and combat feedback.
 */

import Phaser from 'phaser';
import { BattleManager } from '../../game/battle/BattleManager';
import type { BattleTeam, BattleEvent, CombatantState } from '../../game/battle/types';
import { BattlePhase } from '../../game/battle/types';

const COLORS = {
  background: 0x0a0a1a,
  playerTeam: 0x3b82f6,
  enemyTeam: 0xef4444,
  healthBarBg: 0x333333,
  healthBarPlayer: 0x22c55e,
  healthBarEnemy: 0xef4444,
  textPrimary: '#ffffff',
  textSecondary: '#aaaaaa',
  gold: '#ffd700',
  crit: '#ff6b6b',
  damage: '#ff4444',
  victory: '#22c55e',
  defeat: '#ef4444',
  panelBg: 0x1a1a2e,
  panelBorder: 0x333355,
};

const ICON_SIZE = 48;
const BAR_W = 50;
const BAR_H = 6;
const SPACING = 70;
const TOP = 120;

interface Vis {
  container: Phaser.GameObjects.Container;
  hpText: Phaser.GameObjects.Text;
  barFill: Phaser.GameObjects.Graphics;
  side: 'player' | 'enemy';
}

export class BattleScene extends Phaser.Scene {
  private bm!: BattleManager;
  private vis: Map<string, Vis> = new Map();
  private logText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private turnText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private queue: BattleEvent[] = [];
  private busy = false;
  private autoPlay = true;

  constructor() { super({ key: 'BattleScene' }); }

  init(data: { playerTeam: BattleTeam; enemyTeam: BattleTeam; autoAdvance?: boolean }): void {
    this.bm = new BattleManager(data.playerTeam, data.enemyTeam);
    this.vis.clear();
    this.queue = [];
    this.busy = false;
    this.autoPlay = data.autoAdvance ?? true;
    this.bm.on('event', (e: BattleEvent) => { this.queue.push(e); this.tick(); });
  }

  create(): void {
    const { width: w, height: h } = this.cameras.main;
    this.add.rectangle(w / 2, h / 2, w, h, COLORS.background);
    this.add.text(w / 2, 25, 'BATTLE', { fontSize: '24px', color: COLORS.gold, fontStyle: 'bold' }).setOrigin(0.5);
    this.roundText = this.add.text(20, 15, 'Round: 0', { fontSize: '16px', color: COLORS.textPrimary });
    this.turnText = this.add.text(20, 35, 'Turn: ---', { fontSize: '14px', color: COLORS.textSecondary });
    this.statusText = this.add.text(w - 20, 15, 'Phase: Idle', { fontSize: '16px', color: COLORS.textPrimary }).setOrigin(1, 0);

    this.add.text(w * 0.25, TOP - 30, 'YOUR TEAM', { fontSize: '14px', color: '#3b82f6', fontStyle: 'bold' }).setOrigin(0.5);
    this.add.text(w * 0.75, TOP - 30, 'ENEMY TEAM', { fontSize: '14px', color: '#ef4444', fontStyle: 'bold' }).setOrigin(0.5);

    const d = this.add.graphics();
    d.lineStyle(1, 0x333355, 0.5);
    d.lineBetween(w / 2, TOP - 20, w / 2, TOP + 4 * SPACING + 20);

    this.buildTeam('player', this.bm.getPlayerCombatants());
    this.buildTeam('enemy', this.bm.getEnemyCombatants());

    const lY = h - 160;
    const lp = this.add.graphics();
    lp.fillStyle(COLORS.panelBg, 0.9); lp.fillRoundedRect(15, lY, w - 30, 150, 8);
    lp.lineStyle(1, COLORS.panelBorder); lp.strokeRoundedRect(15, lY, w - 30, 150, 8);
    this.add.text(25, lY + 5, 'Battle Log', { fontSize: '12px', color: COLORS.gold, fontStyle: 'bold' });
    this.logText = this.add.text(25, lY + 22, 'Battle is starting...\n', {
      fontSize: '11px', color: COLORS.textSecondary, wordWrap: { width: w - 60 }, lineSpacing: 2,
    });

    this.buildBtns(w, h);
    this.time.delayedCall(500, () => { this.bm.startBattle(); this.hud(); });
  }

  private buildTeam(side: 'player' | 'enemy', cbs: CombatantState[]): void {
    const { width: w } = this.cameras.main;
    const cx = side === 'player' ? w * 0.25 : w * 0.75;
    cbs.forEach((cb, i) => {
      const y = TOP + i * SPACING;
      const ctr = this.add.container(cx, y);
      const ic = this.add.graphics();
      const col = side === 'player' ? COLORS.playerTeam : COLORS.enemyTeam;
      ic.fillStyle(col, 1); ic.fillCircle(0, 0, ICON_SIZE / 2);
      ic.lineStyle(2, 0xffffff, 0.3); ic.strokeCircle(0, 0, ICON_SIZE / 2);
      ctr.add(ic);
      const nt = this.add.text(0, -ICON_SIZE / 2 - 10, cb.champion.name, { fontSize: '12px', color: COLORS.textPrimary, fontStyle: 'bold' }).setOrigin(0.5);
      ctr.add(nt);
      const ht = this.add.text(0, ICON_SIZE / 2 + 14, Math.round(cb.currentHp) + '/' + Math.round(cb.maxHp), { fontSize: '10px', color: COLORS.textSecondary }).setOrigin(0.5);
      ctr.add(ht);
      const bg = this.add.graphics(); bg.fillStyle(COLORS.healthBarBg, 1); bg.fillRoundedRect(-BAR_W / 2, ICON_SIZE / 2 + 2, BAR_W, BAR_H, 2);
      ctr.add(bg);
      const fl = this.add.graphics(); this.drawBar(fl, side, 1); ctr.add(fl);
      this.vis.set(side + '-' + cb.champion.id, { container: ctr, hpText: ht, barFill: fl, side });
    });
  }

  private drawBar(g: Phaser.GameObjects.Graphics, side: 'player' | 'enemy', r: number): void {
    g.clear();
    const col = side === 'player' ? COLORS.healthBarPlayer : COLORS.healthBarEnemy;
    const ww = Math.max(0, BAR_W * r);
    if (ww > 0) { g.fillStyle(col, 1); g.fillRoundedRect(-BAR_W / 2, ICON_SIZE / 2 + 2, ww, BAR_H, 2); }
  }

  private buildBtns(w: number, h: number): void {
    const by = h - 175;
    const nb = this.add.text(w - 25, by, '[ Next Turn ]', { fontSize: '13px', color: COLORS.gold, backgroundColor: '#1a1a2e', padding: { x: 10, y: 5 } }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    nb.on('pointerdown', () => { if (this.bm.phase === BattlePhase.TurnActive && !this.busy) this.bm.executeCurrentTurn(); });
    nb.on('pointerover', () => nb.setColor('#ffffff')); nb.on('pointerout', () => nb.setColor(COLORS.gold));
    const ab = this.add.text(25, by, '[ Auto: ' + (this.autoPlay ? 'ON' : 'OFF') + ' ]', { fontSize: '13px', color: this.autoPlay ? '#22c55e' : '#ef4444', backgroundColor: '#1a1a2e', padding: { x: 10, y: 5 } }).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    ab.on('pointerdown', () => { this.autoPlay = !this.autoPlay; ab.setText('[ Auto: ' + (this.autoPlay ? 'ON' : 'OFF') + ' ]'); ab.setColor(this.autoPlay ? '#22c55e' : '#ef4444'); if (this.autoPlay && this.bm.phase === BattlePhase.TurnActive) this.bm.executeCurrentTurn(); });
    ab.on('pointerover', () => ab.setColor('#ffffff')); ab.on('pointerout', () => ab.setColor(this.autoPlay ? '#22c55e' : '#ef4444'));
  }

  private tick(): void {
    if (this.busy || this.queue.length === 0) return;
    this.busy = true;
    const e = this.queue.shift()!;
    switch (e.type) {
      case 'turn_start': this.onTurn(e); break;
      case 'damage': this.onDmg(e); break;
      case 'defeat': this.onDef(e); break;
      case 'battle_end': this.onEnd(e); break;
    }
  }

  private onTurn(e: Extract<BattleEvent, { type: 'turn_start' }>): void {
    this.turnText.setText('Turn: ' + e.champion + ' (' + e.side + ')');
    this.statusText.setText('Phase: ' + this.bm.phase);
    this.vis.forEach((v, k) => { const a = k === e.side + '-' + e.champion; v.container.setScale(a ? 1.15 : 1); v.container.setAlpha(a ? 1 : 0.6); });
    this.log('> ' + e.champion + "'s turn (" + e.side + ')');
    if (this.autoPlay) this.time.delayedCall(400, () => { if (this.bm.phase === BattlePhase.TurnActive) this.bm.executeCurrentTurn(); });
    this.busy = false; this.tick();
  }

  private onDmg(e: Extract<BattleEvent, { type: 'damage' }>): void {
    const v = this.vis.get(e.targetSide + '-' + e.target);
    if (v) {
      this.tweens.add({ targets: v.container, alpha: 0.3, duration: 80, yoyo: true, repeat: 1 });
      const col = e.isCrit ? COLORS.crit : COLORS.damage;
      const t = this.add.text(v.container.x + 20, v.container.y - 10, e.isCrit ? e.amount + '! CRIT!' : '-' + e.amount, { fontSize: e.isCrit ? '16px' : '13px', color: col, fontStyle: 'bold' }).setOrigin(0.5);
      this.tweens.add({ targets: t, y: t.y - 35, alpha: 0, duration: 700, ease: 'Power2', onComplete: () => t.destroy() });
      const c = this.bm.getCombatantState(e.target, e.targetSide);
      if (c) { this.drawBar(v.barFill, v.side, c.currentHp / c.maxHp); v.hpText.setText(Math.round(c.currentHp) + '/' + Math.round(c.maxHp)); }
    }
    this.log('  ' + e.source + ' -> ' + e.target + ': ' + e.amount + ' dmg' + (e.isCrit ? ' CRIT!' : ''));
    this.time.delayedCall(250, () => { this.busy = false; this.tick(); });
  }

  private onDef(e: Extract<BattleEvent, { type: 'defeat' }>): void {
    const v = this.vis.get(e.side + '-' + e.champion);
    if (v) {
      this.tweens.add({ targets: v.container, alpha: 0.2, scaleX: 0.7, scaleY: 0.7, duration: 400, ease: 'Power2' });
      const xm = this.add.text(v.container.x, v.container.y, 'X', { fontSize: '28px', color: '#ff0000', fontStyle: 'bold' }).setOrigin(0.5).setAlpha(0);
      this.tweens.add({ targets: xm, alpha: 1, duration: 300 });
    }
    this.log('  ' + e.champion + ' has been defeated!');
    this.time.delayedCall(300, () => { this.busy = false; this.tick(); });
  }

  private onEnd(e: Extract<BattleEvent, { type: 'battle_end' }>): void {
    const { width: w, height: h } = this.cameras.main;
    this.statusText.setText('Phase: Finished');
    const win = e.winner === 'player';
    const rc = win ? COLORS.victory : (e.winner === 'draw' ? COLORS.gold : COLORS.defeat);
    const rt = e.winner === 'draw' ? 'DRAW' : (win ? 'VICTORY!' : 'DEFEAT');
    const b = this.add.rectangle(w / 2, h / 2, 300, 100, 0x000000, 0.85);
    b.setStrokeStyle(2, win ? 0x22c55e : 0xef4444);
    const rl = this.add.text(w / 2, h / 2 - 15, rt, { fontSize: '36px', color: rc, fontStyle: 'bold' }).setOrigin(0.5).setAlpha(0);
    const rd = this.add.text(w / 2, h / 2 + 25, 'Rounds: ' + e.rounds, { fontSize: '16px', color: COLORS.textSecondary }).setOrigin(0.5).setAlpha(0);
    this.tweens.add({ targets: [rl, rd], alpha: 1, duration: 500, ease: 'Power2' });
    this.log('\n' + rt + ' after ' + e.rounds + ' rounds!');
    this.autoPlay = false; this.busy = false;
  }

  private hud(): void { const s = this.bm.state; this.roundText.setText('Round: ' + s.round); this.statusText.setText('Phase: ' + s.phase); }

  private log(line: string): void {
    const ls = this.logText.text.split('\n');
    if (ls.length > 10) ls.shift();
    ls.push(line); this.logText.setText(ls.join('\n')); this.hud();
  }

  getManager(): BattleManager { return this.bm; }
}
