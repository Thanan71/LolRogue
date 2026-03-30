/**
 * GameOverScene — Phaser 3 scene for end-of-run summary.
 *
 * Displays:
 *   - Victory/Defeat title
 *   - Waves completed
 *   - Champion roster with per-champion kills & damage
 *   - Total kills & total damage
 *   - Permanent rewards earned (candies & mastery)
 *   - "Return to Menu" button
 */

import Phaser from 'phaser';
import type { RunSummary, ChampionRunStats } from '@/types/run';
import { useRewardsStore, calculateRunRewards } from '@/stores/rewardsStore';

// ─── Color Palette ───────────────────────────────────────────────────

const COLORS = {
  background: 0x0a0a1a,
  panelBg: 0x1a1a2e,
  panelBorder: 0x333355,
  textPrimary: '#ffffff',
  textSecondary: '#aaaaaa',
  textDim: '#777777',
  gold: '#ffd700',
  victory: '#22c55e',
  defeat: '#ef4444',
  candy: '#ff69b4',
  mastery: '#c8aa6e',
  divider: 0x333355,
  surviver: '#22c55e',
  fallen: '#ef4444',
  btnBg: '#1a1a2e',
  btnHover: '#2a2a4e',
} as const;

const FONT = 'Arial, Helvetica, sans-serif';

// ─── Scene ───────────────────────────────────────────────────────────

export class GameOverScene extends Phaser.Scene {
  private summary!: RunSummary;
  private rewardsCalculated = false;

  constructor() {
    super({ key: 'GameOverScene' });
  }

  init(data: { summary: RunSummary }): void {
    this.summary = data.summary;
    this.rewardsCalculated = false;
  }

  create(): void {
    const { width: w, height: h } = this.cameras.main;

    // Background
    this.add.rectangle(w / 2, h / 2, w, h, COLORS.background);

    // Calculate and distribute rewards
    if (!this.rewardsCalculated) {
      this.distributeRewards();
      this.rewardsCalculated = true;
    }

    // Build the UI sections
    this.drawTitle(w, h);
    this.drawDivider(w, 85);
    this.drawStatsSummary(w, h);
    this.drawDivider(w, 215);
    this.drawChampionRoster(w, h);
    this.drawRewards(w, h);
    this.drawReturnButton(w, h);
  }

  // ── Title ──────────────────────────────────────────────────────────

  private drawTitle(w: number, _h: number): void {
    const isVictory = this.summary.won;
    const titleText = isVictory ? 'VICTORY!' : 'DEFEAT';
    const titleColor = isVictory ? COLORS.victory : COLORS.defeat;

    this.add
      .text(w / 2, 30, titleText, {
        fontSize: '36px',
        color: titleColor,
        fontStyle: 'bold',
        fontFamily: FONT,
      })
      .setOrigin(0.5);

    this.add
      .text(w / 2, 65, `Run Level ${this.summary.runLevel} — ${this.summary.wavesCompleted} waves completed`, {
        fontSize: '14px',
        color: COLORS.textSecondary,
        fontFamily: FONT,
      })
      .setOrigin(0.5);
  }

  // ── Stats Summary (total kills, damage, gold) ──────────────────────

  private drawStatsSummary(w: number, _h: number): void {
    const y = 105;
    const cols = [
      { label: 'Total Kills', value: String(this.summary.totalKills), color: COLORS.defeat },
      { label: 'Total Damage', value: this.formatNumber(this.summary.totalDamage), color: COLORS.gold },
      { label: 'Gold Earned', value: String(this.summary.goldEarned), color: COLORS.gold },
      { label: 'Biomes', value: String(this.summary.biomesVisited.length), color: COLORS.mastery },
    ];

    const colWidth = w / cols.length;

    cols.forEach((col, i) => {
      const cx = colWidth * i + colWidth / 2;
      this.add
        .text(cx, y, col.label, {
          fontSize: '11px',
          color: COLORS.textDim,
          fontFamily: FONT,
        })
        .setOrigin(0.5);
      this.add
        .text(cx, y + 22, col.value, {
          fontSize: '22px',
          color: col.color,
          fontStyle: 'bold',
          fontFamily: FONT,
        })
        .setOrigin(0.5);
    });

    // Biomes visited row
    if (this.summary.biomesVisited.length > 0) {
      const bioText = this.summary.biomesVisited.map((b) => b.charAt(0).toUpperCase() + b.slice(1)).join('  →  ');
      this.add
        .text(w / 2, y + 58, bioText, {
          fontSize: '11px',
          color: COLORS.textSecondary,
          fontFamily: FONT,
        })
        .setOrigin(0.5);
    }
  }

