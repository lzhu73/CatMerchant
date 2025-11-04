const config = {
    type: Phaser.AUTO,
    width: 1060,
    height: 720,
    backgroundColor: '#ffffff',
    scale: { 
        mode: Phaser.Scale.FIT, 
        autoCenter: Phaser.Scale.CENTER_BOTH },
    parent: 'phaser-game',
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0 },
            debug: false
        }
    },
    scene: [
        GameScene,
        GameOverScene
    ]
};

const game = new Phaser.Game(config);