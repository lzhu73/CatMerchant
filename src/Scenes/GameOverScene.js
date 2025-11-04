// GameOverScene.js
class GameOverScene extends Phaser.Scene {
  constructor() { super('GameOverScene'); }

  preload(){
    this.load.image('bg_cat', 'assets/cat.PNG');
  }

  create() {
    this.bg = this.add.image(0, 0, 'bg_cat').setOrigin(0, 0);
    const W = this.scale.width, H = this.scale.height;

    this.add.text(W/2, H*0.20, 'GAME OVER', {
      fontFamily: 'monospace', fontSize: '48px', color: '#ffffff'
    }).setOrigin(0.5);

    this.add.text(W/2, H*0.28, `Final Money: $${this.finalScore}`, {
      fontFamily: 'monospace', fontSize: '24px', color: '#ffffff'
    }).setOrigin(0.5);


    this.input.keyboard.once('keydown-ENTER', () => {
      this.scene.start('gameScene');
    });
  }
}
