let canvas;
let ctx;

let images;

let bg;

let controllersList = [];
// Global reference to the primary human player's controller id (player1) so
// steering bots can lock behaviors (seek/flee/arrive/pursuit) specifically to that human.
let primaryHumanId = null;
let sprites = [];

let assets;

let soundManager;
let music;

let cheats = {
  noClip: false,
};

let startMenu;

let results;

let levelAssets;

let keyStory = [];

let isPaused = false;

const controlKeys = {
  KeyW: true,
  KeyS: true,
  KeyA: true,
  KeyD: true,
  ControlLeft: true,
  AltLeft: true,
  ArrowUp: true,
  ArrowDown: true,
  ArrowLeft: true,
  ArrowRight: true,
  ControlRight: true,
  AltRight: true,
};

const TerrainType = {
  Free: 0,
  PermanentWall: 1,
  TemporaryWall: 2,
  Bomb: 3,
  PowerUp: 4,
  PowerUpFire: 5,
  Apocalypse: 6,
  Rubber: 7,
};

const PowerUpType = {
  Banana: 0,
  ExtraBomb: 1,
  ExtraFire: 2,
  Skull: 3,
  Shield: 4,
  Life: 5,
  RemoteControl: 6,
  Kick: 7,
  RollerSkate: 8,
  Clock: 9,
  MultiBomb: 10,
};

const Direction = {
  Up: 0,
  Left: 1,
  Right: 2,
  Down: 3,
};

const PlayerKeys = {
  Up: 0,
  Left: 1,
  Right: 2,
  Down: 3,
  Bomb: 4,
  rcDitonate: 5,
};

const States = {
  start: 0,
  game: 1,
  results: 2,
  draw: 3,
  victory: 4,
};

let state = States.game;
let isDemo = true;
let mapIndex;
let mapRandom;

class Terrain {
  data;
  width;
  height;
  time;
  soundCallback;
  powerUpList;
  monsters;
  spawns;
  timeLeft;
  fin;
  maxFin = 0;
  lastApocalypsePlayed = 0;

  get width() {
    return this.width;
  }

  get height() {
    return this.height;
  }

