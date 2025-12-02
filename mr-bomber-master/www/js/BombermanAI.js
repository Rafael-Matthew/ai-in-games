class BombermanAI {
  constructor(opts = {}) {
    this.id = opts.id || 'ai';
    this.bombRange = opts.blastRadius || 2;
    this.nextMove = null;
    this.shouldBomb = false;
  }

  update(gameState) {
    const { grid: rawGrid, bombs, players } = gameState;

    const me = players.find(p => p.id === this.id);
    if (!me) return { move: null, placeBomb: false };

    this.x = me.x;
    this.y = me.y;
    this.nextMove = null;
    this.shouldBomb = false;

    const gridWrapper = {
      width: rawGrid[0].length,
      height: rawGrid.length,
      inBounds: (x, y) => x >= 0 && y >= 0 && x < rawGrid[0].length && y < rawGrid.length,
      isSolid: (x, y) => {
        if (x < 0 || y < 0 || x >= rawGrid[0].length || y >= rawGrid.length) return true;
        const t = rawGrid[y][x].type;
        return t === 'wall' || t === 'soft' || t === 'bomb';
      },
      isWalkable: (x, y) => {
        if (x < 0 || y < 0 || x >= rawGrid[0].length || y >= rawGrid.length) return false;
        const t = rawGrid[y][x].type;
        return t !== 'wall' && t !== 'soft' && t !== 'bomb';
      },
      isDestructible: (x, y) => {
        if (x < 0 || y < 0 || x >= rawGrid[0].length || y >= rawGrid.length) return false;
        return rawGrid[y][x].type === 'soft';
      }
    };

    const enemies = players.filter(p => p.id !== this.id && p.alive);
    const powerUps = [];
    for (let y = 0; y < gridWrapper.height; y++) {
      for (let x = 0; x < gridWrapper.width; x++) {
        if (rawGrid[y][x].type === 'powerup') powerUps.push({ x, y });
      }
    }

    const game = {
      grid: gridWrapper,
      bombs,
      enemies,
      powerUps
    };

    this.botAI(this, game);

    return {
      move: this.nextMove,
      placeBomb: this.shouldBomb
    };
  }

  moveRight() { this.nextMove = { x: this.x + 1, y: this.y }; }
  moveLeft() { this.nextMove = { x: this.x - 1, y: this.y }; }
  moveDown() { this.nextMove = { x: this.x, y: this.y + 1 }; }
  moveUp() { this.nextMove = { x: this.x, y: this.y - 1 }; }
  placeBomb() { this.shouldBomb = true; }

  botAI(bot, game) {
    const { grid, bombs, enemies, powerUps } = game;
    const dangerMap = this.computeDangerMap(bombs, grid, bot.bombRange);

    // 1. Safety
    if (dangerMap[bot.y][bot.x] > 0) {
      const safeTile = this.findSafeTile(bot, grid, dangerMap);
      if (safeTile && this.moveTo(bot, safeTile, grid, dangerMap)) return;
    }

    // 2. Powerups
    if (powerUps.length > 0) {
      const best = this.nearest(bot, powerUps);
      if (best && this.moveTo(bot, best, grid, dangerMap)) return;
    }

    // 3. Attack / Wall Breaking
    const enemy = this.nearest(bot, enemies);
    if (enemy) {
        if (this.handleAttack(bot, enemy, grid, dangerMap, bombs)) return;
        if (this.handleWallBreaking(bot, enemy, grid, dangerMap, bombs)) return;
    } else {
        const wall = this.findNearestSoftBlock(bot, grid);
        if (wall && this.handleWallBreakingTarget(bot, wall, grid, dangerMap, bombs)) return;
    }

    // 4. Random
    this.randomMove(bot, grid);
  }

  handleAttack(bot, target, grid, dangerMap, bombs) {
      const dist = Math.abs(bot.x - target.x) + Math.abs(bot.y - target.y);
      if (dist <= bot.bombRange) {
          if (this.botHasEscapeRoute(bot, grid, dangerMap, bombs)) {
              bot.placeBomb();
              this.executeEscape(bot, grid, dangerMap, bombs);
              return true;
          }
      }
      const path = this.aStar({x: bot.x, y: bot.y}, target, grid, dangerMap);
      if (path && path.length >= 2) {
          this.moveTo(bot, target, grid, dangerMap);
          return true;
      }
      return false;
  }

  handleWallBreaking(bot, target, grid, dangerMap, bombs) {
      const wall = this.findBlockingWall(bot, target, grid, dangerMap);
      if (!wall) return false;
      return this.handleWallBreakingTarget(bot, wall, grid, dangerMap, bombs);
  }

  handleWallBreakingTarget(bot, wall, grid, dangerMap, bombs) {
      const attackPos = this.findAdjacentWalkable(wall, grid);
      if (!attackPos) return false;

      if (bot.x === attackPos.x && bot.y === attackPos.y) {
          if (this.botHasEscapeRoute(bot, grid, dangerMap, bombs)) {
              bot.placeBomb();
              this.executeEscape(bot, grid, dangerMap, bombs);
              return true;
          }
      } else {
          if (this.moveTo(bot, attackPos, grid, dangerMap)) return true;
      }
      return false;
  }

  executeEscape(bot, grid, dangerMap, bombs) {
      const newBombs = [...bombs, { x: bot.x, y: bot.y, timer: 3 }];
      const newDanger = this.computeDangerMap(newBombs, grid, bot.bombRange);
      const escape = this.findSafeTile(bot, grid, newDanger);
      if (escape) this.moveTo(bot, escape, grid, newDanger);
  }

  findBlockingWall(bot, target, grid, dangerMap) {
      const path = this.aStar({x: bot.x, y: bot.y}, target, grid, dangerMap);
      if (path) return null; 
      return this.findNearestSoftBlock(bot, grid);
  }

  findNearestSoftBlock(bot, grid) {
    const dirs = [{x:1,y:0}, {x:-1,y:0}, {x:0,y:1}, {x:0,y:-1}];
    let queue = [{ x: bot.x, y: bot.y }];
    let visited = new Set([`${bot.x},${bot.y}`]);

    while (queue.length) {
      let { x, y } = queue.shift();
      for (let d of dirs) {
        let nx = x + d.x;
        let ny = y + d.y;
        if (!grid.inBounds(nx, ny)) continue;
        if (visited.has(`${nx},${ny}`)) continue;
        visited.add(`${nx},${ny}`);

        if (grid.isDestructible(nx, ny)) return { x: nx, y: ny };
        if (grid.isWalkable(nx, ny)) queue.push({ x: nx, y: ny });
      }
    }
    return null;
  }

  computeDangerMap(bombs, grid, explosionRange) {
    const danger = Array.from({ length: grid.height }, () =>
      Array(grid.width).fill(0)
    );

    bombs.forEach(bomb => {
      let { x, y, timer } = bomb;
      if (timer === undefined) timer = 3; 

      const dirs = [
        { x: 1, y: 0 },
        { x: -1, y: 0 },
        { x: 0, y: 1 },
        { x: 0, y: -1 }
      ];

      if (grid.inBounds(x, y)) {
          danger[y][x] = timer; 
      }

      dirs.forEach(d => {
        for (let dist = 1; dist <= explosionRange; dist++) {
          const nx = x + d.x * dist;
          const ny = y + d.y * dist;

          if (!grid.inBounds(nx, ny)) break;
          if (grid.isSolid(nx, ny)) break;

          danger[ny][nx] = timer;

          if (grid.isDestructible(nx, ny)) break;
        }
      });
    });

    return danger;
  }

  aStar(start, goal, grid, dangerMap) {
    const open = [];
    const closed = new Set();

    open.push({
      pos: start,
      g: 0,
      h: Math.abs(start.x - goal.x) + Math.abs(start.y - goal.y),
      f: 0,
      parent: null
    });

    while (open.length > 0) {
      open.sort((a, b) => a.f - b.f);
      const current = open.shift();
      const key = `${current.pos.x},${current.pos.y}`;

      if (current.pos.x === goal.x && current.pos.y === goal.y) {
        const path = [];
        let node = current;
        while (node) {
          path.unshift(node.pos);
          node = node.parent;
        }
        return path;
      }

      closed.add(key);

      const dirs = [
        { x: 1, y: 0 },
        { x: -1, y: 0 },
        { x: 0, y: 1 },
        { x: 0, y: -1 }
      ];

      for (let d of dirs) {
        const next = { x: current.pos.x + d.x, y: current.pos.y + d.y };
        const nextKey = `${next.x},${next.y}`;

        if (!grid.isWalkable(next.x, next.y)) continue;
        if (closed.has(nextKey)) continue;

        const dangerCost = dangerMap[next.y][next.x] > 0 ? 1000 : 0;
        const g = current.g + 1 + dangerCost; 
        
        const h = Math.abs(next.x - goal.x) + Math.abs(next.y - goal.y);
        const f = g + h;

        open.push({
          pos: next,
          g, h, f,
          parent: current
        });
      }
    }

    return null; 
  }

  nearest(bot, items) {
    let min = Infinity;
    let best = null;
    for (let t of items) {
      const d = Math.abs(bot.x - t.x) + Math.abs(bot.y - t.y);
      if (d < min) {
        min = d;
        best = t;
      }
    }
    return best;
  }

  findSafeTile(bot, grid, dangerMap) {
    const candidates = [];
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        if (grid.isWalkable(x, y) && dangerMap[y][x] === 0) {
          candidates.push({ x, y });
        }
      }
    }
    return this.nearest(bot, candidates);
  }

  findAdjacentWalkable(target, grid) {
      const dirs = [{x:1,y:0}, {x:-1,y:0}, {x:0,y:1}, {x:0,y:-1}];
      for (let d of dirs) {
          const nx = target.x + d.x;
          const ny = target.y + d.y;
          if (grid.isWalkable(nx, ny)) return {x: nx, y: ny};
      }
      return null;
  }

  moveTo(bot, target, grid, dangerMap) {
    const path = this.aStar({ x: bot.x, y: bot.y }, target, grid, dangerMap);
    if (!path || path.length < 2) return false; 
    const next = path[1];

    if (next.x > bot.x) bot.moveRight();
    else if (next.x < bot.x) bot.moveLeft();
    else if (next.y > bot.y) bot.moveDown();
    else if (next.y < bot.y) bot.moveUp();
    return true;
  }

  botHasEscapeRoute(bot, grid, dangerMap, bombs) {
      const simulatedBombs = [...bombs, { x: bot.x, y: bot.y, timer: 3 }];
      const newDanger = this.computeDangerMap(simulatedBombs, grid, bot.bombRange);
      const safeTile = this.findSafeTile(bot, grid, newDanger);
      if (!safeTile) return false;
      const path = this.aStar({x: bot.x, y: bot.y}, safeTile, grid, newDanger);
      return path !== null;
  }

  randomMove(bot, grid) {
      const dirs = [{x:1,y:0}, {x:-1,y:0}, {x:0,y:1}, {x:0,y:-1}];
      const valid = dirs.filter(d => grid.isWalkable(bot.x + d.x, bot.y + d.y));
      if(valid.length) {
          const d = valid[Math.floor(Math.random() * valid.length)];
          const target = {x: bot.x + d.x, y: bot.y + d.y};
          if (target.x > bot.x) bot.moveRight();
          else if (target.x < bot.x) bot.moveLeft();
          else if (target.y > bot.y) bot.moveDown();
          else if (target.y < bot.y) bot.moveUp();
      }
  }
}
