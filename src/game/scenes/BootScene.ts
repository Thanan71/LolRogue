import Phaser from 'phaser';
import { fetchLatestVersion } from '../../config/ddragon';
import { imageLoader, preloadChampionIcons } from '../../services';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    const { width, height } = this.cameras.main;

    const loadingText = this.add.text(width / 2, height / 2, 'Chargement...', {
      fontSize: '24px',
      color: '#c8aa6e',
    });
    loadingText.setOrigin(0.5);

    this._loadAssets(loadingText);
  }

  private async _loadAssets(loadingText: Phaser.GameObjects.Text): Promise<void> {
    // 1. Fetch latest DDragon version
    loadingText.setText('Récupération de la version...');
    const version = await fetchLatestVersion();
    console.log(`[BootScene] Data Dragon version: ${version}`);

    // 2. Preload champion icons into the image cache
    loadingText.setText('Chargement des icônes...');
    const demoChampions = ['Ahri', 'Darius', 'Jinx', 'Lux', 'Garen', 'Yasuo'];
    const results = await preloadChampionIcons(demoChampions, 3);

    // 3. Load each image as a Phaser texture via base64
    for (let i = 0; i < demoChampions.length; i++) {
      const champId = demoChampions[i];
      const result = results[i];
      const key = `champion-${champId}`;

      if (result && result.source !== 'placeholder' && !this.textures.exists(key)) {
        this.textures.addBase64(key, result.url);
      }
    }

    loadingText.setText('Prêt !');
  }

  create(): void {
    const { width, height } = this.cameras.main;

    const title = this.add.text(width / 2, height / 2 - 80, 'LolRogue', {
      fontSize: '48px',
      color: '#ffd700',
      fontStyle: 'bold',
    });
    title.setOrigin(0.5);

    const subtitle = this.add.text(width / 2, height / 2 - 30, 'Press any key to start', {
      fontSize: '18px',
      color: '#cccccc',
    });
    subtitle.setOrigin(0.5);

    this._displayChampionGrid(width, height);
    this._displayStats(width, height);

    this.input.keyboard?.on('keydown', () => {
      console.log('Game starting...');
      console.log('[ImageLoader Stats]', imageLoader.getStats());
    });
  }

  private _displayChampionGrid(width: number, height: number): void {
    const champions = ['Ahri', 'Darius', 'Jinx', 'Lux', 'Garen', 'Yasuo'];
    const iconSize = 64;
    const gap = 10;
    const totalWidth = champions.length * (iconSize + gap) - gap;
    const startX = (width - totalWidth) / 2 + iconSize / 2;
    const iconY = height / 2 + 60;

    champions.forEach((champId, index) => {
      const key = `champion-${champId}`;
      const x = startX + index * (iconSize + gap);

      if (this.textures.exists(key)) {
        const sprite = this.add.image(x, iconY, key);
        sprite.setDisplaySize(iconSize, iconSize);
        sprite.setOrigin(0.5);
        sprite.setInteractive();
        sprite.on('pointerover', () => sprite.setScale(1.15));
        sprite.on('pointerout', () => sprite.setScale(1));
      } else {
        this.add
          .text(x, iconY, champId.substring(0, 2).toUpperCase(), {
            fontSize: '18px',
            color: '#c8aa6e',
            backgroundColor: '#1a1a2e',
            padding: { x: 16, y: 16 },
          })
          .setOrigin(0.5);
      }

      // Name label under icon
      this.add
        .text(x, iconY + iconSize / 2 + 16, champId, {
          fontSize: '11px',
          color: '#aaaaaa',
        })
        .setOrigin(0.5);
    });
  }

  private _displayStats(width: number, height: number): void {
    const stats = imageLoader.getStats();
    const statsText = [
      `Cache: ${stats.cacheHits}`,
      `Local: ${stats.localHits}`,
      `CDN: ${stats.cdnHits}`,
      `Placeholder: ${stats.placeholderHits}`,
    ].join(' | ');

    this.add
      .text(width / 2, height - 30, statsText, {
        fontSize: '12px',
        color: '#666666',
      })
      .setOrigin(0.5);
  }
}