  constructor(initial) {
    this.time = 0;
    this.powerUpList = [];
    for (let bonus of initial.powerUps) {
      for (let i = 0; i < bonus.count; i++) {
        this.powerUpList.push(bonus.type);
      }
    }
    this.width = initial.map[0].length;
    this.height = initial.map.length;
    this.monsters = [];
    this.spawns = [];
    this.timeLeft = initial.time + 1 + 30;
    this.fin = [];
    for (let fin of initial.fin) {
      const finNum = parseInt(fin);
      this.fin.push(finNum);
      if (finNum != 255 && finNum > this.maxFin) {
        this.maxFin = finNum;
      }
    }

    this.initialBonus = initial.initialBonus;

    this.data = new Array(this.width * this.height);

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        let src = initial.map[y][x];
        const bonusStr = "0123456789AB";

        if (src == "#") {
          this.data[y * this.width + x] = {
            type: TerrainType.PermanentWall,
          };
        } else if (src == "-") {
          this.data[y * this.width + x] = {
            type: TerrainType.TemporaryWall,
            image: levelAssets.walls,
          };
        } else if (src == "*") {
          this.spawns.push({ x: x, y: y });
          this.data[y * this.width + x] = {
            type: TerrainType.Free,
          };
        } else if (src == "%") {
          this.data[y * this.width + x] = {
            type: TerrainType.Rubber,
          };
        } else if (bonusStr.includes(src)) {
          const index = bonusStr.charAt(src);
          this.data[y * this.width + x] = {
            type: TerrainType.PowerUp,
            image: assets.powerups[index],
            imageIdx: 0,
            animateDelay: 8,
            powerUpType: index,
          };
        } else {
          this.data[y * this.width + x] = {
            type: TerrainType.Free,
          };
        }
      }
    }
  }

  spawnMonsters(monsters) {
    if (!args.includes("-m")) {
      for (let i = 0; i < 8 - sprites.length; i++) {
        const monster = monsters[Int.random(monsters.length)];
        const spawn = this.spawns[this.generateSpawn()];
        this.monsters.push(new Monster(monster, spawn));
      }
    }
  }

  generateSpawn(spawnIndex = -1) {
    if (spawnIndex == -1) {
      let indexList = [];
      for (let i = 0; i < this.spawns.length; i++) {
        if (!this.spawns[i].busy) {
          indexList.push(i);
        }
      }
      spawnIndex = indexList[Int.random(indexList.length)];
    }
    this.spawns[spawnIndex].busy = true;
    return spawnIndex;
  }

  locateSprite(sprite, index = -1) {
    const spawn = this.spawns[this.generateSpawn(index)];
    sprite.x = spawn.x * 16;
    sprite.y = spawn.y * 16;
  }

  getCell(x, y) {
    if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
      return this.data[y * this.width + x];
    } else {
      return {
        type: TerrainType.PermanentWall,
      };
    }
  }

  setCell(x, y, cell) {
    this.data[y * this.width + x] = cell;
  }

  isWalkable(x, y) {
    let cell = this.getCell(x, y);

    switch (cell.type) {
      case TerrainType.Free:
      case TerrainType.PowerUpFire:
        return true;

      case TerrainType.PermanentWall:
      case TerrainType.Rubber:
      case TerrainType.Apocalypse:
        return false;

      case TerrainType.TemporaryWall:
      case TerrainType.Bomb:
        return cheats.noClip;

      default:
        return true;
    }
  }

  update() {
    this.soundsToPlay = {};
    this.timeLeft -= 1 / 60;

    this.time++;

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        let cell = this.getCell(x, y);

        if (cell.imageIdx !== undefined) {
          const animateDelay = cell.animateDelay || 6;
          if (Int.mod(this.time, animateDelay) == 0) {
            cell.imageIdx++;
            if (cell.imageIdx >= cell.image.length) {
              if (cell.next) {
                this.setCell(x, y, cell.next);
              } else {
                cell.imageIdx = 0;
              }
            }
          }
        }

        if (cell.bombTime) {
          if (!cell.rcAllowed || !cell.owner.rcAllowed || cell.owner.isDie) {
            cell.bombTime--;
          }

          if (cell.bombTime == 0 || (cell.owner.rcDitonate && cell.rcAllowed)) {
            this.ditonateBomb(x, y, cell.maxBoom);
            continue;
          }
        }

        if (cell.type == TerrainType.Bomb) {
          if (cell.offsetX == 0 && cell.offsetY == 0) {
            const next = this.getCell(
              x + getSign(cell.dx),
              y + getSign(cell.dy)
            ).type;
            if (next == TerrainType.Rubber) {
              cell.dx = -cell.dx;
              cell.dy = -cell.dy;
            } else if (next != TerrainType.Free) {
              cell.dy = 0;
              cell.dx = 0;
            }
          }

          const newX = Int.divRound(x * 16 + cell.offsetX + cell.dx, 16);
          const newY = Int.divRound(y * 16 + cell.offsetY + cell.dy, 16);

          cell.offsetX += cell.dx;
          cell.offsetY += cell.dy;

          this.setCell(x, y, {
            type: TerrainType.Free,
          });

          this.setCell(newX, newY, cell);

          cell.offsetX += (x - newX) * 16;
          cell.offsetY += (y - newY) * 16;
        }
      }
    }

    for (let monster of this.monsters) {
      monster.update();
    }
    for (let i = this.monsters.length - 1; i >= 0; i--) {
      const cellX = Int.divRound(this.monsters[i].x, 16);
      const cellY = Int.divRound(this.monsters[i].y, 16);

      if (
        this.monsters[i].frameIndex >=
        assets.monsters[this.monsters[i].type][4].length - 1
      ) {
        if (this.getCell(cellX, cellY).type == TerrainType.Free) {
          this.setCell(cellX, cellY, {
            type: TerrainType.PowerUp,
            image: assets.powerups[PowerUpType.Life],
            imageIdx: 0,
            animateDelay: 8,
            powerUpType: PowerUpType.Life,
          });
        }
        this.monsters.splice(i, 1);
      }
    }

    for (let sprite of sprites) {
      sprite.update(1);
    }

    let playersCount = 0;

    for (let i = 0; i < sprites.length; i++) {
      if (!sprites[i].isDie) {
        playersCount++;
      }
    }

    if (this.timeLeft < 30 && !this.apocalypse) {
      this.apocalypse = 1;
    }

    const speed = mapIndex == 7 ? 4 : 2;
    if (this.apocalypse) {
      if (this.apocalypse % speed == 0) {
        const apocalypse = this.apocalypse / speed;
        for (let i = 0; i < this.fin.length; i++) {
          const x = i % this.width;
          const y = Int.divFloor(i, this.width);
          const cell = this.getCell(x, y).type;

          let aMax = 0;
          for (let a of this.fin) {
            if (a != 255) {
              aMax = Math.max(a, aMax);
            }
          }

          if (apocalypse == aMax + 1) {
            if (this.fin[i] == 255 && cell == TerrainType.TemporaryWall) {
              map.setCell(x, y, {
                type: TerrainType.PermanentWall,
                image: levelAssets.walls,
                imageIdx: 0,
                animateDelay: 4,
                next: {
                  type: TerrainType.Free,
                },
              });
            }
          }
          if (apocalypse == 255) {
          } else if (
            this.fin[i] == apocalypse ||
            apocalypse == this.maxFin + 16
          ) {
            if (cell.type != TerrainType.PermanentWall) {
              if (cell.type == TerrainType.Bomb) {
                cell.owner.bombsPlaced--;
              }
              if (apocalypse == this.maxFin + 16) {
                if (cell.type == TerrainType.TemporaryWall) {
                  this.setCell(x, y, {
                    type: TerrainType.PowerUpFire,
                    image: assets.fire,
                    imageIdx: 0,
                    next: {
                      type: TerrainType.Free,
                    },
                  });
                }
              } else {
                this.setCell(x, y, {
                  type: TerrainType.Apocalypse,
                  image: levelAssets.permanentWalls,
                  imageIdx: 0,
                  next: {
                    type: TerrainType.Apocalypse,
                    image: levelAssets.permanentWalls,
                  },
                });
              }

              if (this.lastApocalypsePlayed > 5) {
                this.playSound("sac");
                this.lastApocalypsePlayed = 0;
              }
            }
          }
        }
      }
      this.lastApocalypsePlayed++;
      this.apocalypse++;
    }

    if (!this.toGameEnd && this.timeLeft < 0) {
      this.toGameEnd = 0;

      for (let y = 0; y < this.height; y++) {
        for (let x = 0; x < this.width; x++) {
          let cell = this.getCell(x, y);

          if (cell.type != TerrainType.PermanentWall) {
            // TODO: track bombs.
            // TODO: use apocalypse map.
            this.setCell(x, y, {
              type: TerrainType.PermanentWall,
              image: levelAssets.permanentWalls,
              imageIdx: 0,
              next: {
                type: TerrainType.PermanentWall,
                image: levelAssets.permanentWalls,
              },
            });
          }
        }
      }
    }
    if (mapIndex == 6 && this.apocalypse > 5 && Int.random(30) == 0) {
      let direction = Int.random(2);
      this.setCell(direction * 16 + 1, Int.random(6) * 2 + 1, {
        type: TerrainType.Bomb,
        image: assets.bomb,
        imageIdx: 0,
        animateDelay: 12,
        bombTime: 210,
        maxBoom: 3,
        rcAllowed: false,
        owner: {},
        offsetX: 0,
        offsetY: 0,
        dx: direction * -4 + 2,
        dy: 0,
      });
    }
    if (playersCount == 1 && sprites.length > 1 && !this.toGameEnd) {
      this.toGameEnd = 60 * 3;
    }
    if (playersCount == 0 && !this.toGameEnd) {
      this.toGameEnd = 60 * 3;
    }

    if (this.toGameEnd) {
      this.toGameEnd--;
    }

    if (this.toGameEnd == 0) {
      fade.fadeOut(() => {
        if (playersCount == 1 && this.timeLeft > 0) {
          results.win(sprites.find((v) => !v.isDie).controller.id);
          state = States.results;
        } else {
          state = States.draw;
          drawMenu = new DrawMenu();
          soundManager.playSound("draw");
        }
      });
    }

    if (this.timeLeft < 40 && this.endSound == undefined) {
      this.endSound = 10;
    } else if (this.timeLeft - 30 < this.endSound && this.timeLeft > 30) {
      soundManager.playSound("clock");
      this.endSound--;
    }
    if (this.endSound == 2 && !this.time_end_played) {
      soundManager.playSound("time_end");
      this.time_end_played = true;
    }

    if (this.soundCallback) {
      for (let sound in this.soundsToPlay) {
        if (this.soundsToPlay[sound]) {
          this.soundCallback(sound);
        }
      }
    }
  }
  generateGiven() {
    let rnd = rand();
    if (rnd < 0.5) {
      const powerUpIndex = Math.floor(rand() * this.powerUpList.length);
      const powerUpType = this.powerUpList[powerUpIndex];
      return {
        type: TerrainType.PowerUp,
        image: assets.powerups[powerUpType],
        imageIdx: 0,
        animateDelay: 8,
        powerUpType: powerUpType,
      };
    } else {
      return {
        type: TerrainType.Free,
      };
    }
  }

  ditonateBomb(bombX, bombY) {
    const bombCell = this.getCell(bombX, bombY);
    const maxBoom = bombCell.maxBoom;
    bombCell.owner.bombsPlaced--;

    let burn = (dx, dy, image, imageEnd) => {
      for (let i = 1; i <= maxBoom; i++) {
        const x = bombX + i * dx;
        const y = bombY + i * dy;
        const cell = map.getCell(x, y);

        if (
          cell.type == TerrainType.PermanentWall ||
          cell.type == TerrainType.Apocalypse ||
          cell.type == TerrainType.Rubber
        ) {
          break;
        }

        if (cell.type == TerrainType.TemporaryWall) {
          let next = this.generateGiven();
          map.setCell(x, y, {
            type: TerrainType.PermanentWall,
            image: levelAssets.walls,
            imageIdx: 0,
            animateDelay: 4,
            next: next,
          });
          break;
        } else if (cell.type == TerrainType.PowerUp) {
          map.setCell(x, y, {
            type: TerrainType.PowerUpFire,
            image: assets.fire,
            imageIdx: 0,
            animateDelay: 6,
            next: {
              type: TerrainType.Free,
            },
          });
          this.playSound("sac");
          break;
        } else if (cell.type == TerrainType.Bomb) {
          this.ditonateBomb(x, y);
          break;
        } else if (
          cell.type == TerrainType.Fire ||
          cell.type == TerrainType.PowerUpFire
        ) {
        } else {
          map.setCell(x, y, {
            type: TerrainType.Fire,
            image: i == maxBoom ? imageEnd : image,
            imageIdx: 0,
            next: {
              type: TerrainType.Free,
            },
          });
        }
      }
    };

    this.playSound("bang");

    map.setCell(bombX, bombY, {
      type: TerrainType.Fire,
      image: assets.boomMid,
      imageIdx: 0,
      next: {
        type: TerrainType.Free,
      },
    });

    burn(1, 0, assets.boomHor, assets.boomRightEnd);
    burn(-1, 0, assets.boomHor, assets.boomLeftEnd);
    burn(0, 1, assets.boomVert, assets.boomBottomEnd);
    burn(0, -1, assets.boomVert, assets.boomTopEnd);
  }

  playSound(sound) {
    this.soundsToPlay[sound] = true;
  }

  buildDangerGrid() {
    if (!map) return null;
    const width = map.width;
    const height = map.height;
    const INF = 9999;
    const danger = Array.from({ length: height }, () => Array(width).fill(INF));
    const directions = [
      { x: 0, y: -1 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
      { x: 1, y: 0 },
    ];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const cell = map.getCell(x, y);
        if (!cell) continue;
        if (cell.type === TerrainType.Apocalypse) {
          danger[y][x] = 0;
          continue;
        }
        if (cell.type === TerrainType.PowerUpFire) {
          danger[y][x] = 0;
          continue;
        }
        if (cell.type === TerrainType.Bomb) {
          const fuse = Math.max(0, cell.bombTime ?? 0);
          const radius = cell.maxBoom ?? 1;
          danger[y][x] = Math.min(danger[y][x], fuse);
          for (let dir of directions) {
            for (let step = 1; step <= radius; step++) {
              const nx = x + dir.x * step;
              const ny = y + dir.y * step;
              const targetCell = map.getCell(nx, ny);
              if (!targetCell) break;
              if (targetCell.type === TerrainType.PermanentWall) break;
              danger[ny][nx] = Math.min(danger[ny][nx], fuse);
              if (
                targetCell.type === TerrainType.TemporaryWall ||
                targetCell.type === TerrainType.Bomb ||
                targetCell.type === TerrainType.Apocalypse
              ) {
                break;
              }
            }
          }
        }
      }
    }
    return danger;
  }

  planSafePath(originX, originY, dangerGrid) {
    if (!map || !dangerGrid) {
      return {
        path: [],
        nextDir: null,
        destination: { x: originX, y: originY },
      };
    }
    const width = map.width;
    const height = map.height;
    const visited = Array.from({ length: height }, () =>
      Array(width).fill(false)
    );
    const queue = [];
    const prev = Array.from({ length: height }, () => Array(width).fill(null));
    queue.push({ x: originX, y: originY });
    visited[originY][originX] = true;
    const origin = { x: originX, y: originY };
    let bestNode = { x: originX, y: originY };
    let bestScore = this.scoreTile(originX, originY, dangerGrid, origin);
    const neighborDefs = [
      { dir: PlayerKeys.Up, dx: 0, dy: -1 },
      { dir: PlayerKeys.Down, dx: 0, dy: 1 },
      { dir: PlayerKeys.Left, dx: -1, dy: 0 },
      { dir: PlayerKeys.Right, dx: 1, dy: 0 },
    ];

    while (queue.length) {
      const node = queue.shift();
      for (let n of neighborDefs) {
        const nx = node.x + n.dx;
        const ny = node.y + n.dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        if (visited[ny][nx]) continue;
        if (!map.isWalkable(nx, ny)) continue;
        const tileDanger = dangerGrid[ny][nx];
        if (tileDanger <= 5) continue;
        visited[ny][nx] = true;
        prev[ny][nx] = { x: node.x, y: node.y, dir: n.dir };
        queue.push({ x: nx, y: ny });
        const score = this.scoreTile(nx, ny, dangerGrid, origin);
        if (score > bestScore) {
          bestScore = score;
          bestNode = { x: nx, y: ny };
        }
      }
    }

    const path = [];
    let cursor = bestNode;
    while (cursor.x !== originX || cursor.y !== originY) {
      const step = prev[cursor.y]?.[cursor.x];
      if (!step) break;
      path.push(step.dir);
      cursor = { x: step.x, y: step.y };
    }
    path.reverse();
    return {
      path,
      nextDir: path.length ? path[0] : null,
      destination: bestNode,
      score: bestScore,
    };
  }

  scoreTile(x, y, dangerGrid, origin) {
    const baseDanger = dangerGrid[y] ? dangerGrid[y][x] : 0;
    let score = baseDanger === 9999 ? 9999 : baseDanger;
    const cell = map.getCell(x, y);
    if (cell && cell.type === TerrainType.PowerUp) score += 120;
    if (cell && cell.type === TerrainType.Free) score += 10;
    if (cell && cell.type === TerrainType.Rubber) score -= 10;
    const dist = Math.abs(x - origin.x) + Math.abs(y - origin.y);
    score -= dist * 2;
    return score;
  }

  shouldDropBomb(selfSprite, targetSprite, safePlan, dangerGrid) {
    if (!targetSprite || !safePlan || !dangerGrid) return false;
    if (this.bombCooldown > 0) return false;
    if (selfSprite.bombsPlaced >= selfSprite.maxBombsCount) return false;
    const sx = Math.round(selfSprite.x / 16);
    const sy = Math.round(selfSprite.y / 16);
    const tx = Math.round(targetSprite.x / 16);
    const ty = Math.round(targetSprite.y / 16);
    const sameRow = sy === ty;
    const sameCol = sx === tx;
    if (!sameRow && !sameCol) return false;
    if (!this.hasLineOfSight(sx, sy, tx, ty)) return false;
    if (!safePlan.path || !safePlan.path.length) return false;
    const dir = safePlan.path[0];
    if (dir == null) {
      if (!this.safeStepExists(sx, sy, dangerGrid)) return false;
    }
    const deltas = {
      [PlayerKeys.Up]: { x: 0, y: -1 },
      [PlayerKeys.Down]: { x: 0, y: 1 },
      [PlayerKeys.Left]: { x: -1, y: 0 },
      [PlayerKeys.Right]: { x: 1, y: 0 },
    };
    if (dir != null) {
      const step = deltas[dir];
      if (!step) return false;
      const nx = sx + step.x;
      const ny = sy + step.y;
      const destDanger = dangerGrid[ny] ? dangerGrid[ny][nx] : Infinity;
      if (destDanger <= this.stepDangerBuffer) return false;
    }
    return true;
  }

  hasLineOfSight(x1, y1, x2, y2) {
    if (!map) return false;
    if (x1 === x2) {
      const minY = Math.min(y1, y2);
      const maxY = Math.max(y1, y2);
      for (let y = minY + 1; y < maxY; y++) {
        const cell = map.getCell(x1, y);
        if (
          cell.type === TerrainType.PermanentWall ||
          cell.type === TerrainType.TemporaryWall
        ) {
          return false;
        }
      }
      return true;
    }
    if (y1 === y2) {
      const minX = Math.min(x1, x2);
      const maxX = Math.max(x1, x2);
      for (let x = minX + 1; x < maxX; x++) {
        const cell = map.getCell(x, y1);
        if (
          cell.type === TerrainType.PermanentWall ||
          cell.type === TerrainType.TemporaryWall
        ) {
          return false;
        }
      }
      return true;
    }
    return false;
  }

  shouldClearObstacle(selfSprite, dangerGrid) {
    if (!map || !dangerGrid) return false;
    if (this.bombCooldown > 0) return false;
    if (selfSprite.bombsPlaced >= selfSprite.maxBombsCount) return false;
    const sx = Math.round(selfSprite.x / 16);
    const sy = Math.round(selfSprite.y / 16);
    const neighbors = [
      { dx: 0, dy: -1 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 1, dy: 0 },
    ];
    let hasTarget = false;
    for (let n of neighbors) {
      const cell = map.getCell(sx + n.dx, sy + n.dy);
      if (!cell) continue;
      if (
        cell.type === TerrainType.TemporaryWall ||
        cell.type === TerrainType.PowerUp
      ) {
        hasTarget = true;
        break;
      }
    }
    if (!hasTarget) return false;
    return this.safeStepExists(sx, sy, dangerGrid);
  }

  safeStepExists(x, y, dangerGrid) {
    const options = [
      { dx: 0, dy: -1 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 1, dy: 0 },
    ];
    for (let o of options) {
      const nx = x + o.dx;
      const ny = y + o.dy;
      if (!map.isWalkable(nx, ny)) continue;
      const danger = dangerGrid[ny] ? dangerGrid[ny][nx] : Infinity;
      if (danger > this.stepDangerBuffer) return true;
    }
    return false;
  }
}

// Source: https://en.wikipedia.org/wiki/Pseudorandom_number_generator#Implementation
let seed = Math.random();

function rand() {
  seed++;
  let a = seed * 15485863;
  return ((a * a * a) % 2038074743) / 2038074743;
}

class Int {
  static mod(val, divider) {
    return Math.floor(val) % divider;
  }

  static divFloor(val, divider) {
    return Math.floor(val / divider);
  }

  static divCeil(val, divider) {
    return Math.floor((val + divider - 1) / divider);
  }

  static divRound(val, divider) {
    return Math.round(val / divider);
  }

  static random(max) {
    return Math.floor(rand() * max);
  }
}

let map;
let roundNumber = 0; // counts rounds since app start; first game = 0

let keys = {};

addEventListener("load", function () {
  init();
});

