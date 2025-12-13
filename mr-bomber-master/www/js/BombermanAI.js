class BombermanAI {
  constructor(opts = {}) {
    this.id = opts.id || "ai";
    this.bombRange = opts.blastRadius || 2;

    this.lastDecision = 0;
    this.lastBombTime = 0;
    this.BOMB_COOLDOWN = 900;
    // Keep this fairly small so movement doesn't stutter.
    this.DECISION_INTERVAL = 30;

    // After placing a bomb, force the bot to keep moving for a short time
    // so it doesn't stop on a marginally-safe tile.
    this._escapeUntil = 0;

    // Cached escape plan (list of tiles). This avoids re-picking a worse
    // "safe" tile mid-run.
    this._escapePath = null;
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
    // 1=Wall, 2=Soft, 3=Bomb, 4=Powerup, 5=Fire, 0=Empty
    const grid = rawGrid.map((row) =>
      row.map((cell) => {
        if (cell.type === "wall") return 1;
        if (cell.type === "soft") return 2;
        if (cell.type === "bomb") return 3; // Treat bomb as distinct obstacle
        if (cell.type === "powerup") return 4;
        if (cell.type === "fire") return 5;
        return 0;
      })
    );

    // 1. Build danger map
    const danger = this.getDangerMap(grid, bombs);

    // 2. If bot in danger → escape
    if (danger[bot.y][bot.x] === 1 || now < this._escapeUntil) {
      // Prefer continuing an existing escape plan if it still makes sense.
      if (this._escapePath && this._escapePath.length > 0) {
        const next = this._escapePath[0];
        // If already reached the next step, advance.
        if (next.x === bot.x && next.y === bot.y) {
          this._escapePath.shift();
        }
      }

      if (!this._escapePath || this._escapePath.length === 0) {
        this._escapePath = this.findSafePath(bot, grid, danger, {
          minDistance: 2,
          requireSafeNeighbor: true,
        });
      }

      if (this._escapePath && this._escapePath.length > 0) {
        return { move: this.stepTo(this._escapePath), placeBomb: false };
      }

      // If we are waiting for a bomb (escape timer active) and are currently safe,
      // stop here. Do not proceed to attack or farm soft blocks until the bomb explodes.
      if (now < this._escapeUntil && danger[bot.y][bot.x] === 0) {
        // Double check: are we "barely" safe? If so, try to move further.
        const neighborsDanger = this.countDangerNeighbors(danger, bot.x, bot.y);
        if (neighborsDanger > 0) {
          // We are adjacent to danger. Try to find a better spot.
          const betterPath = this.findSafePath(bot, grid, danger, {
            minDistance: 1, // Just move away
            requireSafeNeighbor: true,
          });
          if (betterPath && betterPath.length > 0) {
            this._escapePath = betterPath;
            return { move: this.stepTo(this._escapePath), placeBomb: false };
          }
        }
        return { move: null, placeBomb: false };
      }
    } else {
      // Not escaping anymore.
      this._escapePath = null;
    }

    // 3. Attack enemy if in range + safe
    const target = this.findClosestEnemy(bot, players);
    if (target && this.canBombEnemy(bot, target, grid)) {
      if (now - this.lastBombTime > this.BOMB_COOLDOWN) {
        // Only bomb if we can escape from the blast of the bomb we're placing.
        // PARANOID MODE: Assume the bomb is bigger than we think to ensure safety.
        const safeRadius = (this.bombRange || 2) + 2;
        const simBombs = bombs.concat([
          {
            x: bot.x,
            y: bot.y,
            radius: safeRadius,
            timer: 999,
            ownerId: this.id,
          },
        ]);
        const simDanger = this.getDangerMap(grid, simBombs);
        const escapePath = this.findSafePath(bot, grid, simDanger, {
          minDistance: safeRadius + 1,
          requireSafeNeighbor: true,
        });
        if (escapePath && escapePath.length > 0) {
          this.lastBombTime = now;
          // Force continued fleeing for a short window to avoid stopping too close.
          // IMPORTANT: do NOT move on the same tick as placing a bomb.
          // In this engine, bombs are placed after movement, so moving+placing
          // would place the bomb on the destination tile.
          // Wait 4500ms (3.5s fuse + 1s safety)
          this._escapeUntil = now + 4500;
          this._escapePath = escapePath;
          return { move: null, placeBomb: true };
        }
      }
    }

    // 4. If blocked by soft block → bomb it
    if (this.isSoftBlockFront(bot, grid)) {
      if (now - this.lastBombTime > this.BOMB_COOLDOWN) {
        // PARANOID MODE: Assume the bomb is bigger than we think to ensure safety.
        const safeRadius = (this.bombRange || 2) + 2;
        const simBombs = bombs.concat([
          {
            x: bot.x,
            y: bot.y,
            radius: safeRadius,
            timer: 999,
            ownerId: this.id,
          },
        ]);
        const simDanger = this.getDangerMap(grid, simBombs);
        // Soft-block clearing happens in tighter spaces; relax escape constraints a bit
        // so the bot will actually bomb (but still only if an escape exists).
        const escapePath = this.findSafePath(bot, grid, simDanger, {
          minDistance: safeRadius,
          requireSafeNeighbor: false,
        });
        if (escapePath && escapePath.length > 0) {
          this.lastBombTime = now;
          this._escapeUntil = now + 4500;
          this._escapePath = escapePath;
          return { move: null, placeBomb: true };
        }
      }
    }

    // 5. Otherwise → move toward enemy, power up, or a soft block to clear
    let goal = null;

    // enemy first
    if (target) {
      goal = { x: target.x, y: target.y };
    } else {
      // Prefer powerups; if none, hunt soft blocks so bots can open space.
      goal = this.findClosestPowerUp(bot, grid);
      if (!goal) {
        goal = this.findSoftBlockApproachTile(bot, grid, danger);
      }
    }

    if (goal) {
      const path = this.aStar(grid, bot, goal, danger);
      if (path) {
        return { move: this.stepTo(path), placeBomb: false };
      }
    }

    // 6. If everything fails → random move (never idle)
    return { move: this.randomMove(grid, bot, danger), placeBomb: false };
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
          if (grid[cy][cx] === 1) break; // solid wall stops fire
          // Note: We do NOT break on bombs (3). If a bomb is hit, it explodes,
          // effectively continuing the danger zone.

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
  findSafePath(bot, grid, danger, opts = {}) {
    const minDistance = Number.isFinite(opts.minDistance)
      ? opts.minDistance
      : 2;
    const requireSafeNeighbor =
      typeof opts.requireSafeNeighbor === "boolean"
        ? opts.requireSafeNeighbor
        : true;

    // Weighted search (Dijkstra-ish): strongly prefer routes that stay out of danger,
    // but still allow stepping through danger if we start in it.
    const startKey = bot.x + "," + bot.y;
    const dist = { [startKey]: 0 };
    const parent = {};
    const open = [{ x: bot.x, y: bot.y, cost: 0 }];

    const bestCandidate = { key: null, score: Infinity, x: null, y: null };

    const maxExplore = 220; // small map, keep bounded
    let explored = 0;

    while (open.length > 0 && explored < maxExplore) {
      open.sort((a, b) => a.cost - b.cost);
      const cur = open.shift();
      explored++;

      const curKey = cur.x + "," + cur.y;
      const curCost = dist[curKey];

      // Candidate must be safe; by default avoid "marginal" safe tiles.
      if (danger[cur.y][cur.x] === 0) {
        const pathLen = this.pathLength(parent, bot, { x: cur.x, y: cur.y });
        const safeNeighborCount = this.countSafeNeighbors(
          grid,
          danger,
          cur.x,
          cur.y
        );
        if (!requireSafeNeighbor || safeNeighborCount >= 1) {
          const neighborDanger = this.countDangerNeighbors(
            danger,
            cur.x,
            cur.y
          );
          const preferDistance = pathLen >= minDistance ? 0 : 20;
          // Heavily penalize being next to danger (50), and prefer open spaces (safeNeighborCount).
          // (4 - safeNeighborCount) * 5 means: 0 penalty for 4 safe neighbors, 15 penalty for 1 safe neighbor.
          const score =
            curCost +
            neighborDanger * 50 +
            (4 - safeNeighborCount) * 5 +
            preferDistance;
          if (score < bestCandidate.score) {
            bestCandidate.key = curKey;
            bestCandidate.score = score;
            bestCandidate.x = cur.x;
            bestCandidate.y = cur.y;
          }
        }
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
        if (grid[ny][nx] === 1) continue;
        if (grid[ny][nx] === 2) continue;
        if (grid[ny][nx] === 3) continue; // bomb
        if (grid[ny][nx] === 5) continue; // fire

        const nk = nx + "," + ny;
        // Entering a danger tile is expensive.
        const stepPenalty = danger[ny][nx] === 1 ? 30 : 1;
        const nextCost = curCost + stepPenalty;
        if (dist[nk] === undefined || nextCost < dist[nk]) {
          dist[nk] = nextCost;
          parent[nk] = { x: cur.x, y: cur.y };
          open.push({ x: nx, y: ny, cost: nextCost });
        }
      }
    }

    if (!bestCandidate.key) return null;
    return this.reconstruct(parent, bot, {
      x: bestCandidate.x,
      y: bestCandidate.y,
    });
  }

  pathLength(came, start, goal) {
    let cx = goal.x;
    let cy = goal.y;
    let len = 0;
    while (cx !== start.x || cy !== start.y) {
      const key = cx + "," + cy;
      const p = came[key];
      if (!p) return Infinity;
      cx = p.x;
      cy = p.y;
      len++;
      if (len > 999) return Infinity;
    }
    return len;
  }

  countDangerNeighbors(danger, x, y) {
    let c = 0;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      if (ny < 0 || ny >= danger.length || nx < 0 || nx >= danger[0].length)
        continue;
      if (danger[ny][nx] === 1) c++;
    }
    return c;
  }

  countSafeNeighbors(grid, danger, x, y) {
    let c = 0;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      if (!this.inBounds(grid, nx, ny)) continue;
      if (grid[ny][nx] === 1) continue;
      if (grid[ny][nx] === 2) continue;
      if (grid[ny][nx] === 3) continue; // bomb
      if (grid[ny][nx] === 5) continue; // fire
      if (danger[ny][nx] === 0) c++;
    }
    return c;
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
        if (grid[bot.y][x] === 3) return false; // Bomb blocks line of sight
        if (grid[bot.y][x] === 5) return false; // Fire blocks line of sight
      }
      return true;
    }

    if (bot.x === target.x) {
      const minY = Math.min(bot.y, target.y);
      const maxY = Math.max(bot.y, target.y);

      for (let y = minY; y <= maxY; y++) {
        if (grid[y][bot.x] === 1) return false;
        if (grid[y][bot.x] === 2) return false;
        if (grid[y][bot.x] === 3) return false;
        if (grid[y][bot.x] === 5) return false;
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

  findSoftBlockApproachTile(bot, grid, danger) {
    const H = grid.length;
    const W = grid[0].length;

    let bestSoft = null;
    let bestSoftDist = Infinity;

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (grid[y][x] !== 2) continue;
        const d = Math.abs(x - bot.x) + Math.abs(y - bot.y);
        if (d < bestSoftDist) {
          bestSoftDist = d;
          bestSoft = { x, y };
        }
      }
    }

    if (!bestSoft) return null;

    const approach = [];
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const ax = bestSoft.x + dx;
      const ay = bestSoft.y + dy;
      if (!this.inBounds(grid, ax, ay)) continue;
      if (grid[ay][ax] === 1) continue;
      if (grid[ay][ax] === 2) continue;
      if (grid[ay][ax] === 3) continue; // bomb
      if (grid[ay][ax] === 5) continue; // fire
      const distToBot = Math.abs(ax - bot.x) + Math.abs(ay - bot.y);
      const dangerPenalty = danger && danger[ay][ax] === 1 ? 100 : 0;
      approach.push({ x: ax, y: ay, score: distToBot + dangerPenalty });
    }

    if (approach.length === 0) return null;
    approach.sort((a, b) => a.score - b.score);
    return { x: approach[0].x, y: approach[0].y };
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
        if (grid[ny][nx] === 3) continue; // bomb
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

  randomMove(grid, bot, danger) {
    const dirs = [
      { x: 0, y: -1 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
      { x: 1, y: 0 },
    ];

    // First try to find a safe move
    let valid = dirs.filter((d) => {
      const nx = bot.x + d.x;
      const ny = bot.y + d.y;
      return (
        this.inBounds(grid, nx, ny) &&
        grid[ny][nx] !== 1 &&
        grid[ny][nx] !== 2 &&
        grid[ny][nx] !== 3 && // bomb
        grid[ny][nx] !== 5 && // fire
        (!danger || danger[ny][nx] === 0)
      );
    });

    // If no safe moves, fall back to any valid move (desperation)
    if (valid.length === 0) {
      valid = dirs.filter((d) => {
        const nx = bot.x + d.x;
        const ny = bot.y + d.y;
        return (
          this.inBounds(grid, nx, ny) &&
          grid[ny][nx] !== 1 &&
          grid[ny][nx] !== 2 &&
          grid[ny][nx] !== 3 && // bomb
          grid[ny][nx] !== 5 // fire
        );
      });
    }

    if (valid.length === 0) return null;
    const d = valid[Math.floor(Math.random() * valid.length)];
    return { x: bot.x + d.x, y: bot.y + d.y };
  }
}