  // ── Champion Roster ────────────────────────────────────────────────

  private drawChampionRoster(w: number, _h: number): void {
    const startY = 230;

    this.add
      .text(w / 2, startY, 'CHAMPION PERFORMANCE', {
        fontSize: '14px',
        color: COLORS.gold,
        fontStyle: 'bold',
        fontFamily: FONT,
      })
      .setOrigin(0.5);

    const stats = this.summary.championStats;
    if (stats.length === 0) {
      this.add
        .text(w / 2, startY + 35, 'No champions tracked', {
          fontSize: '12px',
          color: COLORS.textDim,
          fontFamily: FONT,
        })
        .setOrigin(0.5);
      return;
    }

    const rowHeight = 44;
    const panelTop = startY + 18;
    const panelHeight = stats.length * rowHeight + 10;

    // Panel background
    const panel = this.add.graphics();
    panel.fillStyle(COLORS.panelBg, 0.9);
    panel.fillRoundedRect(30, panelTop, w - 60, panelHeight, 8);
    panel.lineStyle(1, COLORS.panelBorder);
    panel.strokeRoundedRect(30, panelTop, w - 60, panelHeight, 8);

    stats.forEach((cs: ChampionRunStats, i: number) => {
      const rowY = panelTop + 12 + i * rowHeight;

      // Champion name
      this.add
        .text(48, rowY, cs.championId, {
          fontSize: '14px',
          color: cs.survived ? COLORS.surviver : COLORS.fallen,
          fontStyle: 'bold',
          fontFamily: FONT,
        })
        .setOrigin(0, 0);

      // Status icon
      const statusLabel = cs.survived ? '✓ Alive' : '✗ Fallen';
      this.add
        .text(180, rowY, statusLabel, {
          fontSize: '11px',
          color: cs.survived ? COLORS.surviver : COLORS.fallen,
          fontFamily: FONT,
        })
        .setOrigin(0, 0);

      // Kills
      this.add
        .text(w * 0.5, rowY + 1, `${cs.kills} kills`, {
          fontSize: '12px',
          color: COLORS.textPrimary,
          fontFamily: FONT,
        })
        .setOrigin(0, 0);

      // Damage
      this.add
        .text(w * 0.72, rowY + 1, `${this.formatNumber(cs.totalDamage)} dmg`, {
          fontSize: '12px',
          color: COLORS.textSecondary,
          fontFamily: FONT,
        })
        .setOrigin(0, 0);

      // Divider between rows (except last)
      if (i < stats.length - 1) {
        const dg = this.add.graphics();
        dg.lineStyle(1, COLORS.divider, 0.3);
        dg.lineBetween(48, rowY + rowHeight - 8, w - 48, rowY + rowHeight - 8);
      }
    });
  }

  // ── Permanent Rewards ──────────────────────────────────────────────

