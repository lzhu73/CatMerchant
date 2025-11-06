// GameScene.js
class GameScene extends Phaser.Scene {
  constructor() { super('gameScene'); }

  wait(ms) {
    return new Promise(resolve => this.time.delayedCall(ms, resolve));
  }

  SIZES = {
    customerH: 300,
    buttonH:    60,
    dialogW:   360,
    dialogH:   220,
    slot:       48, // inventory slot size
    hintW:     360
  };
  MAX_INV = 6;
  SCAN_COST = 5;
  REPORT_PCT_PER_FLAG = 0.0;
  CATCH_PROB_FAKE = 0.50;
  CATCH_PROB_DANGER = 0.70;

  CATALOG = {
    product1: { base: 60 }, product2: { base: 50 }, product3: { base: 70 },
    product4: { base: 40 }, product5: { base: 100 }
  };

  // scene state
  state = {
    running: false,
    money: 100,
    inventory: [], // [{ paidPrice, originalPrice, key, fake?, danger? }]
    customerPresent: false,
    encounter: null, // {type:'seller'|'buyer', product, price, origPrice, invIndex?}
    scanned: false,
    counterPending: null,
    gameOver: false
  };

  preload() {
    // background & UI
    this.load.image('bg_cat', 'assets/cat.png');
    this.load.image('box1', 'assets/box1.png');
    this.load.image('details', 'assets/details.png');
    this.load.image('bar', 'assets/bar.png');

    // buttons
    this.load.image('start', 'assets/start.png');
    this.load.image('scan', 'assets/scan.png');
    this.load.image('deal', 'assets/deal.png');     // confirm
    this.load.image('reject', 'assets/reject.png');
    this.load.image('report', 'assets/report.png');
    this.load.image('counter', 'assets/counter.png');

    // flags
    this.load.image('fake', 'assets/fake.png');
    this.load.image('danger', 'assets/dangers.png');

    // character & products
    this.load.image('customer', 'assets/crocodile.png');
    this.load.image('product1', 'assets/product1.png');
    this.load.image('product2', 'assets/product2.png');
    this.load.image('product3', 'assets/product3.png');
    this.load.image('product4', 'assets/product4.png');
    this.load.image('product5', 'assets/product5.png');
  }