function newMap(index = -1) {
  /*
  // First round override: force blank map with 8 spawn points, no monsters, no obstacles
  if (roundNumber === 0) {
    const blankWidth = 19; // keep consistent width for HUD layout
    const blankHeight = 13;
    // Create empty interior bordered by walls, with 8 spawn markers (*) at corners + midpoints
    const rows = [];
    for (let y = 0; y < blankHeight; y++) {
      if (y === 0 || y === blankHeight - 1) {
        rows.push("#".repeat(blankWidth));
      } else {
        // build inner row
        let row = "#";
        for (let x = 1; x < blankWidth - 1; x++) {
          row += " ";
        }
        row += "#";
        rows.push(row);
      }
    }
    // Place 8 spawn markers: 4 corners inside + 4 edge midpoints
    const spawnPositions = [
      { x: 1, y: 1 },
      { x: blankWidth - 2, y: 1 },
      { x: 1, y: blankHeight - 2 },
      { x: blankWidth - 2, y: blankHeight - 2 },
      { x: Math.floor(blankWidth / 2), y: 1 },
      { x: Math.floor(blankWidth / 2), y: blankHeight - 2 },
      { x: 1, y: Math.floor(blankHeight / 2) },
      { x: blankWidth - 2, y: Math.floor(blankHeight / 2) },
    ];
    for (const sp of spawnPositions) {
      const chars = rows[sp.y].split("");
      chars[sp.x] = "*";
      rows[sp.y] = chars.join("");
    }
    const blankMap = {
      map: rows,
      powerUps: [],
      monsters: [],
      time: 60, // shorter intro round
      fin: defaultFin, // pattern ignored when apocalypseDisabled true
      apocalypseDisabled: true,
    };
    levelAssets = assets.levels[0]; // reuse first level assets for blank
    mapIndex = 0; // display background 0 but logical is blank
    const rv = new Terrain(blankMap);
    rv.soundCallback = function (sound) {
      soundManager.playSound(sound);
    };
    return rv;
  }
  */
  if (args.includes("-l")) {
    index = parseInt(args[args.findIndex((v) => v == "-l") + 1]);
  }
  if (index == -1) {
    // Always pick a random map (pure random, allowing repeats)
    index = Int.random(maps.length);
  }

  levelAssets = assets.levels[index];

  mapIndex = index;
  const initial = maps[index];
  const rv = new Terrain(initial);

  rv.soundCallback = function (sound) {
    soundManager.playSound(sound);
  };

  return rv;
}

let args = [];

function updateArgs() {
  let hash = decodeURI(location.hash);
  hash = hash.replace("#", "");
  console.log(hash);
  args = hash.split(" ");
  if (args.includes("--noclip")) {
    cheats.noClip = true;
  }
  if (args.includes("--god")) {
    cheats.god = true;
  }
  if (args.includes("-z")) {
    music.stop();
  }
}

let inApp = false;

async function init() {
  if (document.location.toString().includes("mrboom.app/index.html")) {
    inApp = true;
  } else if (
    new URLSearchParams(document.location.search).get("mode") == "app"
  ) {
    inApp = true;
  }

  mapRandom = new UnrepeatableRandom();

  assets = await loadAssets();

  soundManager = new SoundManager();
  (async function () {
    try {
      await soundManager.init();
    } catch (e) {
      console.error("Error while loading audo assets: ", e);
    }
  })();

  music = new MusicManager([
    "music/anar11.mp3",
    "music/chipmunk.mp3",
    "music/chiptune.mp3",
    "music/deadfeel.mp3",
    "music/drop.mp3",
    "music/external.mp3",
    "music/matkamie.mp3",
    "music/unreeeal.mp3",
  ]);

  map = newMap();
  startMenu = new StartMenu();

  if (inApp) {
    document.getElementById("insert-coin").remove();
    isDemo = false;
    state = States.splash;
    splash = new Splash();
  } else {
    document.getElementById("insert-coin").addEventListener("click", start);
    startGame([]);
  }

  canvas = document.getElementById("grafic");
  ctx = canvas.getContext("2d", { alpha: false });

  updateArgs();
  addEventListener("hashchange", updateArgs());

  MainLoop.setBegin(begin);
  MainLoop.setUpdate(update);
  MainLoop.setDraw(drawAll);
  MainLoop.setEnd(end);
  MainLoop.start();

  addEventListener("keydown", function (e) {
    keys[e.code] = true;
    if (controlKeys[e.code]) {
      e.preventDefault();
      e.stopPropagation();
    }
    keyStory.push(e.code);
    // Spawn a bot on start screen when pressing the "B" key
    if (
      e.code == "KeyB" &&
      state == States.start &&
      startMenu &&
      startMenu.addBot
    ) {
      startMenu.addBot();
    }
    if (checkEnd(keyStory, "IDDQD")) {
      console.log("God mode activated");
      for (let sprite of sprites) {
        sprite.unplugin = 999999;
        sprite.blinking = 999999;
        sprite.blinkingSpeed = 30;
      }
    }
    if (checkEnd(keyStory, "IDCLEV$")) {
      const char = keyStory[keyStory.length - 1][5];
      const index = (parseInt(char) - 1) % maps.length;
      if (index != undefined && !isNaN(index)) {
        map = newMap(index);
        startGame(startMenu.playerList);
      }
    }
    console.log(e.code);
    if (e.code == "KeyP" && state == States.game && !isDemo) {
      isPaused = !isPaused;
      console.log("p");
      // assets.pause.tick = 0;
    }
  });

  addEventListener("keyup", function (e) {
    keys[e.code] = false;

    if (controlKeys[e.code]) {
      e.preventDefault();
      e.stopPropagation();
    }
  });

  controllersList.push(
    new KeyboardController(
      "KeyW",
      "KeyS",
      "KeyA",
      "KeyD",
      "ControlLeft",
      "AltLeft"
    )
  );
  controllersList.push(
    new KeyboardController(
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "ControlRight",
      "AltRight"
    )
  );
  addEventListener("gamepadconnected", function (e) {
    ctrl = new GamepadController(e.gamepad);
    controllersList.push(ctrl);
  });
}

function checkEnd(array, search) {
  if (array.length >= search.length) {
    let areEqual = true;
    for (let i = 0; i < search.length; i++) {
      if (
        array[array.length - search.length + i] != "Key" + search[i] &&
        search[i] != "$"
      ) {
        areEqual = false;
        break;
      }
    }
    return areEqual;
  }
  return false;
}

function start() {
  fade.fadeOut(() => {
    startMenu = new StartMenu();

    document.body.setAttribute("state", "game");
    sprites = [];
    map = newMap();

    state = States.start;

    music.start(3);
  });
}

const helpText =
  "welcome to mr.boom v0.1!   right keyboard controller:   " +
  "players can join using their drop bomb button   use enter or lt and rt on gamepad" +
  "controller to start game   " +
  "use arrows to move   use ctr to drop bomb   use alt to triger it by radio control   " +
  "gamepad controller:   use d-pad arrows to move   use   use b button to drop bomb  " +
  "use a button to triger it by radio control";

function begin(timestamp, delta) {
  for (let c of controllersList) {
    c.update();
  }
}

let pauseIdx = 0;
function update(deltaTime) {
  if (state == States.game) {
    if (!isPaused) {
      map.update();
    } else {
      pauseIdx += 0.04;
    }
  } else if (state == States.start) {
    startMenu.update();
  } else if (state == States.results) {
    results.update();
  } else if (state == States.victory) {
    victory.update();
  } else if (state == States.draw) {
    drawMenu.update();
  } else if (state == States.splash) {
    splash.update();
  }
}

let menustep = 0;

const alpha = "abcdefghijklmnopqrstuvwxyz0123456789!.-:/()?";
function drawString(ctx, x, y, str, alphaImageName = "original") {
  for (let i = 0; i < str.length; i++) {
    const index = alpha.indexOf(str[i]);
    if (index != -1) {
      assets.alpha[alphaImageName][index].draw(ctx, x + i * 8, y);
    }
  }
}

class Splash {
  frame = 0;

  constructor() {
    fade.fadeIn();
  }

  update() {
    this.frame++;
    if (this.frame == 90) {
      start();
    }
  }
}

class StartMenu {
  constructor() {
    fade.fadeIn();
    this.humanCount = 0;
    this.botCount = 0;
  }

  update() {
    this.subtitlesMove++;
    if (this.subtitlesMove > helpText.length * 8 + 320) {
      this.subtitlesMove = 0;
    }

    let isGamepadStart = false;

    for (let controller of controllersList) {
      controller.update();
      if (
        controller.playerKeys[PlayerKeys.Bomb] &&
        !controller.id &&
        !controller.isDemo
      ) {
        const id = Int.random(1000000);
        const name = "p" + (this.humanCount + 1); // use lowercase because font alpha only has lowercase
        this.playerList.push({ id: id, name: name, controller: controller });
        controller.id = id;
        this.humanCount++;
        soundManager.playSound("addplayer");
      }
      if (controller.gamepad) {
        const buttons = controller.gamepad.buttons;
        if (buttons[6].pressed && buttons[7].pressed) {
          isGamepadStart = true;
        }
      }
    }

    if (keys["Enter"] || isGamepadStart) {
      // Before starting, ensure auto roster (1 human + 5 bots) is present if user hasn't manually added.
      ensureAutoSpawnRoster(this);
      if (this.playerList.length >= 1) {
        fade.fadeOut(() => {
          isDemo = false;
          music.next();
          map = newMap();
          startGame(this.playerList);
          results = new Results(this.playerList);
        });
      }
    }

    this.frame++;
  }

  playerList = [];
  subtitlesMove = 0;
  frame = 0;

  addBot() {
    if (this.playerList.length >= 8) return; // max players
    const botIndex = this.botCount + 1; // 1-based
    let controller;
    // Player1 targeting: we resolve at runtime using primaryHumanId stored after startGame.
    const player1Getter = (self) => {
      if (!primaryHumanId) return null;
      const target = sprites.find(
        (s) => s.controller && s.controller.id === primaryHumanId && !s.isDie
      );
      // Ensure not self and alive
      if (target && target !== self) return target;
      return null;
    };
    if (botIndex === 1) {
      controller = new SteeringController("seek", player1Getter);
    } else if (botIndex === 2) {
      controller = new SteeringController("flee", player1Getter);
    } else if (botIndex === 3) {
      controller = new SteeringController("arrive", player1Getter);
    } else if (botIndex === 4) {
      controller = new SteeringController("wander");
    } else if (botIndex === 5) {
      controller = new SteeringController("pursuit", player1Getter);
    } else {
      controller = new IdleController();
    }
    const id = Int.random(1000000);
    controller.id = id;
    const name = "bot" + botIndex;
    this.playerList.push({ id: id, name: name, controller: controller });
    this.botCount++;
    soundManager.playSound("addplayer");
  }
}

let victory;
let drawMenu;
let splash;

class Results {
  frame = 0;
  results = [];
  coins = [];
  next;

  constructor(playerList) {
    this.results = [];
    for (let player of playerList) {
      this.results.push({
        name: player.name,
        id: player.controller.id,
        wins: 0,
      });
    }
  }

  win(id) {
    const index = this.results.findIndex((v) => v.id == id);
    fade.fadeIn();

    this.results[index].wins++;
    console.log(index);
    this.coins = [];
    // animate 0: none, 1: blink, 2: round
    const positions = [
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 3 },
      { x: 0, y: 4 },
      { x: 1, y: 3 },
      { x: 1, y: 4 },
    ];
    for (let i = 0; i < this.results.length; i++) {
      for (let j = 0; j < this.results[i].wins; j++) {
        this.coins.push({
          y: positions[i].y * 42 + 27,
          x: positions[i].x * 161 + 44 + j * 23,
          frame: 0,
          animate: j == this.results[i].wins - 1 && index == i ? 1 : 2,
          animateDelay: 1 / (4 + j / 2),
        });
      }
    }
    this.next = "game";
    for (let p of this.results) {
      if (p.wins >= 5) {
        this.next = index;
      }
    }
    this.frame = 0;
    soundManager.playSound("victory");
  }

  update() {
    for (let coin of this.coins) {
      if (coin.animate == 2) {
        coin.frame -= coin.animateDelay;
      }
    }

    if (getKeysDownCount() > 0 && this.frame > 120) {
      fade.fadeOut(() => {
        if (this.next == "game") {
          map = newMap();
          startGame(startMenu.playerList);
        } else {
          victory = new Victory(this.next);
          state = States.victory;
        }
      });
    }

    this.frame++;
  }
}

class Victory {
  sprite;
  frame = 0;

  constructor(index) {
    fade.fadeIn();
    this.sprite = { idx: 0, img: sprites[index].animations[0] };
  }

