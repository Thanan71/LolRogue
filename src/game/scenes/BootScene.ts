import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    // TODO: Load initial assets here
  }

  create(): void {
    const { width, height } = this.cameras.main;

    const title = this.add.text(width / 2, height / 2 - 40, 'LolRogue', {
      fontSize: '48px',
      color: '#ffd700',
      fontStyle: 'bold',
    });
    title.setOrigin(0.5);

    const subtitle = this.add.text(width / 2, height / 2 + 20, 'Press any key to start', {
      fontSize: '18px',
      color: '#cccccc',
    });
    subtitle.setOrigin(0.5);

    this.input.keyboard?.on('keydown', () => {
      // TODO: Transition to game scene
      console.log('Game starting...');
    });
  }
}