  private drawRewards(w: number, h: number): void {
    const rewards = calculateRunRewards({
      wavesCompleted: this.summary.wavesCompleted,
      totalKills: this.summary.totalKills,
      championStats: this.summary.championStats,
    });

    const panelY = h - 170;
    const panelH = 80;

    // Panel
    const panel = this.add.graphics();
    panel.fillStyle(COLORS.panelBg, 0.9);
    panel.fillRoundedRect(30, panelY, w - 60, panelH, 8);
    panel.lineStyle(1, COLORS.panelBorder);
    panel.strokeRoundedRect(30, panelY, w - 60, panelH, 8);

    this.add
      .text(w / 2, panelY + 12, 'PERMANENT REWARDS EARNED', {
        fontSize: '12px',
        color: COLORS.gold,
        fontStyle: 'bold',
        fontFamily: FONT,
      })
      .setOrigin(0.5);

    // Candies
    this.add
      .text(w * 0.3, panelY + 42, `🍬 ${rewards.candies} Candies`, {
        fontSize: '16px',
        color: COLORS.candy,
        fontStyle: 'bold',
        fontFamily: FONT,
      })
      .setOrigin(0.5);

    // Mastery total
    const totalMastery = Object.values(rewards.mastery).reduce((a, b) => a + b, 0);
    this.add
      .text(w * 0.7, panelY + 42, `⭐ ${totalMastery} Mastery`, {
        fontSize: '16px',
        color: COLORS.mastery,
        fontStyle: 'bold',
        fontFamily: FONT,
      })
      .setOrigin(0.5);
  }

  // ── Return to Menu Button ──────────────────────────────────────────

  private drawReturnButton(w: number, h: number): void {
    const btnW = 220;
    const btnH = 44;
    const btnX = w / 2;
    const btnY = h - 55;

    // Button background
    const bg = this.add.graphics();
    bg.fillStyle(0x1a1a2e, 1);
    bg.fillRoundedRect(btnX - btnW / 2, btnY - btnH / 2, btnW, btnH, 8);
    bg.lineStyle(2, 0xc8aa6e);
    bg.strokeRoundedRect(btnX - btnW / 2, btnY - btnH / 2, btnW, btnH, 8);

    const btnText = this.add
      .text(btnX, btnY, '  Return to Menu  ', {
        fontSize: '18px',
        color: COLORS.gold,
        fontStyle: 'bold',
        fontFamily: FONT,
        backgroundColor: '#1a1a2e',
        padding: { x: 16, y: 8 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    btnText.on('pointerover', () => {
      btnText.setColor('#ffffff');
      bg.clear();
      bg.fillStyle(0x2a2a4e, 1);
      bg.fillRoundedRect(btnX - btnW / 2, btnY - btnH / 2, btnW, btnH, 8);
      bg.lineStyle(2, 0xffffff);
      bg.strokeRoundedRect(btnX - btnW / 2, btnY - btnH / 2, btnW, btnH, 8);
    });

    btnText.on('pointerout', () => {
      btnText.setColor(COLORS.gold);
      bg.clear();
      bg.fillStyle(0x1a1a2e, 1);
      bg.fillRoundedRect(btnX - btnW / 2, btnY - btnH / 2, btnW, btnH, 8);
      bg.lineStyle(2, 0xc8aa6e);
      bg.strokeRoundedRect(btnX - btnW / 2, btnY - btnH / 2, btnW, btnH, 8);
    });

    btnText.on('pointerdown', () => {
      this.handleReturnToMenu();
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────

  private distributeRewards(): void {
    const rewards = calculateRunRewards({
      wavesCompleted: this.summary.wavesCompleted,
      totalKills: this.summary.totalKills,
      championStats: this.summary.championStats,
    });

    const store = useRewardsStore.getState();
    store.addCandies(rewards.candies);
    for (const [championId, points] of Object.entries(rewards.mastery)) {
      store.addMastery(championId, points);
    }
  }

  private handleReturnToMenu(): void {
    // Clean up: stop this scene and return to boot/menu
    this.scene.stop('GameOverScene');
    this.scene.stop('BattleScene');
    this.scene.start('BootScene');
  }

  private drawDivider(w: number, y: number): void {
    const dg = this.add.graphics();
    dg.lineStyle(1, COLORS.divider, 0.4);
    dg.lineBetween(40, y, w - 40, y);
  }

  private formatNumber(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return String(Math.round(n));
  }
}