  update() {
    this.sprite.idx += 0.05;
    this.frame += 0.2;
    if (getKeysDownCount() > 0 && this.frame > 24) {
      fade.fadeOut(() => {
        startMenu = new StartMenu();
        music.start(3);
        state = States.start;
        for (let ctr of controllersList) {
          ctr.id = undefined;
        }
      });
    }
  }
}

class DrawMenu {
  constructor() {
    fade.fadeIn();
  }

  update() {
    this.frame++;
    if (getKeysDownCount() > 0 && this.frame > 120) {
      fade.fadeOut(() => {
        map = newMap();
        startGame(startMenu.playerList);
      });
    }
  }

  frame = 0;
}

let fade = {
  fade: 0,
  direction: 0,

  fadeIn: function () {
    if (this.direction >= 0) {
      this.fade = 15;
      this.direction = -1;
    }
  },
  fadeOut: function (action) {
    if ((this.direction <= 0 && this.fade == 15) || this.fade == 0) {
      this.fade = 0;
      this.direction = 1;
    }
    this.action = action;
  },
  update: function () {
    this.fade += this.direction;

    if (this.direction > 0 && this.fade >= 15) {
      this.direction = 0;
      if (this.action) {
        this.action();
      }
    } else if (this.direction < 0 && this.fade <= 0) {
      this.direction = 0;
    }
  },
  getOpacity: function () {
    return this.fade == 0 ? 0 : Math.abs(this.fade / 15);
  },
};

function drawAll(interpolationPercentage) {
  // Extended color list for up to 8 players
  const colors = [
    "magenta",
    "red",
    "blue",
    "green",
    "yellow",
    "cyan",
    "orange",
    "white",
  ];

  if (state == States.game) {
    if (mapIndex == 3) {
      for (let y = 0; y < 5; y++) {
        for (let x = 0; x < 8; x++) {
          assets.sky.draw(
            ctx,
            48 * 8 -
              (Math.floor(map.time / 2 + x * 48 + y * 24) % (48 * 8)) -
              48,
            y * 44
          );
        }
      }
    }

    levelAssets.background[
      Math.floor(map.timeLeft * 2) % levelAssets.background.length
    ].draw(ctx, 0, 0);
    levelAssets.background.time += 1 / 30;

    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const cell = map.getCell(x, y);

        if (cell.image) {
          const image = cell.image[cell.imageIdx || 0];
          const offsetX = cell.offsetX || 0;
          const offsetY = cell.offsetY || 0;

          image.draw(
            ctx,
            x * 16 + 8 + 8 - Int.divFloor(image.rect.width, 2) + offsetX,
            y * 16 + 16 - image.rect.height + offsetY
          );
        }
      }
    }

    var spritesToDraw = sprites.concat(map.monsters);
    spritesToDraw.sort((a, b) => {
      let result = a.y - b.y;
      if (result === 0) {
        return (a.isPlayer || false) - (b.isPlayer || false);
      }
      return result;
    });

    for (let sprite of spritesToDraw) {
      sprite.draw(ctx);
    }

    // draw player names
    for (let sprite of sprites) {
      if (sprite.playerName && !sprite.isDie) {
        const name = sprite.playerName;
        const width = name.length * 8; // each character 8px
        // sprite horizontal center is at sprite.x + 16 (see Sprite.draw offset +8+8)
        const nameX = Math.round(sprite.x + 16 - width / 2);
        // keep previous vertical offset (can tweak later if needed)
        const nameY = Math.round(sprite.y - 14);
        // use original (yellow) color as requested
        drawString(ctx, nameX, nameY, name, "original");
      }
    }

    for (let overlay of levelAssets.overlays) {
      overlay.images[Math.floor(overlay.idx) % overlay.images.length].draw(
        ctx,
        overlay.x,
        overlay.y
      );
      overlay.idx += overlay.animateDelay;
    }

    if (map.timeLeft > 30) {
      let min = Math.floor((map.timeLeft - 30) / 60);
      let sec = Math.floor((map.timeLeft - 30) % 60);
      if (sec < 10) {
        sec = "0" + sec;
      }
      let time = min + ":" + sec;
      let x = 270;
      for (let char of time) {
        const alpha = "0123456789:";
        const index = alpha.indexOf(char);
        assets.bigDigits[index].draw(ctx, x, 182);
        if (index == 10) {
          x += 9;
        } else {
          x += 14;
        }
      }
    }

    if (isPaused) {
      assets.pause[Int.mod(pauseIdx, 4)].draw(
        ctx,
        320 / 2 - 48 / 2,
        200 / 2 - 64 / 2
      );
    }
  } else if (state == States.start) {
    assets.start.draw(ctx, 0, 0);
    // Show 8 slots: two rows of 4 (indices 0-3 top, 4-7 bottom)
    for (let i = 0; i < 8; i++) {
      const row = Int.divFloor(i, 4); // 0 or 1
      const col = i % 4;
      const color = colors[Int.divFloor(i, 2)];
      const player = startMenu.playerList[i];
      const baseY = row == 0 ? 78 : 78 + 72; // second row offset
      const baseX = col * 80;
      if (player) {
        drawString(ctx, 13 + baseX, baseY, "name ?", color);
        drawString(ctx, 21 + baseX, baseY + 10, player.name, color);
      } else if (Int.mod(menustep, 4) == 0) {
        drawString(ctx, baseX + 20, baseY, "join", color);
        drawString(ctx, baseX + 28, baseY + 10, "us", color);
        drawString(ctx, baseX + 28, baseY + 20, "!!", color);
      } else if (Int.mod(menustep, 4) == 2) {
        drawString(ctx, baseX + 20, baseY, "push", color);
        drawString(ctx, baseX + 20, baseY + 10, "fire", color);
        drawString(ctx, baseX + 28, baseY + 20, "!!", color);
      }
    }
    menustep += 1 / 100;

    drawString(ctx, 320 - startMenu.subtitlesMove, 192, helpText, "white");
  } else if (state == States.draw) {
    assets.draw[Math.floor(drawMenu.frame / 20) % 2].draw(ctx, 0, 0);
  } else if (state == States.splash) {
    assets.splash.draw(ctx, 0, 0);
  } else if (state == States.results) {
    assets.med.draw(ctx, 0, 0);

    for (let coin of results.coins) {
      if (coin.animate != 1 || results.frame % 60 < 30) {
        assets.coin[Math.abs(Math.floor(coin.frame) % assets.coin.length)].draw(
          ctx,
          coin.x,
          coin.y
        );
      }
    }

    const positions = [
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 3 },
      { x: 0, y: 4 },
      { x: 1, y: 3 },
      { x: 1, y: 4 },
    ];
    for (let i = 0; i < positions.length; i++) {
      if (results.results[i]) {
        drawString(
          ctx,
          positions[i].x * 161 + 10,
          positions[i].y * 42 + 44,
          results.results[i].name,
          colors[Int.divFloor(i, 2)]
        );
      }
    }
  } else if (state == States.victory) {
    assets.vic[Math.floor(victory.frame) % 4].draw(ctx, 0, 0);
    victory.sprite.img[Math.floor(victory.sprite.idx) % 4].draw(
      ctx,
      Math.round(320 / 2 - victory.sprite.img[0].rect.width / 2),
      80 - victory.sprite.img[0].rect.height
    );
  }

  fade.update();
  if (fade.getOpacity() > 0) {
    ctx.fillStyle = "rgba(0,0,0," + fade.getOpacity() + ")";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  if (isDemo) {
    const insertCoinCtx = document
      .getElementById("insert-coin")
      .getContext("2d");
    const indexes = [1, 0, 1, 2];
    assets.insertCoin[indexes[Math.floor(map.time / 30) % 4]].draw(
      insertCoinCtx,
      0,
      0
    );
  }
}

function startGame(playerList) {
  state = States.game;
  //map = newMap();
  sprites = [];
  fade.fadeIn();

  if (isDemo) {
    sprite = new Sprite(2);
    sprite.controller = new DemoController("lbrdwbulllwbrrddwbuulllw", sprite);
    map.locateSprite(sprite, 1);
    sprites.push(sprite);

    sprite = new Sprite(0);
    let spawn = 2;
    if (mapIndex == 0) spawn = 4;
    else if (mapIndex == 1) spawn = 2;
    //else if (mapIndex == 2) spawn = 3;
    map.locateSprite(sprite, spawn);
    sprites.push(sprite);
    sprite.controller = new DemoController(
      "lbrdwwbulllwwbrrddwwbuulllww",
      sprite
    );

    sprite = new Sprite(1);
    map.locateSprite(sprite, 0);
    sprites.push(sprite);
    sprite.controller = new DemoController(
      "rbldwwburrrwwbllddwwbuurrrww",
      sprite
    );

    if (!results) {
      let players = [];
      for (let p of sprites) {
        players.push({
          name: "bot",
          controller: p.controller,
        });
      }
      results = new Results(players);
    }
  } else {
    for (let i = 0; i < playerList.length; i++) {
      sprite = new Sprite(i);
      map.locateSprite(sprite);
      sprite.controller = playerList[i].controller;
      // store player name on sprite so drawAll can render it
      sprite.playerName = playerList[i].name;
      sprites.push(sprite);
      // Capture the first non-bot (human) as primaryHumanId once at game start
      if (!primaryHumanId) {
        const nameLower = (playerList[i].name || "").toLowerCase();
        // Convention: human players are named p1, p2, etc. We pick the very first (p1) as the anchor.
        if (nameLower === "p1") {
          primaryHumanId = playerList[i].controller.id;
        }
      }
    }
    // Fallback: if no explicit p1 found (e.g., auto-spawn scenario below), treat first human (by insertion order) as primary.
    if (!primaryHumanId) {
      const human = playerList.find(
        (p) => p.name && p.name.toLowerCase().startsWith("p")
      );
      if (human) primaryHumanId = human.controller.id;
    }
  }

  // Spawn monsters ("bebek") only after the first round so round 1 is completely safe/empty.
  if (roundNumber > 0 || isDemo) {
    map.spawnMonsters(maps[mapIndex].monsters);
  }
  // Increment round counter only for real (non-demo) games so demo loop doesn't consume the blank first round
  if (!isDemo) roundNumber++;

  music.next();
}

// Auto-spawn helper: ensure exactly 1 human (p1) and 5 bots with fixed behaviors before the game starts
// Call this before transitioning to game state if user hasn't manually added them.
function ensureAutoSpawnRoster(startMenu) {
  if (startMenu.playerList.length === 0) {
    // Create a keyboard human controller if none exists (reuse first existing controller if available)
    let humanController =
      controllersList.find((c) => !c.isDemo && !c.gamepad) ||
      controllersList[0];
    if (!humanController) return; // cannot proceed
    if (!humanController.id) humanController.id = Int.random(1000000);
    startMenu.playerList.push({
      id: humanController.id,
      name: "p1",
      controller: humanController,
    });
    startMenu.humanCount = 1;
  }
  // Only auto-fill bots if the user hasn't added any manually (playing alone)
  // If user added bots (length > 1), respect their setup.
  if (startMenu.playerList.length === 1) {
    while (startMenu.playerList.length < 6) {
      startMenu.addBot();
    }
  }
}

function end(fps, panic) {
  if (panic) {
    // This pattern introduces non-deterministic behavior, but in this case
    // it's better than the alternative (the application would look like it
    // was running very quickly until the simulation caught up to real
    // time). See the documentation for `MainLoop.setEnd()` for additional
    // explanation.
    var discardedTime = Math.round(MainLoop.resetFrameDelta());
    console.warn(
      "Main loop panicked, probably because the browser tab was put in the background. Discarding " +
        discardedTime +
        "ms"
    );
  }
}

function getKeysDownCount() {
  let keyCount = 0;
  for (let key of Object.values(keys)) {
    if (key) {
      keyCount++;
    }
  }
  for (let ctr of controllersList) {
    ctr.update();
    for (let key of ctr.playerKeys) {
      if (key) {
        keyCount++;
      }
    }
  }
  if (isDemo) keyCount++;

  return keyCount;
}

class KeyboardController {
  playerKeys;
  keyUp;
  keyDown;
  keyLeft;
  keyRight;
  keyBomb;
  keyRcDitonate;

  constructor(keyUp, keyDown, keyLeft, keyRight, keyBomb, keyRcDitonate) {
    this.keyUp = keyUp;
    this.keyDown = keyDown;
    this.keyLeft = keyLeft;
    this.keyRight = keyRight;
    this.keyBomb = keyBomb;
    this.keyRcDitonate = keyRcDitonate;
    this.playerKeys = [];
  }

