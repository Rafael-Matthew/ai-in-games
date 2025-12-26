// Terrain class split from main.js
class Terrain {
  data; width; height; time; soundCallback; powerUpList; monsters; spawns; timeLeft; fin; maxFin = 0; lastApocalypsePlayed = 0;
  // Removed recursive getters that caused stack overflow and prevented width/height from being set.
  constructor(initial) {
    this.time = 0; this.powerUpList = [];
    for (let bonus of initial.powerUps) { for (let i = 0; i < bonus.count; i++) this.powerUpList.push(bonus.type); }
    this.width = initial.map[0].length; this.height = initial.map.length; this.monsters = []; this.spawns = []; this.timeLeft = initial.time + 1 + 30; this.fin = [];
    for (let fin of initial.fin) { const finNum = parseInt(fin); this.fin.push(finNum); if (finNum != 255 && finNum > this.maxFin) { this.maxFin = finNum; } }
    this.initialBonus = initial.initialBonus; this.data = new Array(this.width * this.height);
    for (let y = 0; y < this.height; y++) { for (let x = 0; x < this.width; x++) { let src = initial.map[y][x]; const bonusStr = "0123456789AB";
      if (src == "#") this.data[y * this.width + x] = { type: TerrainType.PermanentWall };
      else if (src == "-") this.data[y * this.width + x] = { type: TerrainType.TemporaryWall, image: levelAssets.walls };
      else if (src == "*") { this.spawns.push({ x, y }); this.data[y * this.width + x] = { type: TerrainType.Free }; }
      else if (src == "%") this.data[y * this.width + x] = { type: TerrainType.Rubber };
      else if (bonusStr.includes(src)) { const index = bonusStr.charAt(src); this.data[y * this.width + x] = { type: TerrainType.PowerUp, image: assets.powerups[index], imageIdx: 0, animateDelay: 8, powerUpType: index }; }
      else this.data[y * this.width + x] = { type: TerrainType.Free };
    } }
  }
  spawnMonsters(monsters) { if (!args.includes("-m")) { for (let i = 0; i < 8 - sprites.length; i++) { const monster = monsters[Int.random(monsters.length)]; const spawn = this.spawns[this.generateSpawn()]; this.monsters.push(new Monster(monster, spawn)); } } }
  generateSpawn(spawnIndex = -1) { if (spawnIndex == -1) { let indexList = []; for (let i = 0; i < this.spawns.length; i++) { if (!this.spawns[i].busy) indexList.push(i); } spawnIndex = indexList[Int.random(indexList.length)]; } this.spawns[spawnIndex].busy = true; return spawnIndex; }
  locateSprite(sprite, index = -1) { const spawn = this.spawns[this.generateSpawn(index)]; sprite.x = spawn.x * 16; sprite.y = spawn.y * 16; }
  getCell(x, y) { if (x >= 0 && x < this.width && y >= 0 && y < this.height) return this.data[y * this.width + x]; else return { type: TerrainType.PermanentWall }; }
  setCell(x, y, cell) { this.data[y * this.width + x] = cell; }
  isWalkable(x, y) { let cell = this.getCell(x, y); switch (cell.type) { case TerrainType.Free: case TerrainType.PowerUpFire: return true; case TerrainType.PermanentWall: case TerrainType.Rubber: case TerrainType.Apocalypse: case TerrainType.Fire: return false; case TerrainType.TemporaryWall: case TerrainType.Bomb: return cheats.noClip; default: return true; } }
  update() {
    this.soundsToPlay = {}; this.timeLeft -= 1 / 60; this.time++;
    for (let y = 0; y < this.height; y++) { for (let x = 0; x < this.width; x++) { let cell = this.getCell(x, y);
      if (cell.imageIdx !== undefined) { const animateDelay = cell.animateDelay || 6; if (Int.mod(this.time, animateDelay) == 0) { cell.imageIdx++; if (cell.imageIdx >= cell.image.length) { if (cell.next) this.setCell(x, y, cell.next); else cell.imageIdx = 0; } } }
      if (cell.bombTime) { if (!cell.rcAllowed || !cell.owner.rcAllowed || cell.owner.isDie) cell.bombTime--; if (cell.bombTime == 0 || (cell.owner.rcDitonate && cell.rcAllowed)) { this.ditonateBomb(x, y, cell.maxBoom); continue; } }
      if (cell.type == TerrainType.Bomb) { if (cell.offsetX == 0 && cell.offsetY == 0) { const next = this.getCell(x + getSign(cell.dx), y + getSign(cell.dy)).type; if (next == TerrainType.Rubber) { cell.dx = -cell.dx; cell.dy = -cell.dy; } else if (next != TerrainType.Free) { cell.dy = 0; cell.dx = 0; } }
        const newX = Int.divRound(x * 16 + cell.offsetX + cell.dx, 16); const newY = Int.divRound(y * 16 + cell.offsetY + cell.dy, 16);
        cell.offsetX += cell.dx; cell.offsetY += cell.dy; this.setCell(x, y, { type: TerrainType.Free }); this.setCell(newX, newY, cell); cell.offsetX += (x - newX) * 16; cell.offsetY += (y - newY) * 16; }
    } }
    for (let monster of this.monsters) monster.update();
    for (let i = this.monsters.length - 1; i >= 0; i--) {
      const cellX = Int.divRound(this.monsters[i].x, 16); const cellY = Int.divRound(this.monsters[i].y, 16);
      if (this.monsters[i].frameIndex >= assets.monsters[this.monsters[i].type][4].length - 1) {
        if (this.getCell(cellX, cellY).type == TerrainType.Free) { this.setCell(cellX, cellY, { type: TerrainType.PowerUp, image: assets.powerups[PowerUpType.Life], imageIdx: 0, animateDelay: 8, powerUpType: PowerUpType.Life }); }
        this.monsters.splice(i, 1);
      }
    }
    for (let sprite of sprites) sprite.update(1);
    let playersCount = 0; for (let i = 0; i < sprites.length; i++) { if (!sprites[i].isDie) playersCount++; }
    if (this.timeLeft < 30 && !this.apocalypse) this.apocalypse = 1;
    const speed = mapIndex == 7 ? 4 : 2;
    if (this.apocalypse) {
      if (this.apocalypse % speed == 0) {
        const apocalypse = this.apocalypse / speed;
        for (let i = 0; i < this.fin.length; i++) {
          const x = i % this.width; const y = Int.divFloor(i, this.width); const cell = this.getCell(x, y).type;
          let aMax = 0; for (let a of this.fin) { if (a != 255) { aMax = Math.max(a, aMax); } }
          if (apocalypse == aMax + 1) { if (this.fin[i] == 255 && cell == TerrainType.TemporaryWall) { map.setCell(x, y, { type: TerrainType.PermanentWall, image: levelAssets.walls, imageIdx: 0, animateDelay: 4, next: { type: TerrainType.Free } }); } }
          if (apocalypse == 255) { }
          else if (this.fin[i] == apocalypse || apocalypse == this.maxFin + 16) {
            if (cell.type != TerrainType.PermanentWall) {
              if (cell.type == TerrainType.Bomb) { cell.owner.bombsPlaced--; }
              if (apocalypse == this.maxFin + 16) {
                if (cell.type == TerrainType.TemporaryWall) { this.setCell(x, y, { type: TerrainType.PowerUpFire, image: assets.fire, imageIdx: 0, next: { type: TerrainType.Free } }); }
              } else {
                this.setCell(x, y, { type: TerrainType.Apocalypse, image: levelAssets.permanentWalls, imageIdx: 0, next: { type: TerrainType.Apocalypse, image: levelAssets.permanentWalls } });
              }
              if (this.lastApocalypsePlayed > 5) { this.playSound("sac"); this.lastApocalypsePlayed = 0; }
            }
          }
        }
      }
      this.lastApocalypsePlayed++; this.apocalypse++;
    }
    if (!this.toGameEnd && this.timeLeft < 0) {
      this.toGameEnd = 0;
      for (let y = 0; y < this.height; y++) { for (let x = 0; x < this.width; x++) { let cell = this.getCell(x, y);
        if (cell.type != TerrainType.PermanentWall) {
          this.setCell(x, y, { type: TerrainType.PermanentWall, image: levelAssets.permanentWalls, imageIdx: 0, next: { type: TerrainType.PermanentWall, image: levelAssets.permanentWalls } });
        }
      } }
    }
    if (mapIndex == 6 && this.apocalypse > 5 && Int.random(30) == 0) {
      let direction = Int.random(2);
      this.setCell(direction * 16 + 1, Int.random(6) * 2 + 1, { type: TerrainType.Bomb, image: assets.bomb, imageIdx: 0, animateDelay: 12, bombTime: 210, maxBoom: 3, rcAllowed: false, owner: {}, offsetX: 0, offsetY: 0, dx: direction * -4 + 2, dy: 0, });
    }
    if (playersCount == 1 && sprites.length > 1 && !this.toGameEnd) this.toGameEnd = 60 * 3;
    if (playersCount == 0 && !this.toGameEnd) this.toGameEnd = 60 * 3;
    if (this.toGameEnd) this.toGameEnd--;
    if (this.toGameEnd == 0) {
      fade.fadeOut(() => {
        if (playersCount == 1 && this.timeLeft > 0) { results.win(sprites.find((v) => !v.isDie).controller.id); state = States.results; }
        else { state = States.draw; drawMenu = new DrawMenu(); soundManager.playSound("draw"); }
      });
    }
    if (this.timeLeft < 40 && this.endSound == undefined) { this.endSound = 10; }
    else if (this.timeLeft - 30 < this.endSound && this.timeLeft > 30) { soundManager.playSound("clock"); this.endSound--; }
    if (this.endSound == 2 && !this.time_end_played) { soundManager.playSound("time_end"); this.time_end_played = true; }
    if (this.soundCallback) { for (let sound in this.soundsToPlay) { if (this.soundsToPlay[sound]) { this.soundCallback(sound); } } }
  }
  generateGiven() {
    let rnd = rand();
    if (rnd < 0.5) { const powerUpIndex = Math.floor(rand() * this.powerUpList.length); const powerUpType = this.powerUpList[powerUpIndex]; return { type: TerrainType.PowerUp, image: assets.powerups[powerUpType], imageIdx: 0, animateDelay: 8, powerUpType: powerUpType }; }
    else { return { type: TerrainType.Free }; }
  }
  ditonateBomb(bombX, bombY) {
    const bombCell = this.getCell(bombX, bombY); const maxBoom = bombCell.maxBoom; bombCell.owner.bombsPlaced--;
    let burn = (dx, dy, image, imageEnd) => {
      for (let i = 1; i <= maxBoom; i++) { const x = bombX + i * dx; const y = bombY + i * dy; const cell = map.getCell(x, y);
        if (cell.type == TerrainType.PermanentWall || cell.type == TerrainType.Apocalypse || cell.type == TerrainType.Rubber) break;
        if (cell.type == TerrainType.TemporaryWall) { let next = this.generateGiven(); map.setCell(x, y, { type: TerrainType.PermanentWall, image: levelAssets.walls, imageIdx: 0, animateDelay: 4, next }); break; }
        else if (cell.type == TerrainType.PowerUp) { map.setCell(x, y, { type: TerrainType.PowerUpFire, image: assets.fire, imageIdx: 0, animateDelay: 6, next: { type: TerrainType.Free } }); this.playSound("sac"); break; }
        else if (cell.type == TerrainType.Bomb) { this.ditonateBomb(x, y); break; }
        else if (cell.type == TerrainType.Fire || cell.type == TerrainType.PowerUpFire) { }
        else { map.setCell(x, y, { type: TerrainType.Fire, image: i == maxBoom ? imageEnd : image, imageIdx: 0, next: { type: TerrainType.Free } }); }
      }
    };
    this.playSound("bang");
    map.setCell(bombX, bombY, { type: TerrainType.Fire, image: assets.boomMid, imageIdx: 0, next: { type: TerrainType.Free } });
    burn(1, 0, assets.boomHor, assets.boomRightEnd); burn(-1, 0, assets.boomHor, assets.boomLeftEnd); burn(0, 1, assets.boomVert, assets.boomBottomEnd); burn(0, -1, assets.boomVert, assets.boomTopEnd);
  }
  playSound(sound) { this.soundsToPlay[sound] = true; }
}
