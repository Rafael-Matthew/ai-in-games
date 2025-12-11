class BombermanAI {
  constructor(opts = {}) {
    this.id = opts.id || "ai";
    this.bombRange = opts.blastRadius || 2;

    this.lastDecision = 0;
    this.lastBombTime = 0;
    this.BOMB_COOLDOWN = 900;
    this.DECISION_INTERVAL = 120;
  }

  update(gameState) {
    const { grid: rawGrid, bombs, players } = gameState;
    const now = performance.now();

    // Find self
    const bot = players.find((p) => p.id === this.id);
    if (!bot) return { move: null, placeBomb: false };

    // Throttle decision making
    if (now - this.lastDecision < this.DECISION_INTERVAL) {
      return { move: null, placeBomb: false };
    }
    this.lastDecision = now;

    // Convert Grid to Integer Grid for the User's Logic
    // 1=Wall/Bomb, 2=Soft, 4=Powerup, 0=Empty
    const grid = rawGrid.map((row) =>
      row.map((cell) => {
        if (cell.type === "wall") return 1;
        if (cell.type === "soft") return 2;
        if (cell.type === "bomb") return 1; // Treat bomb as wall for movement
        if (cell.type === "powerup") return 4;
        return 0;
      })
    );

    // 1. Build danger map
    const danger = this.getDangerMap(grid, bombs);

    // 2. If bot in danger → escape
    if (danger[bot.y][bot.x] === 1) {
      const path = this.findSafePath(bot, grid, danger);
      if (path) {
        return { move: this.stepTo(path), placeBomb: false };
      }
    }

    // 3. Attack enemy if in range + safe
    const target = this.findClosestEnemy(bot, players);
    if (target && this.canBombEnemy(bot, target, grid)) {
      if (now - this.lastBombTime > this.BOMB_COOLDOWN) {
        this.lastBombTime = now;
        return { move: null, placeBomb: true };
      }
    }

    // 4. If blocked by soft block → bomb it
    if (this.isSoftBlockFront(bot, grid)) {
      if (now - this.lastBombTime > this.BOMB_COOLDOWN) {
        this.lastBombTime = now;
        return { move: null, placeBomb: true };
      }
    }

    // 5. Otherwise → move toward enemy or power up
    let goal = null;

    // enemy first
    if (target) {
      goal = { x: target.x, y: target.y };
    } else {
      goal = this.findClosestPowerUp(bot, grid);
    }

    if (goal) {
      const path = this.aStar(grid, bot, goal, danger);
      if (path) {
        return { move: this.stepTo(path), placeBomb: false };
      }
    }

    // 6. If everything fails → random move (never idle)
    return { move: this.randomMove(grid, bot), placeBomb: false };
  }

  // ---------------------------------------------------
  // DANGER MAP
  // ---------------------------------------------------
  getDangerMap(grid, bombs) {
    const H = grid.length;
    const W = grid[0].length;
    const danger = Array.from({ length: H }, () => Array(W).fill(0));

    for (const b of bombs) {
      danger[b.y][b.x] = 1;

      const dirs = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ];

      // Use radius from game state or default to 2
      const power = b.radius || 2;

      for (const [dx, dy] of dirs) {
        let cx = b.x;
        let cy = b.y;

        for (let i = 0; i < power; i++) {
          cx += dx;
          cy += dy;

          if (!this.inBounds(grid, cx, cy)) break;
          if (grid[cy][cx] === 1) break; // solid

          danger[cy][cx] = 1;

          if (grid[cy][cx] === 2) break; // soft block stops fire
        }
      }
    }

    return danger;
  }

  // ---------------------------------------------------
  // ESCAPE
  // ---------------------------------------------------
  findSafePath(bot, grid, danger) {
    const queue = [[bot.x, bot.y]];
    const visited = new Set([bot.x + "," + bot.y]);
    const parent = {};

    while (queue.length > 0) {
      const [x, y] = queue.shift();

      if (danger[y][x] === 0) {
        return this.reconstruct(parent, bot, { x, y });
      }

      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx;
        const ny = y + dy;

        if (!this.inBounds(grid, nx, ny)) continue;
        if (grid[ny][nx] === 1) continue; // solid
        if (grid[ny][nx] === 2) continue; // soft block is solid for movement
        // Note: User code had `if (danger[ny][nx] === 2) continue;` which seemed specific to their logic.
        // Here we just check if it's walkable.

        const key = nx + "," + ny;
        if (!visited.has(key)) {
          visited.add(key);
          parent[key] = { x, y };
          queue.push([nx, ny]);
        }
      }
    }

    return null;
  }

  // ---------------------------------------------------
  // ENEMY
  // ---------------------------------------------------
  findClosestEnemy(bot, players) {
    let best = null;
    let bestDist = Infinity;

    for (const p of players) {
      if (p.id === bot.id) continue;

      const d = Math.abs(bot.x - p.x) + Math.abs(bot.y - p.y);
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }

    return best;
  }

  canBombEnemy(bot, target, grid) {
    if (bot.y === target.y) {
      const minX = Math.min(bot.x, target.x);
      const maxX = Math.max(bot.x, target.x);

      for (let x = minX; x <= maxX; x++) {
        if (grid[bot.y][x] === 1) return false;
        if (grid[bot.y][x] === 2) return false; // Soft block also blocks line of sight
      }
      return true;
    }

    if (bot.x === target.x) {
      const minY = Math.min(bot.y, target.y);
      const maxY = Math.max(bot.y, target.y);

      for (let y = minY; y <= maxY; y++) {
        if (grid[y][bot.x] === 1) return false;
        if (grid[y][bot.x] === 2) return false;
      }
      return true;
    }

    return false;
  }

  // ---------------------------------------------------
  // SOFT BLOCK CHECK
  // ---------------------------------------------------
  isSoftBlockFront(bot, grid) {
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    for (const [dx, dy] of dirs) {
      const nx = bot.x + dx;
      const ny = bot.y + dy;
      if (!this.inBounds(grid, nx, ny)) continue;
      if (grid[ny][nx] === 2) return true;
    }
    return false;
  }

  // ---------------------------------------------------
  // POWER UP
  // ---------------------------------------------------
  findClosestPowerUp(bot, grid) {
    let best = null;
    let bestDist = Infinity;

    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[0].length; x++) {
        if (grid[y][x] === 4) {
          const d = Math.abs(x - bot.x) + Math.abs(y - bot.y);
          if (d < bestDist) {
            bestDist = d;
            best = { x, y };
          }
        }
      }
    }

    return best;
  }

  // ---------------------------------------------------
  // A* PATHFINDING
  // ---------------------------------------------------
  aStar(grid, start, goal, danger) {
    const open = [];
    const came = {};
    const g = {};
    const f = {};
    const keyStart = start.x + "," + start.y;
    const keyGoal = goal.x + "," + goal.y;

    g[keyStart] = 0;
    f[keyStart] = this.heuristic(start, goal);
    open.push({ key: keyStart, x: start.x, y: start.y, f: f[keyStart] });

    const visited = new Set();

    while (open.length > 0) {
      open.sort((a, b) => a.f - b.f);
      const cur = open.shift();
      visited.add(cur.key);

      if (cur.key === keyGoal) {
        return this.reconstruct(came, start, goal);
      }

      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = cur.x + dx;
        const ny = cur.y + dy;

        if (!this.inBounds(grid, nx, ny)) continue;
        if (grid[ny][nx] === 1) continue; // solid
        if (grid[ny][nx] === 2) continue; // soft
        if (danger[ny][nx] === 1) continue; // danger

        const nk = nx + "," + ny;
        if (visited.has(nk)) continue;

        const tentative = g[cur.key] + 1;

        if (g[nk] === undefined || tentative < g[nk]) {
          came[nk] = { x: cur.x, y: cur.y };
          g[nk] = tentative;
          f[nk] = tentative + this.heuristic({ x: nx, y: ny }, goal);

          open.push({ key: nk, x: nx, y: ny, f: f[nk] });
        }
      }
    }

    return null;
  }

  heuristic(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  }

  // ---------------------------------------------------
  // SMALL UTILITIES
  // ---------------------------------------------------
  inBounds(grid, x, y) {
    return x >= 0 && y >= 0 && y < grid.length && x < grid[0].length;
  }

  reconstruct(came, start, goal) {
    const path = [];
    let cx = goal.x;
    let cy = goal.y;

    while (cx !== start.x || cy !== start.y) {
      path.push({ x: cx, y: cy });
      const key = cx + "," + cy;
      const p = came[key];
      if (!p) return null;
      cx = p.x;
      cy = p.y;
    }

    path.reverse();
    return path;
  }

  stepTo(path) {
    if (!path || path.length === 0) return null;
    // Return the coordinate of the next step
    return path[0];
  }

  randomMove(grid, bot) {
    const dirs = [
      { x: 0, y: -1 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
      { x: 1, y: 0 },
    ];
    const valid = dirs.filter((d) => {
      const nx = bot.x + d.x;
      const ny = bot.y + d.y;
      // Check bounds and if walkable (not wall/soft/bomb)
      return (
        this.inBounds(grid, nx, ny) &&
        grid[ny][nx] !== 1 &&
        grid[ny][nx] !== 2
      );
    });

    if (valid.length === 0) return null;
    const d = valid[Math.floor(Math.random() * valid.length)];
    return { x: bot.x + d.x, y: bot.y + d.y };
  }
}