  update() {
    this.playerKeys[PlayerKeys.Up] = keys[this.keyUp];
    this.playerKeys[PlayerKeys.Down] = keys[this.keyDown];
    this.playerKeys[PlayerKeys.Left] = keys[this.keyLeft];
    this.playerKeys[PlayerKeys.Right] = keys[this.keyRight];
    this.playerKeys[PlayerKeys.Bomb] = keys[this.keyBomb];
    this.playerKeys[PlayerKeys.rcDitonate] = keys[this.keyRcDitonate];
  }
}

class GamepadController {
  playerKeys;
  gamepad;

  constructor(gamepad) {
    this.gamepad = gamepad;
    this.playerKeys = [];
    this.sprite = null;
  }

  update() {
    const deadZone = 0.5;
    const currGamePad = navigator.getGamepads()[this.gamepad.index];
    this.playerKeys = [];

    if (currGamePad.axes[1] < -deadZone) this.playerKeys[PlayerKeys.Up] = true;
    if (currGamePad.axes[1] > deadZone) this.playerKeys[PlayerKeys.Down] = true;
    if (currGamePad.axes[0] < -deadZone)
      this.playerKeys[PlayerKeys.Left] = true;
    if (currGamePad.axes[0] > deadZone)
      this.playerKeys[PlayerKeys.Right] = true;

    if (currGamePad.buttons[12].pressed) this.playerKeys[PlayerKeys.Up] = true;
    if (currGamePad.buttons[13].pressed)
      this.playerKeys[PlayerKeys.Down] = true;
    if (currGamePad.buttons[14].pressed)
      this.playerKeys[PlayerKeys.Left] = true;
    if (currGamePad.buttons[15].pressed)
      this.playerKeys[PlayerKeys.Right] = true;
    this.playerKeys[PlayerKeys.Bomb] = currGamePad.buttons[1].pressed;
    this.playerKeys[PlayerKeys.rcDitonate] = currGamePad.buttons[0].pressed;
  }
}

// Simple idle bot controller: never presses any key
class IdleController {
  playerKeys;
  constructor() {
    this.playerKeys = []; // never set movement or bomb keys
  }
}

// SteeringController untuk berbagai perilaku: seek, flee, arrive, wander, pursuit
class SteeringController {
  constructor(mode, getTargetSprite) {
    this.mode = mode; // 'seek','flee','arrive','wander','pursuit'
    this.playerKeys = [];
    this.getTargetSprite = getTargetSprite; // function returning a sprite (untuk pursuit / seek / flee / arrive)
    // wander state
    this.wanderDir = null; // salah satu PlayerKeys
    this.wanderTimer = 0;
    this.wanderOrigin = null; // {x,y} tile spawn location for wander confinement
    this.wanderRadius = 5; // tiles
    this.dangerThreshold = 45;
    this.stepDangerBuffer = 20;
    this.bombCooldown = 0;
    this.currentSafePlan = null;
  }