  create() {
    // layers
    this.bgLayer = this.add.layer();
    this.gameLayer = this.add.layer();
    this.uiLayer = this.add.layer();

    // background
    this.bg = this.add.image(0, 0, 'bg_cat').setOrigin(0, 0);
    this.bgLayer.add(this.bg);

    // customer
    this.customerSprite = this.add.image(0, 0, 'customer').setVisible(false);
    this.gameLayer.add(this.customerSprite);

    // swing
    this.tweens.add({
      targets: this.customerSprite,
      angle: { from: -1, to: 1 },
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // dialog
    this.dialog = this.add.container(0, 0).setDepth(920).setVisible(false);
    this.dialogPlate = this.add.image(0, 0, 'box1').setOrigin(0.5);
    this.dialogProduct = this.add.image(0, 0, 'product1').setOrigin(0.5);
    this.dialogPrice = this.add.text(0, 0, '$0', {
      fontFamily: 'monospace', fontSize: '26px', color: '#333', align: 'center',
      wordWrap: { width: this.SIZES.dialogW * 0.9 }
    }).setOrigin(0.5);
    this.dialog.add([this.dialogPlate, this.dialogProduct, this.dialogPrice]);

    // details popup
    this.details = this.add.container(0, 0).setDepth(1000).setVisible(false);
    this.detailsPlate = this.add.image(0, 0, 'details').setOrigin(0.5);
    this.detailsProduct = this.add.image(0, 0, 'product1').setOrigin(0.5);
    this.detailsFlagFake = this.add.image(0, 0, 'fake').setOrigin(0.7).setVisible(false);
    this.detailsFlagDanger = this.add.image(0, 0, 'danger').setOrigin(0.7).setVisible(false);
    this.details.add([this.detailsPlate, this.detailsProduct, this.detailsFlagFake, this.detailsFlagDanger]);

    //goal
    this.goalText = this.add.text(0, 0, 'Goal: $200', {
      fontFamily: 'monospace', fontSize: '24px', color: 'rgba(112, 32, 187, 1)'
    }).setDepth(950);
    this.goalText.setPosition(30,65);

    // accepted / rejected toast
    this.toast = this.add.text(0, 0, '', {
      fontFamily: 'monospace', fontSize: '28px', color: '#222', backgroundColor: '#ffff99'
    }).setDepth(2000).setPadding(10,6).setOrigin(0.5).setVisible(false);

    // money bar
    this.moneyBar = this._makeBar();
    this.moneyText = this.add.text(0, 0, '$0', {
      fontFamily: 'monospace', fontSize: '24px', color: '#0a0'
    }).setDepth(950);
    

    // inventory bar
    this.invBar = this._makeBar();
    this.invSlots = [];
    this.invTexts = [];
    for (let i = 0; i < this.MAX_INV; i++) {
      const slot = this.add.rectangle(0, 0, this.SIZES.slot, this.SIZES.slot, 0x000000, 0.25)
        .setStrokeStyle(2, 0xffffff, 0.8).setOrigin(0.5).setDepth(950);
      this.invSlots.push(slot);
      const label = this.add.text(0, 0, '', {
        fontFamily: 'monospace', fontSize: '14px', color: '#ffffff', align: 'center'
      }).setOrigin(0.5).setDepth(960);
      this.invTexts.push(label);
    }

    // hint
    this.infoBar = this._makeBar();
    this.infoText = this.add.text(0, 0, '-Report Reward: Fake: $5, Danger: $10\n-Don’t get caught if you want to sell\n those...\n-Pay attention to how much you have', {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#4d3f3fff',
      wordWrap: { width: 10 } // set properly in _layout()
    }).setDepth(960);

    // buttons
    this.buttons = {
      start:   this._makeBtn(0, 0, 'start',   () => this._onStartPressed()),
      counter: this._makeBtn(0, 0, 'counter', () => this._onCounter()),
      scan:    this._makeBtn(0, 0, 'scan',    () => this._onScan()),
      reject:  this._makeBtn(0, 0, 'reject',  () => this._onReject()),
      report:  this._makeBtn(0, 0, 'report',  () => this._onReport()),
      deal:    this._makeBtn(0, 0, 'deal',    () => this._onDealConfirm())
    };
    Object.values(this.buttons).forEach(b => this._setButtonHeight(b, this.SIZES.buttonH));
    this._hideAllButtons();
    this._setButtons(['start']);

    // sync + layout
    this._refreshMoney();
    this._refreshInventory();
    this._layout();
    this.scale.on('resize', () => { this._layout(); });
  }

  // layout
  _layout() {
    const W = this.scale.width, H = this.scale.height;
    this._cover(this.bg, W, H);

    // customer right & bottom
    this._contain(this.customerSprite, Number.MAX_SAFE_INTEGER, this.SIZES.customerH);
    const cpos = this._getCustomerTargetPos();
    this.customerSprite.setPosition(cpos.x, cpos.y);

    // dialog left
    this.dialog.setPosition(W * 0.28, H * 0.27);
    this.dialogPlate.setDisplaySize(this.SIZES.dialogW, this.SIZES.dialogH);
    this.dialogProduct.setPosition(0, 10);
    this._contain(this.dialogProduct, this.SIZES.dialogW * 0.8, this.SIZES.dialogH * 0.7);
    this.dialogPrice.setPosition(0, -this.SIZES.dialogH * 0.40);

    // details center
    this.details.setPosition(W * 0.5, H * 0.5);
    this.detailsPlate.setDisplaySize(Math.min(W * 0.8, 780), Math.min(H * 0.8, 540));
    this.detailsProduct.setPosition(0, 10);
    this._contain(this.detailsProduct, this.detailsPlate.displayWidth * 0.7, this.detailsPlate.displayHeight * 0.6);
    const flagSize = 90;
    const offsetY = this.detailsPlate.displayHeight / 2 - 90;
    this.detailsFlagFake
      .setDisplaySize(flagSize, flagSize)
      .setPosition(-flagSize - 30, -offsetY);
    this.detailsFlagDanger
      .setDisplaySize(flagSize, flagSize)
      .setPosition(flagSize + 30, -offsetY);

    // toast center-top-ish
    this.toast.setPosition(W * 0.5, H * 0.18);

    // money bar (top-left)
    const pad = 16, barH = 44, moneyW = 220, invW = 420;
    this._placeBar(this.moneyBar, pad, pad, moneyW, barH);
    this.moneyText.setPosition(this.moneyBar.x + 14, this.moneyBar.y + barH/2 - 12);


    // inventory bar (top-right)
    this._placeBar(this.invBar, W - invW - pad, pad, invW, barH);
    const innerPad = 12, usableW = invW - innerPad * 2, step = usableW / this.MAX_INV;
    const ySlots = this.invBar.y + barH / 2;
    for (let i = 0; i < this.invSlots.length; i++) {
      const x = this.invBar.x + innerPad + step * (i + 0.5);
      this.invSlots[i].setPosition(x, ySlots);
      this.invTexts[i].setPosition(x, ySlots); // inside the slot
    }

    // hint bar
    const infoBarH = 100;
    const infoGap  = 10; // below inventory
    const infoX    = this.invBar.x;
    const infoY    = this.invBar.y + barH + infoGap;

    this._placeBar(this.infoBar, infoX, infoY, invW, infoBarH);
    // text inside
    const infoInnerPad = 12;
    const infoTextW = invW - infoInnerPad * 2;
    this.infoText.setPosition(
      infoX + infoInnerPad + 15,
      infoY + infoInnerPad + 5
    );
    // update wrap width after know width
    this.infoText.setWordWrapWidth(infoTextW);


    // buttons: start bottom center; others left column
    const by = H * 0.88;
    this.buttons.start.setPosition(W * 0.5, by);

    const colX = pad + 80;
    const startY = H * 0.50;
    const gap = this.SIZES.buttonH * 0.95;
    const order = ['counter','scan','reject','report','deal'];
    order.forEach((k, i) => this.buttons[k].setPosition(colX, startY + i * gap));

    // final: ensure labels match positions and values
    this._refreshInventory();
  }

  // helpers
  _cover(img, w, h) { const sx = w / img.width, sy = h / img.height; img.setScale(Math.max(sx, sy)); }
  _contain(go, maxW, maxH) {
    const tex = go.texture.getSourceImage(); const s = Math.min(maxW/tex.width, maxH/tex.height);
    go.setDisplaySize(Math.round(tex.width*s), Math.round(tex.height*s));
  }
  _setButtonHeight(go, targetH) { const tex = go.texture.getSourceImage(); go.setScale(targetH / tex.height); }

  _makeBar() { const b = this.add.image(0,0,'bar').setOrigin(0,0).setDepth(900).setScrollFactor(0); this.uiLayer.add(b); return b; }
  _placeBar(bar, x, y, w, h) { bar.setPosition(x,y); bar.setDisplaySize(w,h); }

  _makeBtn(x, y, key, onClick) {
    const b = this.add.image(x, y, key).setOrigin(0.5).setDepth(950).setVisible(false).setActive(false);
    b.on('pointerdown', () => { if (b.visible && b.active) onClick(); });
    b.on('pointerover', () => { if (b.visible && b.active) b.setScale(b.scale * 1.03); });
    b.on('pointerout',  () => { if (b.visible && b.active) this._setButtonHeight(b, this.SIZES.buttonH); });
    this.uiLayer.add(b);
    return b;
  }
  _setButtonVisible(btn, show) {
    btn.setVisible(show); btn.setActive(show);
    if (show) { btn.setInteractive({ useHandCursor: true }); this._setButtonHeight(btn, this.SIZES.buttonH); }
    else { btn.removeInteractive(); }
  }
  _setButtons(keysVisible) {
    const want = new Set(keysVisible);
    for (const [name, btn] of Object.entries(this.buttons)) this._setButtonVisible(btn, want.has(name));
  }
  _hideAllButtons() { for (const b of Object.values(this.buttons)) this._setButtonVisible(b, false); }

  _refreshMoney() { this.moneyText.setText(`$${Math.max(0, Math.floor(this.state.money))}`); }
  _refreshInventory() {
    for (let i = 0; i < this.MAX_INV; i++) {
      const filled = i < this.state.inventory.length;
      this.invSlots[i].setStrokeStyle(2, filled ? 0x00ff88 : 0xffffff, 0.9);
      let label = '';
      if (filled) {
        const it = this.state.inventory[i];
        if (it.fake || it.danger) label = `$${it.paidPrice}($${it.originalPrice})`;
        else label = `$${it.paidPrice}`;
      }
      this.invTexts[i].setText(label);
      this.invTexts[i].setVisible(label !== '');
    }
  }

  // flow
  _onStartPressed() {
    if (this.state.money < 0) this.state.money = 100; // reset only when user presses Start
    this.state.gameOver = false;
    this.state.running = true;
    this._refreshMoney();
    this._refreshInventory();
    this._nextEncounter();
  }

  // game over
  async _gameOver() {
    if (this.state.gameOver) return;
    this.state.gameOver = true;
    this.state.running = false;

    if (this.state.money < 0) this._showToast('GAMEOVER', 1500);
    else this._showToast('You Win!', 1500);
    await this.wait(1500);
    window.location.reload(); // full reload, same as browser refresh
  }

  _nextEncounter() {
    let type = 'seller';
    if (this.state.inventory.length === 0) type = 'seller';
    else if (this.state.inventory.length >= this.MAX_INV) type = 'buyer';
    else type = (Math.random() < 0.5 ? 'seller' : 'buyer');

    if (type === 'seller') this._spawnSeller(); else this._spawnBuyer();
  }

  // encounters
  _spawnSeller() {
    this._spawnCustomerAnimated(() => {
      const key = this._randomProductKey();
      const base = this.CATALOG[key].base;
      const fake = Math.random() < 0.45;
      const danger = Math.random() < 0.35;
      const ask = Math.round(base * this._randRange(0.8, 1.2));

      this.state.encounter = { type:'seller', product:{ key, base, fake, danger }, price: ask, origPrice: ask };
      this.state.scanned = false;
      this.state.counterPending = null;

      this._showDialogSeller(ask, key);
      // show only scan/reject first
      this._setButtons(['scan','reject']);
    });
  }

  _spawnBuyer() {
    const n = this.state.inventory.length;
    if (n === 0) return this._spawnSeller();
    this._spawnCustomerAnimated(() => {
      const idx = Math.floor(Math.random() * n);
      const it = this.state.inventory[idx];
      const basis = (it.fake || it.danger) ? it.originalPrice : it.paidPrice;
      // buyer offer -30% + 40%
      const offer = Math.round(basis * this._randRange(0.7, 1.4));
      this.state.encounter = { type:'buyer', product: it, price: offer, invIndex: idx };
      this.state.scanned = true;
      this.state.counterPending = null;

      const num = idx + 1;
      this._showDialogBuyer(offer, num);
      this._setButtons(['counter','reject','deal']);
    });
  }

  _spawnCustomerAnimated(after) {
    // avoid conflicts
    this.tweens.killTweensOf(this.customerSprite);

    this.state.customerPresent = true;

    // always make visible and fully opaque before every new arrival
    this.customerSprite.setVisible(true).setAlpha(1);

    // reset scale & contain
    this._contain(this.customerSprite, Number.MAX_SAFE_INTEGER, this.SIZES.customerH);

    const target = this._getCustomerTargetPos();
    const startX = this.scale.width + (this.customerSprite.displayWidth * 0.6);

    // start smaller to simulate distance
    const baseScaleX = this.customerSprite.scaleX;
    const baseScaleY = this.customerSprite.scaleY;
    this.customerSprite
      .setScale(baseScaleX * 0.85, baseScaleY * 0.85)
      .setPosition(startX, target.y);

    this._hideDialog();
    this._hideDetails();

    this.tweens.add({
      targets: this.customerSprite,
      x: target.x,
      scaleX: baseScaleX * 1.12,
      scaleY: baseScaleY * 1.12,
      ease: 'Sine.easeOut',
      duration: 700,
      onUpdate: () => { this.customerSprite.y = this._getCustomerBottomY(); },
      onComplete: () => {
        this.customerSprite.setPosition(target.x, this._getCustomerBottomY());
        this.customerSprite.setVisible(true).setAlpha(1);
        after && after();
      }
    });
  }

  _despawnCustomer(immediate = false, waitMs = 350) {
    return new Promise((resolve) => {
      const endX = this.scale.width + (this.customerSprite.displayWidth * 0.6);

      if (immediate) {
        this.customerSprite.setPosition(endX, this._getCustomerBottomY());
        this.customerSprite.setVisible(false);
        this.state.customerPresent = false;
        return resolve();
      }

      // slide off, then hide
      this.time.delayedCall(waitMs, () => {
        this.tweens.add({
          targets: this.customerSprite,
          x: endX,
          alpha: 0.7,
          ease: 'Sine.easeIn',
          duration: 450,
          onUpdate: () => { this.customerSprite.y = this._getCustomerBottomY(); },
          onComplete: () => {
            this.customerSprite.setAlpha(1).setVisible(false);
            this.state.customerPresent = false;   // hide
            resolve();
          }
        });
      });
    });
  }

  // dialog helpers
  _showDialogSeller(ask, productKey) {
    this.dialog.setVisible(true);
    this.dialogProduct.setVisible(true).setTexture(productKey);
    this._contain(this.dialogProduct, this.SIZES.dialogW * 0.8, this.SIZES.dialogH * 0.7);

    const lines = [];
    const e = this.state.encounter;
    const flagged = e?.product?.fake || e?.product?.danger;

    if (this.state.scanned && e?.type === 'seller' && flagged) {
      const orig = e?.origPrice ?? ask;
      lines.push(`🤫 New ask: $${ask}`);
      lines.push(`(Orig: $${orig})`);
    } else {
      lines.push(`Ask: $${ask}`);
    }
    if (this.state.counterPending != null) lines.push(`Your offer: $${this.state.counterPending}`);
    this.dialogPrice.setText(lines.join('\n'));
  }

  _showDialogBuyer(offer, invNumber) {
    this.dialog.setVisible(true);
    this.dialogProduct.setVisible(false);

    const it = this.state.inventory[this.state.encounter?.invIndex ?? 0];
    const basis = it ? ((it.fake || it.danger) ? it.originalPrice : it.paidPrice) : null;

    const lines = [`No.${invNumber} Offer: $${offer}`];
    if (basis != null) lines.push(`(Based on: $${basis})`);
    if (this.state.counterPending != null) lines.push(`Your ask: $${this.state.counterPending}`);
    this.dialogPrice.setText(lines.join('\n'));
  }
  _hideDialog() { this.dialog.setVisible(false); }

  // interactivity only while visible
  _showDetails(product) {
    if (this.state.encounter?.type === 'seller' && !this.state.scanned) {
      this.state.money -= this.SCAN_COST;
      this._refreshMoney();
      if (this.state.money < 0 || this.state.money >= 200) return this._gameOver();
    }
    this.state.scanned = true;

    this.details.setVisible(true);
    // enable a big click-catcher when visible
    this.details.setInteractive(new Phaser.Geom.Rectangle(-5000,-5000,10000,10000), Phaser.Geom.Rectangle.Contains)
      .on('pointerdown', () => this._hideDetails());

    this.detailsProduct.setTexture(product.key);
    this._contain(this.detailsProduct, this.detailsPlate.displayWidth * 0.7, this.detailsPlate.displayHeight * 0.6);
    this.detailsFlagFake.setVisible(!!product.fake);
    this.detailsFlagDanger.setVisible(!!product.danger);
  }
  _hideDetails() {
    this.details.disableInteractive();
    this.details.removeAllListeners && this.details.removeAllListeners();
    this.details.setVisible(false);
  }

  // toast
  _showToast(text, duration=800) {
    const W = this.scale.width, H = this.scale.height;
    this.toast.setText(text);
    this.toast.setPosition(W * 0.5, H * 0.18);
    this.toast.setVisible(true).setAlpha(1);
    this.tweens.add({
      targets: this.toast, alpha: 0, delay: duration, duration: 250, onComplete: () => this.toast.setVisible(false)
    });
  }

  // button handlers
  _onScan() {
    if (!this._encOK()) return;
    const e = this.state.encounter;
    this._showDetails(e.product);

    // If first time scanning a seller item, adjust ask based on flags:
    // fake = 2/3 of original, danger = 1/3 of original (danger overrides fake).
    if (e.type === 'seller') {
      if (e.origPrice == null) e.origPrice = e.price; // record original
      let newAsk = e.origPrice;
      if (e.product.danger) newAsk = Math.round(e.origPrice * (1/3));
      else if (e.product.fake) newAsk = Math.round(e.origPrice * (2/3));
      e.price = Math.max(1, newAsk);

      // update dialog to reflect hush-discount and reveal negotiation/report buttons
      this._showDialogSeller(e.price, e.product.key); // shows 🤫 New ask + (Orig: ...)
      this._setButtons(['counter','reject','report','deal']);
    }
  }

  _onCounter() {
    if (!this._encOK()) return;
    const e = this.state.encounter;
    const pct = this._randInt(5, 40) / 100;

    if (e.type === 'seller') {
      this.state.counterPending = Math.max(1, Math.round(e.price * (1 - pct)));
      this._showDialogSeller(e.price, e.product.key);
      this._setButtons(['counter','reject','deal']); // can counter again or confirm
    } else {
      this.state.counterPending = Math.max(1, Math.round(e.price * (1 + pct)));
      const num = e.invIndex + 1;
      this._showDialogBuyer(e.price, num);
      this._setButtons(['counter','reject','deal']);
    }
  }

  async _onDealConfirm() {
    if (!this._encOK()) return;
    const e = this.state.encounter;

    let finalPrice = e.price;
    let accepted = true;

    if (this.state.counterPending != null) {
      const delta = Math.abs(this.state.counterPending - e.price) / Math.max(1, e.price);
      const acceptChance = Math.min(1, 0.60 + delta);
      accepted = Math.random() < acceptChance;
      finalPrice = this.state.counterPending;
    } else {
      accepted = true;
      finalPrice = e.price;
    }

    // auto resolve reject
    if (!accepted) {
      const who = e.type === 'seller' ? 'Seller' : 'Buyer';
      this._showToast(`${who} rejected`, 700);

      this.state.counterPending = null;
      this._hideDetails(); this._hideDialog();
      this.state.encounter = null;
      this._setButtons([]);
      await this._despawnCustomer(false, 600);
      if (this.state.running) this._nextEncounter();
      return;
    }

    // accepted
    if (e.type === 'seller') {
      // buy item
      if (this.state.inventory.length >= this.MAX_INV) return;
      this.state.money -= finalPrice;
      this._refreshMoney();
      if (this.state.money < 0 || this.state.money >= 200) return this._gameOver();

      // store both paid & original
      this.state.inventory.push({
        paidPrice: finalPrice,                  // what paid
        originalPrice: e.origPrice ?? finalPrice, // pre-scan ask
        key: e.product.key,
        fake: e.product.fake,
        danger: e.product.danger
      });
      this._refreshInventory();
      this._showToast(`Bought for $${finalPrice}`, 700);
    } else {
      // selling
      const it = e.product;
      let gain = finalPrice;
      let punish = 0;
      const flagsHit = [];

      const basis = (it.fake || it.danger) ? it.originalPrice : it.paidPrice;

      if (it.fake && Math.random() < this.CATCH_PROB_FAKE) {
        punish += basis;                 // penalty = 1 * original
        flagsHit.push('Fake');
      }
      if (it.danger && Math.random() < this.CATCH_PROB_DANGER) {
        punish += basis * 3;             // penalty = 3 * original
        flagsHit.push('Dangerous');
      }

      gain -= punish;

      this.state.money += gain;
      this.state.inventory.splice(e.invIndex, 1);
      this._refreshInventory();
      this._refreshMoney();

      if (punish > 0) {
        const tag = flagsHit.length > 1 ? 'Fake & Dangerous' : flagsHit[0];
        this._showToast(`⚠️ ${tag} caught! –$${Math.round(punish)}`, 900);
      } else {
        this._showToast(`Sold for $${finalPrice}`, 700);
      }


      if (this.state.money < 0 || this.state.money >= 200) return this._gameOver();
      
    }

    // cleanup
    this.state.counterPending = null;
    this.state.encounter = null;
    this._hideDetails(); this._hideDialog();
    this._setButtons([]);
    await this._despawnCustomer(false, 600);
    if (this.state.running) this._nextEncounter();
  }

  async _onReport() {
    if (!this._encOK()) return;
    const e = this.state.encounter;
    if (e.type !== 'seller') return;

    let reward = 0;
    if (e.product.fake) reward += 5;
    if (e.product.danger) reward += 10;
    if (reward === 0) reward = -5; // wrong report penalty

    this.state.money += reward;
    this._refreshMoney();
    if (this.state.money < 0 || this.state.money >= 200) return this._gameOver();

    const msg = reward > 0 ? `Report + $${reward}` : `False Report – $5`;
    this._showToast(msg, 800);

    this.state.counterPending = null;
    this.state.encounter = null;
    this._hideDetails(); this._hideDialog();
    this._setButtons([]);
    await this._despawnCustomer(false, 600);
    if (this.state.running) this._nextEncounter();
  }

  async _onReject() {
    if (!this._encOK()) return;
    this.state.counterPending = null;
    this.state.encounter = null;
    this._hideDetails(); this._hideDialog();
    this._setButtons([]);
    await this._despawnCustomer(false, 600);
    if (this.state.running) this._nextEncounter();
  }

  // utils
  _encOK() { return this.state.running && this.state.customerPresent && this.state.encounter; }
  _randomProductKey() { const keys = Object.keys(this.CATALOG); return keys[Math.floor(Math.random() * keys.length)]; }
  _randRange(a, b) { return a + Math.random() * (b - a); }
  _randInt(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); }

  _getCustomerBottomY() {
    const H = this.scale.height;
    const groundPad = 12;
    const halfH = this.customerSprite.displayHeight / 2;
    const extraDrop = 8; // move customer slightly lower
    return H - groundPad - halfH + extraDrop;
  }
  _getCustomerTargetPos() {
    const W = this.scale.width;
    return { x: W * 0.82, y: this._getCustomerBottomY() };
  }
}
