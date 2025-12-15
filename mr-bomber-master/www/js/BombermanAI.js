class BombermanAI {
  constructor(opts = {}) {
    this.id = opts.id || "ai";
    this.bombRange = opts.blastRadius || 2;

    this.lastDecision = 0;
    this.lastBombTime = 0;
    this.BOMB_COOLDOWN = 900;
    this.DECISION_INTERVAL = 30;

    this._escapeUntil = 0;
    this._escapePath = null;

    // Initialize Behavior Tree
    this.tree = this.buildBehaviorTree();
  }

  // ---------------------------------------------------
  // BEHAVIOR TREE BUILDER
  // ---------------------------------------------------
  buildBehaviorTree() {
    // Nodes are executed from top to bottom (Priority)
    return new Selector([
      // 1. SURVIVAL: If in danger, escape immediately
      new Sequence([
        new Condition((ctx) => this.isInDanger(ctx)),
        new Action((ctx) => this.performEscape(ctx)),
      ]),

      // 2. COMBAT: If enemy is vulnerable, attack (Minimax/Heuristic check)
      new Sequence([
        new Condition((ctx) => this.canAttack(ctx)),
        new Action((ctx) => this.performAttack(ctx)),
      ]),

      // 3. CLEARING: If blocked by soft block, destroy it
      new Sequence([
        new Condition((ctx) => this.isBlockedBySoftBlock(ctx)),
        new Action((ctx) => this.performClearBlock(ctx)),
      ]),

      // 4. STRATEGY: Use Minimax to find the best move (Hunt/Farm)
      new Action((ctx) => this.performMinimaxMove(ctx)),
    ]);
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

    // Pre-process Grid
    // 1=Wall, 2=Soft, 3=Bomb, 4=Powerup, 5=Fire, 0=Empty
    const grid = rawGrid.map((row) =>
      row.map((cell) => {
        if (cell.type === "wall") return 1;
        if (cell.type === "soft") return 2;
        if (cell.type === "bomb") return 3;
        if (cell.type === "powerup") return 4;
        if (cell.type === "fire") return 5;
        return 0;
      })
    );

    // Build Danger Map
    const danger = this.getDangerMap(grid, bombs);

    // Context object passed to all BT nodes
    const context = {
      bot,
      grid,
      danger,
      bombs,
      players,
      now,
      ai: this,
      result: { move: null, placeBomb: false }, // Output
    };

    // Execute Tree
    this.tree.tick(context);

    return context.result;
  }

  // ---------------------------------------------------
  // BT CONDITIONS & ACTIONS
  // ---------------------------------------------------

  isInDanger(ctx) {
    const { bot, danger, now } = ctx;
    // Check if current tile is dangerous OR if we are in "panic mode" (escape timer)
    return danger[bot.y][bot.x] === 1 || now < this._escapeUntil;
  }

  performEscape(ctx) {
    const { bot, grid, danger, now } = ctx;

    // Continue existing path if valid
    if (this._escapePath && this._escapePath.length > 0) {
      const next = this._escapePath[0];
      if (next.x === bot.x && next.y === bot.y) {
        this._escapePath.shift();
      }
    }

    // Recalculate if no path
    if (!this._escapePath || this._escapePath.length === 0) {
      this._escapePath = this.findSafePath(bot, grid, danger, {
        minDistance: 2,
        requireSafeNeighbor: true,
      });
    }

    // If we have a path, move
    if (this._escapePath && this._escapePath.length > 0) {
      ctx.result.move = this.stepTo(this._escapePath);
      return "SUCCESS";
    }

    // If waiting for bomb to explode and currently safe, stay put
    if (now < this._escapeUntil && danger[bot.y][bot.x] === 0) {
      // Optional: Micro-adjustment if neighbor is dangerous
      const neighborsDanger = this.countDangerNeighbors(danger, bot.x, bot.y);
      if (neighborsDanger > 0) {
        const betterPath = this.findSafePath(bot, grid, danger, {
          minDistance: 1,
          requireSafeNeighbor: true,
        });
        if (betterPath && betterPath.length > 0) {
          this._escapePath = betterPath;
          ctx.result.move = this.stepTo(this._escapePath);
          return "SUCCESS";
        }
      }
      return "SUCCESS"; // Stay safe
    }

    return "FAILURE"; // Trapped?
  }

  canAttack(ctx) {
    const { bot, players, grid, now } = ctx;
    if (now - this.lastBombTime < this.BOMB_COOLDOWN) return false;

    const target = this.findClosestEnemy(bot, players);
    if (!target) return false;

    return this.canBombEnemy(bot, target, grid);
  }

  performAttack(ctx) {
    const { bot, grid, bombs, now } = ctx;

    // Simulate placing a bomb to ensure we don't kill ourselves
    const safeRadius = (this.bombRange || 2) + 2;
    const simBombs = bombs.concat([
      { x: bot.x, y: bot.y, radius: safeRadius, timer: 999, ownerId: this.id },
    ]);
    const simDanger = this.getDangerMap(grid, simBombs);

    const escapePath = this.findSafePath(bot, grid, simDanger, {
      minDistance: safeRadius + 1,
      requireSafeNeighbor: true,
    });

    if (escapePath && escapePath.length > 0) {
      this.lastBombTime = now;
      this._escapeUntil = now + 4500;
      this._escapePath = escapePath;
      ctx.result.placeBomb = true;
      return "SUCCESS";
    }

    return "FAILURE"; // Unsafe to bomb
  }

  isBlockedBySoftBlock(ctx) {
    const { bot, grid, now } = ctx;
    if (now - this.lastBombTime < this.BOMB_COOLDOWN) return false;
    return this.isSoftBlockFront(bot, grid);
  }

  performClearBlock(ctx) {
    // Same logic as attack, but for blocks (slightly relaxed safety)
    const { bot, grid, bombs, now } = ctx;
    const safeRadius = (this.bombRange || 2) + 2;
    const simBombs = bombs.concat([
      { x: bot.x, y: bot.y, radius: safeRadius, timer: 999, ownerId: this.id },
    ]);
    const simDanger = this.getDangerMap(grid, simBombs);

    const escapePath = this.findSafePath(bot, grid, simDanger, {
      minDistance: safeRadius,
      requireSafeNeighbor: false,
    });

    if (escapePath && escapePath.length > 0) {
      this.lastBombTime = now;
      this._escapeUntil = now + 4500;
      this._escapePath = escapePath;
      ctx.result.placeBomb = true;
      return "SUCCESS";
    }
    return "FAILURE";
  }

  performMinimaxMove(ctx) {
    const { bot, grid, danger, players } = ctx;

    // Use Minimax to find the best adjacent cell to move to
    // Depth 2 is usually enough for real-time movement decisions
    const bestMove = this.minimax(grid, bot, players, danger, 2, true);

    if (bestMove && bestMove.move) {
      ctx.result.move = bestMove.move;
      return "SUCCESS";
    }

    // Fallback to A* if Minimax returns nothing (shouldn't happen often)
    // or if we just want to pathfind to a distant powerup
    const powerup = this.findClosestPowerUp(bot, grid);
    if (powerup) {
      const path = this.aStar(grid, bot, powerup, danger);
      if (path) {
        ctx.result.move = this.stepTo(path);
        return "SUCCESS";
      }
    }

    // Fallback Random
    ctx.result.move = this.randomMove(grid, bot, danger);
    return "SUCCESS";
  }

  // ---------------------------------------------------
  // MINIMAX ALGORITHM
  // ---------------------------------------------------
  minimax(grid, bot, players, danger, depth, isMaximizing) {
    // Terminal condition
    if (depth === 0) {
      return { score: this.evaluateState(grid, bot, players, danger) };
    }

    const validMoves = this.getValidMoves(grid, bot, danger);

    if (isMaximizing) {
      let maxEval = -Infinity;
      let bestMove = null;

      if (validMoves.length === 0) {
        // If no moves, evaluate current state (likely bad)
        return { score: this.evaluateState(grid, bot, players, danger) };
      }

      for (const move of validMoves) {
        // Simulate Move (Simplified: We don't clone the whole grid, just the bot pos)
        const nextBot = { x: move.x, y: move.y, id: bot.id };

        // Recursive call (Minimizing step: Enemy moves)
        const evalResult = this.minimax(
          grid,
          nextBot,
          players,
          danger,
          depth - 1,
          false
        );

        if (evalResult.score > maxEval) {
          maxEval = evalResult.score;
          bestMove = move;
        }
      }
      return { score: maxEval, move: bestMove };
    } else {
      // Minimizing Player (Enemy)
      // We assume the closest enemy tries to minimize our score (move closer to us)
      const enemy = this.findClosestEnemy(bot, players);
      if (!enemy)
        return { score: this.evaluateState(grid, bot, players, danger) };

      let minEval = Infinity;
      const enemyMoves = this.getValidMoves(grid, enemy, null); // Enemy ignores danger map for simplicity or assumes they are smart

      if (enemyMoves.length === 0)
        return { score: this.evaluateState(grid, bot, players, danger) };

      for (const move of enemyMoves) {
        const nextEnemy = { x: move.x, y: move.y, id: enemy.id };
        // We don't actually update the players array in simulation to save perf,
        // just pass the modified enemy to evaluation if needed, or assume state change.
        // For this simplified minimax, we just recurse back to Max.

        // Note: In a real full simulation, we'd update the grid.
        // Here we just tick depth.
        const evalResult = this.minimax(
          grid,
          bot,
          players,
          danger,
          depth - 1,
          true
        );

        if (evalResult.score < minEval) {
          minEval = evalResult.score;
        }
      }
      return { score: minEval };
    }
  }

  evaluateState(grid, bot, players, danger) {
    let score = 0;

    // 1. Safety (Heaviest Weight)
    if (danger[bot.y][bot.x] === 1) score -= 1000;

    // 2. Enemy Distance (Aggressive)
    const enemy = this.findClosestEnemy(bot, players);
    if (enemy) {
      const dist = Math.abs(bot.x - enemy.x) + Math.abs(bot.y - enemy.y);
      score -= dist * 10; // Closer is better
    }

    // 3. Powerups
    if (grid[bot.y][bot.x] === 4) score += 50;

    // 4. Center Control (Optional)
    // score -= (Math.abs(bot.x - grid[0].length/2) + Math.abs(bot.y - grid.length/2));

    return score;
  }

  getValidMoves(grid, unit, danger) {
    const moves = [];
    const dirs = [
      { x: 0, y: 0 }, // Stay
      { x: 0, y: -1 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
      { x: 1, y: 0 },
    ];

    for (const d of dirs) {
      const nx = unit.x + d.x;
      const ny = unit.y + d.y;
      if (this.inBounds(grid, nx, ny)) {
        const cell = grid[ny][nx];
        // Walkable: Empty(0), Powerup(4), Fire(5 - risky but walkable in engine usually, but we avoid)
        // Blocked: Wall(1), Soft(2), Bomb(3)
        const isWalkable = cell !== 1 && cell !== 2 && cell !== 3;
        const isSafe = !danger || danger[ny][nx] === 0;

        if (isWalkable && isSafe) {
          moves.push({ x: nx, y: ny });
        }
      }
    }
    return moves;
  }

  // ---------------------------------------------------
  // HELPERS (Reused)
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

// ---------------------------------------------------
// BEHAVIOR TREE CLASSES
// ---------------------------------------------------

class Node {
  tick(context) {
    return "FAILURE";
  }
}

class Selector extends Node {
  constructor(children) {
    super();
    this.children = children;
  }
  tick(context) {
    for (const child of this.children) {
      const status = child.tick(context);
      if (status === "SUCCESS" || status === "RUNNING") return status;
    }
    return "FAILURE";
  }
}

class Sequence extends Node {
  constructor(children) {
    super();
    this.children = children;
  }
  tick(context) {
    for (const child of this.children) {
      const status = child.tick(context);
      if (status === "FAILURE" || status === "RUNNING") return status;
    }
    return "SUCCESS";
  }
}

class Condition extends Node {
  constructor(predicate) {
    super();
    this.predicate = predicate;
  }
  tick(context) {
    return this.predicate(context) ? "SUCCESS" : "FAILURE";
  }
}

class Action extends Node {
  constructor(actionFn) {
    super();
    this.actionFn = actionFn;
  }
  tick(context) {
    return this.actionFn(context);
  }
}