  update() {
    this.playerKeys = [];
    const selfSprite = sprites.find((s) => s.controller === this);
    if (!selfSprite || !map) return;
    if (this.bombCooldown > 0) this.bombCooldown--;
    const tileX = Math.round(selfSprite.x / 16);
    const tileY = Math.round(selfSprite.y / 16);

    // Helper convert direction enum to dx,dy
    const deltas = {
      [PlayerKeys.Up]: { x: 0, y: -1 },
      [PlayerKeys.Down]: { x: 0, y: 1 },
      [PlayerKeys.Left]: { x: -1, y: 0 },
      [PlayerKeys.Right]: { x: 1, y: 0 },
    };

    const dangerGrid = this.buildDangerGrid();
    const safePlan = this.planSafePath(tileX, tileY, dangerGrid);
    this.currentSafePlan = safePlan;
    const currentDanger =
      dangerGrid && dangerGrid[tileY] ? dangerGrid[tileY][tileX] : Infinity;
    const forceEscape = currentDanger <= this.dangerThreshold;

    const enforceSafeDir = (dir) => {
      if (dir == null) return null;
      const d = deltas[dir];
      if (!d) return null;
      const nx = tileX + d.x;
      const ny = tileY + d.y;
      if (!map.isWalkable(nx, ny)) return null;
      if (!dangerGrid || !dangerGrid[ny]) return dir;
      const destDanger = dangerGrid[ny][nx];
      if (destDanger <= this.stepDangerBuffer) {
        if (safePlan && safePlan.nextDir != null && safePlan.nextDir !== dir) {
          const alt = safePlan.nextDir;
          const ad = deltas[alt];
          if (ad) {
            const ax = tileX + ad.x;
            const ay = tileY + ad.y;
            const altDanger = dangerGrid[ay] ? dangerGrid[ay][ax] : Infinity;
            if (altDanger > this.stepDangerBuffer && map.isWalkable(ax, ay)) {
              return alt;
            }
          }
        }
        return null;
      }
      return dir;
    };

    let issuedMove = false;

    const chooseWalk = (dir) => {
      if (!dir) return;
      dir = enforceSafeDir(dir);
      if (dir == null) return;
      const d = deltas[dir];
      const cx = Math.round(selfSprite.x / 16);
      const cy = Math.round(selfSprite.y / 16);
      if (map.isWalkable(cx + d.x, cy + d.y)) {
        this.playerKeys[dir] = true;
        issuedMove = true;
      }
    };

    if (forceEscape && safePlan && safePlan.nextDir != null) {
      chooseWalk(safePlan.nextDir);
      return;
    }

    const pickDirToward = (tx, ty) => {
      const cx = Math.round(selfSprite.x / 16);
      const cy = Math.round(selfSprite.y / 16);
      const options = [];
      if (ty < cy) options.push(PlayerKeys.Up);
      if (ty > cy) options.push(PlayerKeys.Down);
      if (tx < cx) options.push(PlayerKeys.Left);
      if (tx > cx) options.push(PlayerKeys.Right);
      // Prioritize axis with larger distance
      const dx = Math.abs(tx - cx);
      const dy = Math.abs(ty - cy);
      options.sort((a, b) => {
        const da = a === PlayerKeys.Left || a === PlayerKeys.Right ? dx : dy;
        const db = b === PlayerKeys.Left || b === PlayerKeys.Right ? dx : dy;
        return db - da; // besar dulu
      });
      for (let dir of options) {
        const d = deltas[dir];
        if (map.isWalkable(cx + d.x, cy + d.y)) return dir;
      }
      // A* fallback pathfinding (grid, 4-arah) untuk mendapatkan langkah pertama menuju target.
      // Caching: gunakan hasil 15 frame jika target masih di tile sama.
      if (!this._pathCache) this._pathCache = {};
      const cacheKey = cx + "," + cy + ":" + tx + "," + ty;
      const frameNow =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      // simple time-based expiry (approx frame grouping) atau jika cache diset  sebelumnya
      const cached = this._pathCache[cacheKey];
      if (cached && frameNow - cached.t < 250) {
        return cached.firstDir || null;
      }
      // Jika sangat dekat ke target, gunakan TTL lebih pendek agar koreksi lebih cepat
      const manhattan = Math.abs(cx - tx) + Math.abs(cy - ty);
      const cacheTTL = manhattan <= 4 ? 80 : 250; // ms

      const h = (x, y) => Math.abs(x - tx) + Math.abs(y - ty);
      const open = [];
      const pushOpen = (node) => {
        open.push(node);
        // simple insertion sort end (small list expected) for f ascending
        let i = open.length - 1;
        while (i > 0 && open[i].f < open[i - 1].f) {
          const tmp = open[i - 1];
          open[i - 1] = open[i];
          open[i] = tmp;
          i--;
        }
      };
      const startNode = { x: cx, y: cy, g: 0, f: h(cx, cy) };
      pushOpen(startNode);
      const cameFrom = new Map(); // key => {px,py}
      const gScore = new Map();
      const keyOf = (x, y) => x + "," + y;
      gScore.set(keyOf(cx, cy), 0);
      const closed = new Set();
      const maxExpanded = 400; // limit safety
      let expanded = 0;
      let found = null;
      while (open.length && expanded < maxExpanded) {
        const current = open.shift();
        const ck = keyOf(current.x, current.y);
        if (closed.has(ck)) continue;
        closed.add(ck);
        expanded++;
        if (current.x === tx && current.y === ty) {
          found = current;
          break;
        }
        for (let dir of [
          PlayerKeys.Up,
          PlayerKeys.Down,
          PlayerKeys.Left,
          PlayerKeys.Right,
        ]) {
          const d = deltas[dir];
          const nx = current.x + d.x;
          const ny = current.y + d.y;
          const nk = keyOf(nx, ny);
          if (closed.has(nk)) continue;
          if (!map.isWalkable(nx, ny)) continue;
          const tentativeG = current.g + 1;
          const prevG = gScore.has(nk) ? gScore.get(nk) : Infinity;
          if (tentativeG < prevG) {
            cameFrom.set(nk, { x: current.x, y: current.y });
            gScore.set(nk, tentativeG);
            const f = tentativeG + h(nx, ny);
            pushOpen({ x: nx, y: ny, g: tentativeG, f });
          }
        }
      }
      let firstDir = null;
      if (found) {
        // Reconstruct path backwards, find first step from (cx,cy)
        let path = [];
        let cur = { x: found.x, y: found.y };
        while (!(cur.x === cx && cur.y === cy)) {
          path.push(cur);
          const parent = cameFrom.get(keyOf(cur.x, cur.y));
          if (!parent) break; // should not happen
          cur = parent;
        }
        path.reverse();
        if (path.length) {
          const nx = path[0].x;
          const ny = path[0].y;
          if (ny < cy) firstDir = PlayerKeys.Up;
          else if (ny > cy) firstDir = PlayerKeys.Down;
          else if (nx < cx) firstDir = PlayerKeys.Left;
          else if (nx > cx) firstDir = PlayerKeys.Right;
        }
      }
      this._pathCache[cacheKey] = { firstDir, t: frameNow, ttl: cacheTTL };
      return firstDir;
    };

    const pickDirAway = (tx, ty) => {
      const toward = pickDirToward(tx, ty);
      if (!toward) return null;
      const opposite = {
        [PlayerKeys.Up]: PlayerKeys.Down,
        [PlayerKeys.Down]: PlayerKeys.Up,
        [PlayerKeys.Left]: PlayerKeys.Right,
        [PlayerKeys.Right]: PlayerKeys.Left,
      };
      const opp = opposite[toward];
      const d = deltas[opp];
      const cx = Math.round(selfSprite.x / 16);
      const cy = Math.round(selfSprite.y / 16);
      if (d && map.isWalkable(cx + d.x, cy + d.y)) return opp;
      return null;
    };

    const targetSprite = this.getTargetSprite
      ? this.getTargetSprite(selfSprite)
      : null;

    if (this.mode === "wander") {
      // Record origin first time
      if (!this.wanderOrigin) {
        this.wanderOrigin = {
          x: Math.round(selfSprite.x / 16),
          y: Math.round(selfSprite.y / 16),
        };
      }
      if (this.wanderTimer <= 0 || !this.wanderDir) {
        const dirs = [
          PlayerKeys.Up,
          PlayerKeys.Down,
          PlayerKeys.Left,
          PlayerKeys.Right,
        ];
        const cx = Math.round(selfSprite.x / 16);
        const cy = Math.round(selfSprite.y / 16);
        const walkable = dirs.filter((d) => {
          const dd = deltas[d];
          return map.isWalkable(cx + dd.x, cy + dd.y);
        });
        // Constrain within radius: if outside radius boundary on any axis, bias inward
        const constrained = [];
        for (let d of walkable) {
          const dd = deltas[d];
          const nx = cx + dd.x;
          const ny = cy + dd.y;
          const dist =
            Math.abs(nx - this.wanderOrigin.x) +
            Math.abs(ny - this.wanderOrigin.y);
          if (dist <= this.wanderRadius) constrained.push(d);
        }
        if (walkable.length) {
          const pickFrom = constrained.length ? constrained : walkable;
          this.wanderDir =
            pickFrom[Math.floor(Math.random() * pickFrom.length)];
        }
        this.wanderTimer = 30; // frames
      } else {
        this.wanderTimer--;
        // If we drifted outside radius, force choose a direction inward next tick
        const cx = Math.round(selfSprite.x / 16);
        const cy = Math.round(selfSprite.y / 16);
        const distNow =
          Math.abs(cx - this.wanderOrigin.x) +
          Math.abs(cy - this.wanderOrigin.y);
        if (distNow > this.wanderRadius) this.wanderTimer = 0;
      }
      chooseWalk(this.wanderDir);
      return;
    }

    if (!targetSprite) return; // behavior but no target yet
    const tx = Math.round(targetSprite.x / 16);
    const ty = Math.round(targetSprite.y / 16);

    // Separation helper: evaluasi apakah tile tujuan ditempati bot lain (bukan target)
    const isOccupiedByOther = (cx, cy, dir) => {
      const d = deltas[dir];
      const nx = cx + d.x;
      const ny = cy + d.y;
      for (let s of sprites) {
        if (s === selfSprite || s.isDie) continue;
        const sx = Math.round(s.x / 16);
        const sy = Math.round(s.y / 16);
        if (sx === nx && sy === ny) {
          // Jika itu target, kita tetap boleh menumpuk (untuk capture). Selain itu, hindari.
          if (s !== targetSprite) return true;
        }
      }
      return false;
    };

    const applySeparation = (proposedDir) => {
      if (!proposedDir) return proposedDir;
      const cx = Math.round(selfSprite.x / 16);
      const cy = Math.round(selfSprite.y / 16);
      if (!isOccupiedByOther(cx, cy, proposedDir)) return proposedDir;
      // Cari alternatif lain yang masih mendekati (untuk seek/arrive/pursuit) atau menjauh (flee)
      const candidateDirs = [
        PlayerKeys.Up,
        PlayerKeys.Down,
        PlayerKeys.Left,
        PlayerKeys.Right,
      ];
      // Filter walkable dan tidak ditempati
      const free = candidateDirs.filter((d) => {
        const delta = deltas[d];
        const nx = cx + delta.x;
        const ny = cy + delta.y;
        return map.isWalkable(nx, ny) && !isOccupiedByOther(cx, cy, d);
      });
      if (!free.length) return proposedDir; // tidak ada opsi lain
      // Heuristik sesuai mode
      if (this.mode === "flee") {
        // pilih yang paling jauh dari target
        let best = proposedDir;
        let bd = -1;
        for (let d of free) {
          const delta = deltas[d];
          const nx = cx + delta.x;
          const ny = cy + delta.y;
          const dist = Math.abs(nx - tx) + Math.abs(ny - ty);
          if (dist > bd) {
            bd = dist;
            best = d;
          }
        }
        return best;
      } else {
        // untuk seek/arrive/pursuit: pilih yang mendekatkan (jarak lebih kecil)
        let best = proposedDir;
        let bd = Infinity;
        for (let d of free) {
          const delta = deltas[d];
          const nx = cx + delta.x;
          const ny = cy + delta.y;
          const dist = Math.abs(nx - tx) + Math.abs(ny - ty);
          if (dist < bd) {
            bd = dist;
            best = d;
          }
        }
        return best;
      }
    };

    if (this.mode === "seek") {
      let dir = pickDirToward(tx, ty);
      dir = applySeparation(dir);
      chooseWalk(dir);
    } else if (this.mode === "flee") {
      // Pilih arah yang memaksimalkan jarak Manhattan dari target (p1)
      const cx = Math.round(selfSprite.x / 16);
      const cy = Math.round(selfSprite.y / 16);
      let bestDir = null;
      let bestDist = -1;
      for (let dir of [
        PlayerKeys.Up,
        PlayerKeys.Down,
        PlayerKeys.Left,
        PlayerKeys.Right,
      ]) {
        const d = deltas[dir];
        const nx = cx + d.x;
        const ny = cy + d.y;
        if (!map.isWalkable(nx, ny)) continue;
        const md = Math.abs(nx - tx) + Math.abs(ny - ty);
        if (md > bestDist) {
          bestDist = md;
          bestDir = dir;
        }
      }
      // fallback jika semua tidak walkable
      let dir = bestDir || pickDirAway(tx, ty) || pickDirToward(tx, ty);

      // Tambahan logika flee: panic radius & variasi agar tidak statis
      const fleeOriginDist = Math.abs(cx - tx) + Math.abs(cy - ty);
      const PANIC_RADIUS = 5; // jika dalam radius ini, selalu coba bergerak menjauh
      if (fleeOriginDist <= PANIC_RADIUS) {
        // Pastikan benar-benar menjauh: evaluasi dua langkah ke depan jika mungkin
        let candidates = [
          PlayerKeys.Up,
          PlayerKeys.Down,
          PlayerKeys.Left,
          PlayerKeys.Right,
        ].filter((k) => map.isWalkable(cx + deltas[k].x, cy + deltas[k].y));
        // Skor: jarak setelah langkah + sedikit random agar tidak sinkron dengan bot lain
        const scored = candidates.map((k) => {
          const nx = cx + deltas[k].x;
          const ny = cy + deltas[k].y;
          const d1 = Math.abs(nx - tx) + Math.abs(ny - ty);
          // Dua langkah prediksi (approx): tambah lagi jarak ke arah yang sama bila walkable
          let d2 = d1;
          const nx2 = nx + deltas[k].x;
          const ny2 = ny + deltas[k].y;
          if (map.isWalkable(nx2, ny2)) {
            d2 = Math.abs(nx2 - tx) + Math.abs(ny2 - ty);
          }
          const noise = Math.random() * 0.3; // variasi kecil
          return { k, score: d2 + noise };
        });
        if (scored.length) {
          scored.sort((a, b) => b.score - a.score);
          dir = scored[0].k;
        }
      } else {
        // Di luar panic radius: sekali-sekali (10%) ubah arah untuk menghindari buntu
        if (Math.random() < 0.1) {
          const alt = [
            PlayerKeys.Up,
            PlayerKeys.Down,
            PlayerKeys.Left,
            PlayerKeys.Right,
          ]
            .filter(
              (k) =>
                k !== dir && map.isWalkable(cx + deltas[k].x, cy + deltas[k].y)
            )
            .sort(() => Math.random() - 0.5);
          if (alt.length) dir = alt[0];
        }
      }
      dir = applySeparation(dir);
      chooseWalk(dir);
    } else if (this.mode === "arrive") {
      // Arrive capture: selalu bergerak sampai tepat di tile target, dengan perlambatan halus
      const cx = Math.round(selfSprite.x / 16);
      const cy = Math.round(selfSprite.y / 16);
      const dist = Math.abs(cx - tx) + Math.abs(cy - ty);
      if (!selfSprite.baseSpeed) selfSprite.baseSpeed = selfSprite.speed;
      if (dist > 6) {
        selfSprite.speed = selfSprite.baseSpeed;
        let dir = pickDirToward(tx, ty);
        dir = applySeparation(dir);
        chooseWalk(dir);
      } else if (dist > 0) {
        // dist 1..6: skala linear; makin dekat makin lambat tapi tetap bergerak
        const factor = Math.max(0.25, dist / 6); // minimal 25%
        selfSprite.speed = selfSprite.baseSpeed * factor;
        let dir = pickDirToward(tx, ty);
        dir = applySeparation(dir);
        chooseWalk(dir);
      } else {
        // sudah tepat di tile target -> tetap diam (speed dikembalikan agar siap jika target pindah)
        selfSprite.speed = selfSprite.baseSpeed;
      }
    } else if (this.mode === "pursuit") {
      // Adaptive pursuit:
      // 1. Hitung velocity tile target (vx, vy)
      // 2. Lead adaptif berdasar jarak & kestabilan arah
      // 3. Jika prediksi membuat jarak memburuk beberapa frame -> fallback ke seek sementara
      // 4. Reset path cache bila terjadi miss berat agar replan cepat
      if (!this._lastTargetPos) this._lastTargetPos = { x: tx, y: ty };
      const vx = tx - this._lastTargetPos.x;
      const vy = ty - this._lastTargetPos.y;
      this._lastTargetPos = { x: tx, y: ty };

      const cx = Math.round(selfSprite.x / 16);
      const cy = Math.round(selfSprite.y / 16);
      const distNow = Math.abs(cx - tx) + Math.abs(cy - ty);
      if (!this._distHistory) this._distHistory = [];
      this._distHistory.push(distNow);
      if (this._distHistory.length > 6) this._distHistory.shift();

      // Simpan history arah target untuk cek kestabilan
      if (!this._dirHistory) this._dirHistory = [];
      const normDir =
        vx === 0 && vy === 0 ? null : { x: Math.sign(vx), y: Math.sign(vy) };
      if (normDir) this._dirHistory.push(normDir);
      if (this._dirHistory.length > 5) this._dirHistory.shift();
      const stable =
        this._dirHistory.length >= 3 &&
        this._dirHistory.every(
          (d) => d.x === this._dirHistory[0].x && d.y === this._dirHistory[0].y
        );

      // Lead adaptif: proporsi jarak / 4, dibatasi 0..3
      let lead = Math.min(3, Math.max(0, Math.floor(distNow / 4)));
      if (!stable) lead = Math.min(1, lead); // jika tidak stabil kurangi lead
      if (vx === 0 && vy === 0) lead = 0; // target diam -> tidak perlu prediksi jauh

      // Deteksi miss: jika dua frame terakhir jarak meningkat & lead > 0 -> kurangi agresivitas
      if (this._distHistory.length >= 3) {
        const L = this._distHistory.length;
        if (
          this._distHistory[L - 1] > this._distHistory[L - 2] &&
          this._distHistory[L - 2] > this._distHistory[L - 3]
        ) {
          // tiga kenaikan berturut -> miss
          if (!this._missFrames) this._missFrames = 0;
          this._missFrames++;
        } else {
          this._missFrames = 0;
        }
      }
      if (this._missFrames && this._missFrames > 1) {
        // turunkan lead saat miss
        lead = Math.max(0, lead - 1);
      }
      if (this._missFrames && this._missFrames > 3) {
        // Hard reset: full seek selama beberapa frame
        lead = 0;
        if (this._pathCache) this._pathCache = {}; // buang rencana lama
      }

      const px = tx + vx * lead;
      const py = ty + vy * lead;
      // Jika prediksi sama dengan target (lead 0) akan jatuh ke seek biasa
      let dir = pickDirToward(px, py) || pickDirToward(tx, ty);
      dir = applySeparation(dir);
      chooseWalk(dir);
    }

    if (this.shouldDropBomb(selfSprite, targetSprite, safePlan, dangerGrid)) {
      this.playerKeys[PlayerKeys.Bomb] = true;
      this.bombCooldown = 45;
    } else if (this.shouldClearObstacle(selfSprite, dangerGrid)) {
      this.playerKeys[PlayerKeys.Bomb] = true;
      this.bombCooldown = 60;
    }

    if (!issuedMove && safePlan && safePlan.nextDir != null) {
      chooseWalk(safePlan.nextDir);
    }
  }

  buildDangerGrid() {
    if (!map) return null;
    const width = map.width;
    const height = map.height;
    const INF = 9999;
    const danger = Array.from({ length: height }, () => Array(width).fill(INF));
    const directions = [
      { x: 0, y: -1 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
      { x: 1, y: 0 },
    ];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const cell = map.getCell(x, y);
        if (!cell) continue;
        if (cell.type === TerrainType.Apocalypse) {
          danger[y][x] = 0;
          continue;
        }
        if (cell.type === TerrainType.PowerUpFire) {
          danger[y][x] = 0;
          continue;
        }
        if (cell.type === TerrainType.Bomb) {
          const fuse = Math.max(0, cell.bombTime ?? 0);
          const radius = cell.maxBoom ?? 1;
          danger[y][x] = Math.min(danger[y][x], fuse);
          for (let dir of directions) {
            for (let step = 1; step <= radius; step++) {
              const nx = x + dir.x * step;
              const ny = y + dir.y * step;
              const targetCell = map.getCell(nx, ny);
              if (!targetCell) break;
              if (targetCell.type === TerrainType.PermanentWall) break;
              danger[ny][nx] = Math.min(danger[ny][nx], fuse);
              if (
                targetCell.type === TerrainType.TemporaryWall ||
                targetCell.type === TerrainType.Bomb ||
                targetCell.type === TerrainType.Apocalypse
              ) {
                break;
              }
            }
          }
        }
      }
    }
    return danger;
  }

  planSafePath(originX, originY, dangerGrid) {
    if (!map || !dangerGrid) {
      return {
        path: [],
        nextDir: null,
        destination: { x: originX, y: originY },
      };
    }
    const width = map.width;
    const height = map.height;
    const visited = Array.from({ length: height }, () =>
      Array(width).fill(false)
    );
    const queue = [];
    const prev = Array.from({ length: height }, () => Array(width).fill(null));
    queue.push({ x: originX, y: originY });
    visited[originY][originX] = true;
    const origin = { x: originX, y: originY };
    let bestNode = { x: originX, y: originY };
    let bestScore = this.scoreTile(originX, originY, dangerGrid, origin);
    const neighborDefs = [
      { dir: PlayerKeys.Up, dx: 0, dy: -1 },
      { dir: PlayerKeys.Down, dx: 0, dy: 1 },
      { dir: PlayerKeys.Left, dx: -1, dy: 0 },
      { dir: PlayerKeys.Right, dx: 1, dy: 0 },
    ];

    while (queue.length) {
      const node = queue.shift();
      for (let n of neighborDefs) {
        const nx = node.x + n.dx;
        const ny = node.y + n.dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        if (visited[ny][nx]) continue;
        if (!map.isWalkable(nx, ny)) continue;
        const tileDanger = dangerGrid[ny][nx];
        if (tileDanger <= 5) continue;
        visited[ny][nx] = true;
        prev[ny][nx] = { x: node.x, y: node.y, dir: n.dir };
        queue.push({ x: nx, y: ny });
        const score = this.scoreTile(nx, ny, dangerGrid, origin);
        if (score > bestScore) {
          bestScore = score;
          bestNode = { x: nx, y: ny };
        }
      }
    }

    const path = [];
    let cursor = bestNode;
    while (cursor.x !== originX || cursor.y !== originY) {
      const step = prev[cursor.y]?.[cursor.x];
      if (!step) break;
      path.push(step.dir);
      cursor = { x: step.x, y: step.y };
    }
    path.reverse();
    return {
      path,
      nextDir: path.length ? path[0] : null,
      destination: bestNode,
      score: bestScore,
    };
  }

  scoreTile(x, y, dangerGrid, origin) {
    const baseDanger = dangerGrid[y] ? dangerGrid[y][x] : 0;
    let score = baseDanger === 9999 ? 9999 : baseDanger;
    const cell = map.getCell(x, y);
    if (cell && cell.type === TerrainType.PowerUp) score += 120;
    if (cell && cell.type === TerrainType.Free) score += 10;
    if (cell && cell.type === TerrainType.Rubber) score -= 10;
    const dist = Math.abs(x - origin.x) + Math.abs(y - origin.y);
    score -= dist * 2;
    return score;
  }

  shouldDropBomb(selfSprite, targetSprite, safePlan, dangerGrid) {
    if (!targetSprite || !safePlan || !dangerGrid) return false;
    if (this.bombCooldown > 0) return false;
    if (selfSprite.bombsPlaced >= selfSprite.maxBombsCount) return false;
    const sx = Math.round(selfSprite.x / 16);
    const sy = Math.round(selfSprite.y / 16);
    const tx = Math.round(targetSprite.x / 16);
    const ty = Math.round(targetSprite.y / 16);
    const sameRow = sy === ty;
    const sameCol = sx === tx;
    if (!sameRow && !sameCol) return false;
    if (!this.hasLineOfSight(sx, sy, tx, ty)) return false;
    if (!safePlan.path || !safePlan.path.length) return false;
    const dir = safePlan.path[0];
    if (dir == null) {
      if (!this.safeStepExists(sx, sy, dangerGrid)) return false;
    }
    const deltas = {
      [PlayerKeys.Up]: { x: 0, y: -1 },
      [PlayerKeys.Down]: { x: 0, y: 1 },
      [PlayerKeys.Left]: { x: -1, y: 0 },
      [PlayerKeys.Right]: { x: 1, y: 0 },
    };
    if (dir != null) {
      const step = deltas[dir];
      if (!step) return false;
      const nx = sx + step.x;
      const ny = sy + step.y;
      const destDanger = dangerGrid[ny] ? dangerGrid[ny][nx] : Infinity;
      if (destDanger <= this.stepDangerBuffer) return false;
    }
    return true;
  }

  hasLineOfSight(x1, y1, x2, y2) {
    if (!map) return false;
    if (x1 === x2) {
      const minY = Math.min(y1, y2);
      const maxY = Math.max(y1, y2);
      for (let y = minY + 1; y < maxY; y++) {
        const cell = map.getCell(x1, y);
        if (
          cell.type === TerrainType.PermanentWall ||
          cell.type === TerrainType.TemporaryWall
        ) {
          return false;
        }
      }
      return true;
    }
    if (y1 === y2) {
      const minX = Math.min(x1, x2);
      const maxX = Math.max(x1, x2);
      for (let x = minX + 1; x < maxX; x++) {
        const cell = map.getCell(x, y1);
        if (
          cell.type === TerrainType.PermanentWall ||
          cell.type === TerrainType.TemporaryWall
        ) {
          return false;
        }
      }
      return true;
    }
    return false;
  }

  shouldClearObstacle(selfSprite, dangerGrid) {
    if (!map || !dangerGrid) return false;
    if (this.bombCooldown > 0) return false;
    if (selfSprite.bombsPlaced >= selfSprite.maxBombsCount) return false;
    const sx = Math.round(selfSprite.x / 16);
    const sy = Math.round(selfSprite.y / 16);
    const neighbors = [
      { dx: 0, dy: -1 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 1, dy: 0 },
    ];
    let hasTarget = false;
    for (let n of neighbors) {
      const cell = map.getCell(sx + n.dx, sy + n.dy);
      if (!cell) continue;
      if (
        cell.type === TerrainType.TemporaryWall ||
        cell.type === TerrainType.PowerUp
      ) {
        hasTarget = true;
        break;
      }
    }
    if (!hasTarget) return false;
    return this.safeStepExists(sx, sy, dangerGrid);
  }

  safeStepExists(x, y, dangerGrid) {
    const options = [
      { dx: 0, dy: -1 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 1, dy: 0 },
    ];
    for (let o of options) {
      const nx = x + o.dx;
      const ny = y + o.dy;
      if (!map.isWalkable(nx, ny)) continue;
      const danger = dangerGrid[ny] ? dangerGrid[ny][nx] : Infinity;
      if (danger > this.stepDangerBuffer) return true;
    }
    return false;
  }
}

class DemoController {
  playerKeys;
  moves;
  currentMove;
  step;
  isDemo = true;
  sprite;

  constructor(moves, sprite) {
    this.playerKeys = [];
    this.currentMove = 0;
    this.step = 0;
    this.moves = moves;
    this.sprite = sprite;
  }

  update() {
    this.playerKeys = {};

    const move = (direction) => {
      if (this.step < (this.sprite && this.sprite.isHaveRollers ? 8 : 16)) {
        this.playerKeys[direction] = true;
        this.step++;
      } else {
        this.currentMove++;
        this.step = 0;
      }
    };

    if (this.moves[this.currentMove] == "l") {
      move(PlayerKeys.Left);
    } else if (this.moves[this.currentMove] == "r") {
      move(PlayerKeys.Right);
    } else if (this.moves[this.currentMove] == "u") {
      move(PlayerKeys.Up);
    } else if (this.moves[this.currentMove] == "d") {
      move(PlayerKeys.Down);
    } else if (this.moves[this.currentMove] == "b") {
      this.playerKeys[PlayerKeys.Bomb] = true;
      this.currentMove++;
    } else if (this.moves[this.currentMove] == "w") {
      this.playerKeys[PlayerKeys.rcDitonate] = true;

      if (this.step > 16) {
        this.currentMove++;
        this.step = 0;
      }

      if (this.step > 0) {
        this.step++;
      } else {
        let myBombs = 0;
        for (let y = 0; y < map.height; y++) {
          for (let x = 0; x < map.width; x++) {
            if (map.getCell(x, y).owner == this.sprite) {
              myBombs++;
            }
          }
        }
        if (myBombs == 0) {
          this.step = 1;
        }
      }
    } else {
      this.currentMove++;
    }
    if (this.currentMove >= this.moves.length) {
      this.currentMove = 0;
    }
  }
}

class Sprite {
  animations;

  movingSprite;
  get x() {
    return this.movingSprite.x;
  }
  set x(val) {
    this.movingSprite.x = val;
  }
  get y() {
    return this.movingSprite.y;
  }
  set y(val) {
    this.movingSprite.y = val;
  }

  animateIndex;
  frameIndex;

  playerKeys;

  get speed() {
    return this.movingSprite.speed;
  }
  set speed(val) {
    this.movingSprite.speed = val;
  }

  maxBoom;
  maxBombsCount;
  bombsPlaced;
  rcAllowed;
  rcDitonate;
  isHaveRollers;
  isDie;
  blinking;
  blinkingSpeed;
  unplugin;
  lifeCount = 0;
  controller;

  constructor(spriteIndex) {
    this.movingSprite = new MovingSprite();

    this.isPlayer = true;
    this.animations = [];

    this.animateIndex = 0;
    this.frameIndex = 0;

    this.playerKeys = {};

    this.speed = 1;
    this.baseSpeed = 1; // simpan kecepatan dasar untuk behaviour arrive slow-down

    this.maxBoom = 1;
    this.maxBombsCount = 1;
    this.bombsPlaced = 0;

    this.rcAllowed = false;

    this.blinking = undefined;
    this.blinkingSpeed = 15;

    for (let img of assets.players[spriteIndex]) {
      this.animations.push(img);
    }

    if (cheats.god) {
      this.unplugin = 999999;
      this.blinking = 0;
      this.blinkingSpeed = 30;
    }

    this.x = 1 * 16;
    this.y = 1 * 16;

    const initialBonus = map.initialBonus;
    if (initialBonus) {
      if (initialBonus.includes(PowerUpType.Kick)) {
        this.movingSprite.isHaveKick = true;
      }
    }
    if (mapIndex == 7) {
      this.maxBoom = 8;
      this.maxBombsCount = 8;
    }
  }

  update() {
    if (this.unplugin >= 0) {
      this.blinking++;
      this.unplugin--;
    } else {
      this.blinking = undefined;
      this.unplugin = undefined;
    }
    if (this.isDie) {
      this.animateIndex = 4;
      if (this.frameIndex < 7 && this.frameIndex != null) {
        this.frameIndex += 1 / 6;
      } else {
        this.frameIndex = null;
      }
      return;
    } else {
      this.frameIndex == 0;
    }

    if (this.controller && typeof this.controller.update === "function") {
      this.controller.update();
    } else if (
      this.controller &&
      typeof this.controller.playerKeys === "undefined"
    ) {
      // Normalize controller object if malformed
      this.controller.playerKeys = [];
    }

    this.movingSprite.direction = -1;
    if (this.controller.playerKeys[PlayerKeys.Up]) {
      this.movingSprite.direction = Direction.Up;
    } else if (this.controller.playerKeys[PlayerKeys.Left]) {
      this.movingSprite.direction = Direction.Left;
    } else if (this.controller.playerKeys[PlayerKeys.Right]) {
      this.movingSprite.direction = Direction.Right;
    } else if (this.controller.playerKeys[PlayerKeys.Down]) {
      this.movingSprite.direction = Direction.Down;
    }

    if (this.rcAllowed && this.controller.playerKeys[PlayerKeys.rcDitonate]) {
      this.rcDitonate = true;
    } else {
      this.rcDitonate = false;
    }

    this.movingSprite.update();
    if (this.movingSprite.direction == Direction.Up) {
      this.animateIndex = 3;
      this.frameIndex += 1 / 18;
    } else if (this.movingSprite.direction == Direction.Down) {
      this.animateIndex = 0;
      this.frameIndex += 1 / 18;
    } else if (this.movingSprite.direction == Direction.Left) {
      this.animateIndex = 2;
      this.frameIndex += 1 / 18;
    } else if (this.movingSprite.direction == Direction.Right) {
      this.animateIndex = 1;
      this.frameIndex += 1 / 18;
    } else {
      this.frameIndex = 0;
    }

    const tileX = Int.divRound(this.x, 16);
    const tileY = Int.divRound(this.y, 16);
    const tile = map.getCell(tileX, tileY);

    let isTouchMonster;
    for (let monster of map.monsters) {
      if (
        Int.divRound(monster.x, 16) == tileX &&
        Int.divRound(monster.y, 16) == tileY &&
        !monster.isDie
      ) {
        isTouchMonster = true;
      }
    }

    if (tile.type == TerrainType.Fire || isTouchMonster) {
      if (!this.unplugin) {
        if (this.lifeCount > 0) {
          this.blinkingSpeed = 30;
          this.blinking = 0;
          this.unplugin = 165;
          this.lifeCount--;
          this.rcAllowed = false;
          this.isHaveRollers = false;
          this.movingSprite.isHaveKick = false;
          this.speed = 1;
          this.maxBombsCount = Math.min(this.maxBombsCount, 3);
          map.playSound("oioi");
        } else {
          this.isDie = true;
          this.frameIndex = 0;
          map.playSound("player_die");
        }
      }
    }

    if (tile.type == TerrainType.Apocalypse) {
      this.isDie = true;
      this.frameIndex = 0;
      map.playSound("player_die");
    }

    if (this.controller.playerKeys[PlayerKeys.Bomb]) {
      if (
        tile.type == TerrainType.Free &&
        this.bombsPlaced < this.maxBombsCount
      ) {
        map.setCell(Int.divRound(this.x, 16), Int.divRound(this.y, 16), {
          type: TerrainType.Bomb,
          image: assets.bomb,
          imageIdx: 0,
          animateDelay: 12,
          bombTime: 210,
          maxBoom: this.maxBoom,
          rcAllowed: this.rcAllowed,
          owner: this,
          offsetX: 0,
          offsetY: 0,
          dx: 0,
          dy: 0,
        });
        map.playSound("posebomb");
        this.bombsPlaced++;
      }
    }

    if (tile.type == TerrainType.PowerUp) {
      const powerUpType = tile.powerUpType;
      let doFire = false;

      if (powerUpType == PowerUpType.ExtraFire) {
        this.maxBoom++;
      } else if (powerUpType == PowerUpType.ExtraBomb) {
        this.maxBombsCount++;
      } else if (powerUpType == PowerUpType.RemoteControl) {
        if (!this.rcAllowed) {
          this.rcAllowed = true;
        } else {
          doFire = true;
        }
      } else if (powerUpType == PowerUpType.RollerSkate) {
        if (!this.isHaveRollers) {
          this.speed = 2;
          this.isHaveRollers = true;
        } else {
          doFire = true;
        }
      } else if (powerUpType == PowerUpType.Kick) {
        if (this.movingSprite.isHaveKick) {
          doFire = true;
        } else {
          this.movingSprite.isHaveKick = true;
        }
      } else if (powerUpType == PowerUpType.Life) {
        this.lifeCount++;
      } else if (powerUpType == PowerUpType.Shield) {
        this.unplugin = 600;
        this.blinkingSpeed = 30;
        this.blinking = 0;
      } else if (powerUpType == PowerUpType.Banana) {
        for (let y = 0; y < map.height; y++) {
          for (let x = 0; x < map.width; x++) {
            if (map.getCell(x, y).type == TerrainType.Bomb) {
              map.ditonateBomb(x, y);
            }
          }
        }
      } else if (powerUpType == PowerUpType.Clock) {
        map.timeLeft += 60;
        soundManager.playSound("clock");
      }

      if (doFire) {
        map.setCell(tileX, tileY, {
          type: TerrainType.PowerUpFire,
          image: assets.fire,
          imageIdx: 0,
          animateDelay: 6,
          next: {
            type: TerrainType.Free,
          },
        });
        map.playSound("sac");
      } else {
        map.setCell(tileX, tileY, {
          type: TerrainType.Free,
        });
        map.playSound("pick");
      }
    }
  }

  tick() {
    this.animations[this.animateIndex].tick();
  }

  draw(ctx) {
    let frameIndex =
      this.frameIndex == null ? null : Math.floor(this.frameIndex);
    const frames = [0, 1, 0, 2];
    let img = this.animations[this.animateIndex];
    img = img[frameIndex % img.length];
    if ((this.blinking % this.blinkingSpeed) * 2 < this.blinkingSpeed) {
      img = assets.boyGhost[this.animateIndex * 3 + frames[frameIndex % 4]];
    }

    if (img && frameIndex != null) {
      img.draw(
        ctx,
        this.x + 8 + 8 - Int.divFloor(img.rect.width, 2),
        this.y + 16 - img.rect.height
      );
    }
  }
}

class Monster {
  constructor(monster, spawn) {
    this.x = spawn.x * 16;
    this.y = spawn.y * 16;
    this.step = 0;
    this.waitAfterTurn = monster.waitAfterTurn;
    this.frameIndex = 0;
    this.type = monster.type;
    this.livesCount = monster.livesCount;
    this.blinking = 0;
    this.blinkingSpeed = 0;
    this.speed = monster.speed;
    this.skip = 0;
    if (monster.startDelay) {
      this.blinkingSpeed = 40;
      this.blinking = monster.startDelay;
      this.wait = monster.startDelay - 30;
      this.unplugin = monster.startDelay;
    }
  }

  update() {
    const type = map.getCell(
      Int.divRound(this.x, 16),
      Int.divRound(this.y, 16)
    ).type;

    if (!this.unplugin && type == TerrainType.Fire && !this.isDie) {
      if (this.livesCount > 0) {
        this.livesCount--;
        this.blinking = 120;
        this.unplugin = 120;
        this.blinkingSpeed = 30;
      } else {
        this.isDie = true;
        this.step = 4;
        map.playSound("ai");
      }
    }

    if (type == TerrainType.Apocalypse) {
      if (!this.isDie) {
        map.playSound("ai");
      }
      this.isDie = true;
      this.step = 4;
    }

    if (this.isDie && this.frameIndex < 8) {
      this.frameIndex += 1 / 5;
    }

    this.skip += this.speed;
    if (this.skip < 1) {
      return;
    }
    this.skip %= 1;

    const delta = [
      { x: 0, y: 1 },
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: -1 },
      {},
      { x: 0, y: 0 },
    ];
    const isWalkable = (monster, delta) => {
      switch (
        map.getCell(
          Int.divRound(monster.x + delta.x * 8 + delta.x, 16),
          Int.divRound(monster.y + delta.y * 8 + delta.y, 16)
        ).type
      ) {
        case TerrainType.Free:
        case TerrainType.PowerUpFire:
        case TerrainType.PowerUp:
        case TerrainType.PowerUpFire:
          return true;

        case TerrainType.PermanentWall:
        case TerrainType.TemporaryWall:
        case TerrainType.Bomb:
        case TerrainType.Fire:
        case TerrainType.Apocalypse:
        case TerrainType.Rubber:
          return false;

        default:
          return true;
      }
    };
    if (this.wait > 0) {
      this.wait--;
      this.frameIndex = 0;
    } else if (!this.isDie) {
      if (this.x % 16 == 0 && this.y % 16 == 0 && rand() < 0.1) {
        this.wait = this.waitAfterTurn;
      } else if (this.wait != undefined) {
        this.step = undefined;
        let rnd = [];
        for (let i = 0; i < 4; i++) {
          rnd.push({ i: i, rnd: rand() });
        }
        rnd.sort((a, b) => a.rnd - b.rnd);

        for (let i = 0; i < rnd.length && this.step == undefined; i++) {
          if (isWalkable(this, delta[rnd[i].i])) {
            this.step = rnd[i].i;
          }
        }
        if (this.step == undefined) {
          this.step = 5;
        }
        this.wait = undefined;
        this.frameIndex = 0;
      } else if (isWalkable(this, delta[this.step]) && this.step != 5) {
        this.x += delta[this.step].x;
        this.y += delta[this.step].y;
        this.frameIndex += 1 / 10;
      } else {
        this.wait = this.waitAfterTurn;
      }

      this.frameIndex %= 4;
    }

    this.blinking -= this.blinkingSpeed / 30;
    if (this.blinking < 0) {
      this.blinkingSpeed = 0;
      this.blinking = 0;
    }
    if (this.unplugin) {
      this.unplugin--;
    }
  }

  draw(ctx) {
    let img;
    if (this.step == 5) {
      img = assets.monsters[this.type][0][0];
    } else {
      const imgSet =
        this.blinking % 20 < 10 ? assets.monsters : assets.monsterGhosts;
      img = imgSet[this.type][this.step][Math.floor(this.frameIndex)];
    }
    img.draw(
      ctx,
      this.x + 8 + 8 - Int.divFloor(img.rect.width, 2),
      this.y + 16 - img.rect.height
    );
  }
}

class MovingSprite {
  direction;
  x;
  y;
  speed = 1;
  isHaveKick;

  update() {
    const moveY = (delta) => {
      if (Int.mod(this.x, 16) == 0) {
        const newY =
          delta < 0
            ? Int.divFloor(this.y + delta, 16)
            : Int.divCeil(this.y + delta, 16);
        const cellX = Int.divRound(this.x, 16);
        const cellY = Int.divRound(this.y, 16);
        const cell = map.getCell(cellX, cellY);

        if (map.isWalkable(cellX, newY)) {
          this.y += delta;
        }

        if (newY == cellY && cell.type == TerrainType.Bomb) {
          this.y += delta;
        } else {
          const newCell = map.getCell(cellX, newY);
          if (newCell.type == TerrainType.Bomb) {
            if (this.isHaveKick) {
              newCell.dy = delta * 2;
            } else {
              if (newCell.offsetX == 0) {
                newCell.dy = 0;
              }
            }
          }
        }
      } else {
        this.xAlign(delta);
      }
    };
    const moveX = (delta) => {
      if (Int.mod(this.y, 16) == 0) {
        const newX =
          delta < 0
            ? Int.divFloor(this.x + delta, 16)
            : Int.divCeil(this.x + delta, 16);
        const cellX = Int.divRound(this.x, 16);
        const cellY = Int.divRound(this.y, 16);
        const cell = map.getCell(cellX, cellY);

        if (map.isWalkable(newX, cellY)) {
          this.x += delta;
        }

        if (newX == cellX && cell.type == TerrainType.Bomb) {
          this.x += delta;
        } else {
          const newCell = map.getCell(newX, cellY);
          if (newCell.type == TerrainType.Bomb) {
            if (this.isHaveKick) {
              newCell.dx = delta * 2;
            } else {
              if (newCell.offsetX == 0) {
                newCell.dx = 0;
              }
            }
          }
        }
      } else {
        this.yAlign(delta);
      }

      this.frameIndex += 1 / 18;
    };

    for (let i = 0; i < this.speed; i++) {
      if (this.direction == Direction.Up) {
        this.animateIndex = 3;
        moveY(-1);
      } else if (this.direction == Direction.Down) {
        this.animateIndex = 0;
        moveY(1);
      } else if (this.direction == Direction.Left) {
        moveX(-1);
        this.animateIndex = 2;
      } else if (this.direction == Direction.Right) {
        moveX(1);
        this.animateIndex = 1;
      } else {
        this.frameIndex = 0;
      }
    }
  }

  xAlign(deltaY) {
    if (
      map.isWalkable(
        Int.divFloor(this.x - 1, 16),
        Int.divRound(this.y, 16) + deltaY
      )
    ) {
      this.x -= 1;

      this.animateIndex = 2;
    } else if (
      map.isWalkable(
        Int.divCeil(this.x + 1, 16),
        Int.divRound(this.y, 16) + deltaY
      )
    ) {
      this.x += 1;

      this.animateIndex = 1;
    }
  }

  yAlign(deltaX) {
    if (
      map.isWalkable(
        Int.divRound(this.x, 16) + deltaX,
        Int.divFloor(this.y - 1, 16)
      )
    ) {
      this.y -= 1;

      this.animateIndex = 3;
    } else if (
      (map.isWalkable(Int.divRound(this.x, 16) + deltaX),
      Int.divCeil(this.y + 1, 16))
    ) {
      this.y += 1;

      this.animateIndex = 0;
    }
  }
}

class UnrepeatableRandom {
  previosNumber = -1;
  constructor() {}

  next(max) {
    if (this.previosNumber == -1 || max <= 1) {
      this.previosNumber = Int.random(max);
      return this.previosNumber;
    } else {
      while (true) {
        const number = Int.random(max);
        if (number != this.previosNumber) {
          this.previosNumber = number;
          return number;
        }
      }
    }
  }
}

function getSign(val) {
  return val ? val / Math.abs(val) : 0;
}

class Rect {
  x;
  y;
  width;
  height;

  constructor(x, y, width, height) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }
}
