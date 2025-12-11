class BombermanAI {
  constructor(opts = {}) {
    this.id = opts.id || "ai";
    this.bombRange = opts.blastRadius || 2;
    this.nextMove = null;
    this.shouldBomb = false;
    this.state = "search";
  }

  update(gameState) {
    const { grid: rawGrid, bombs, players } = gameState;

    const me = players.find((p) => p.id === this.id);
    if (!me) return { move: null, placeBomb: false };

    this.x = me.x;
    this.y = me.y;
    this.nextMove = null;
    this.shouldBomb = false;

    const gridWrapper = {
      width: rawGrid[0].length,
      height: rawGrid.length,
      inBounds: (x, y) =>
        x >= 0 && y >= 0 && x < rawGrid[0].length && y < rawGrid.length,
      isSolid: (x, y) => {
        if (x < 0 || y < 0 || x >= rawGrid[0].length || y >= rawGrid.length)
          return true;
        const t = rawGrid[y][x].type;
        return t === "wall" || t === "soft" || t === "bomb";
      },
      isWalkable: (x, y) => {
        if (x < 0 || y < 0 || x >= rawGrid[0].length || y >= rawGrid.length)
          return false;
        const t = rawGrid[y][x].type;
        return t !== "wall" && t !== "soft" && t !== "bomb";
      },
      isDestructible: (x, y) => {
        if (x < 0 || y < 0 || x >= rawGrid[0].length || y >= rawGrid.length)
          return false;
        return rawGrid[y][x].type === "soft";
      },
    };

    const enemies = players.filter((p) => p.id !== this.id && p.alive);
    const powerUps = [];
    for (let y = 0; y < gridWrapper.height; y++) {
      for (let x = 0; x < gridWrapper.width; x++) {
        if (rawGrid[y][x].type === "powerup") powerUps.push({ x, y });
      }
    }

    const game = {
      grid: gridWrapper,
      bombs,
      enemies,
      powerUps,
    };

    this.botAI(this, game);

    return {
      move: this.nextMove,
      placeBomb: this.shouldBomb,
    };
  }

  moveRight() {
    this.nextMove = { x: this.x + 1, y: this.y };
  }
  moveLeft() {
    this.nextMove = { x: this.x - 1, y: this.y };
  }
  moveDown() {
    this.nextMove = { x: this.x, y: this.y + 1 };
  }
  moveUp() {
    this.nextMove = { x: this.x, y: this.y - 1 };
  }
  placeBomb() {
    this.shouldBomb = true;
  }

  // --- FSM (Finite State Machine) ---
  // States: search, chase, attack, escape
  botAI(bot, game) {
    const { grid, bombs, enemies, powerUps } = game;
    const dangerMap = this.computeDangerMap(bombs, grid, bot.bombRange);

    // 1. Determine State
    this.state = this.determineState(bot, game, dangerMap);

    // 2. Execute State
    switch (this.state) {
      case "escape":
        this.moveTowardsSafety(bot, grid, dangerMap);
        break;
      case "attack":
        this.handleAttackState(bot, game, dangerMap, bombs);
        break;
      case "chase":
        this.handleChaseState(bot, game, dangerMap, bombs);
        break;
      case "search":
        this.handleSearchState(bot, game, dangerMap, bombs);
        break;
    }
  }

  determineState(bot, game, dangerMap) {
    // Priority 1: Safety (Danger Map)
    if (dangerMap[bot.y][bot.x] > 0) return "escape";

    const { enemies } = game;
    const enemy = this.nearest(bot, enemies);

    if (enemy) {
      // Priority 2: Attack Heuristic
      if (this.shouldAttack(bot, enemy, game.grid)) return "attack";
      // Priority 3: Chase
      return "chase";
    }

    // Priority 4: Search
    return "search";
  }

  // --- Attack Heuristic ---
  shouldAttack(bot, enemy, grid) {
    const dist = Math.abs(bot.x - enemy.x) + Math.abs(bot.y - enemy.y);
    // Simple heuristic: Attack if in range and line of sight (optional)
    return dist <= bot.bombRange;
  }

  handleAttackState(bot, game, dangerMap, bombs) {
    const { enemies } = game;
    const enemy = this.nearest(bot, enemies);
    if (!enemy) return;

    // Check if we can escape after placing bomb (Safety Heuristic)
    if (this.isSafeToBomb(bot, game.grid, dangerMap, bombs)) {
      bot.placeBomb();
      // Recalculate danger including the new bomb to escape immediately
      const simulatedBombs = [...bombs, { x: bot.x, y: bot.y, timer: 3 }];
      const newDanger = this.computeDangerMap(
        simulatedBombs,
        game.grid,
        bot.bombRange
      );
      this.moveTowardsSafety(bot, game.grid, newDanger);
    } else {
      // Cannot attack safely, treat as chase (reposition)
      this.handleChaseState(bot, game, dangerMap, bombs);
    }
  }

  handleChaseState(bot, game, dangerMap, bombs) {
    const { enemies, grid } = game;
    const enemy = this.nearest(bot, enemies);
    if (!enemy) return;

    // Try to move to enemy
    const path = this.aStar({ x: bot.x, y: bot.y }, enemy, grid, dangerMap);
    if (path && path.length >= 2) {
      this.moveTo(bot, enemy, grid, dangerMap);
    } else {
      // If path blocked, try to break walls
      this.attemptWallDestruction(bot, enemy, grid, dangerMap, bombs);
    }
  }

  handleSearchState(bot, game, dangerMap, bombs) {
    const { powerUps, grid } = game;

    // 1. Powerups
    if (powerUps.length > 0) {
      const best = this.nearest(bot, powerUps);
      if (best && this.moveTo(bot, best, grid, dangerMap)) return;
    }

    // 2. Break Walls (to find items/enemies)
    const wall = this.findNearestSoftBlock(bot, grid);
    if (wall) {
      if (this.attemptWallDestruction(bot, wall, grid, dangerMap, bombs))
        return;
    }

    // 3. Random
    this.randomMove(bot, grid);
  }

  // --- Helper Methods ---

  attemptWallDestruction(bot, target, grid, dangerMap, bombs) {
    // Find the specific wall blocking the path or the target itself if it is a wall
    let wall = target;
    if (!grid.isDestructible(target.x, target.y)) {
      wall = this.findBlockingWall(bot, target, grid, dangerMap);
    }

    if (!wall) return false;

    const dist = Math.abs(bot.x - wall.x) + Math.abs(bot.y - wall.y);

    // If we are next to the wall
    if (dist === 1) {
      // Check if placing a bomb here is safe
      if (this.isSafeToBomb(bot, grid, dangerMap, bombs)) {
        bot.placeBomb();
        // Immediately calculate escape move
        const simulatedBombs = [...bombs, { x: bot.x, y: bot.y, timer: 3 }];
        const newDanger = this.computeDangerMap(
          simulatedBombs,
          grid,
          bot.bombRange
        );
        this.moveTowardsSafety(bot, grid, newDanger);
        return true;
      }
    } else {
      // Move towards the wall to get in range
      const attackPos = this.findAdjacentWalkable(wall, grid, bot);
      if (attackPos) {
        return this.moveTo(bot, attackPos, grid, dangerMap);
      }
    }
    return false;
  }

  moveTowardsSafety(bot, grid, dangerMap) {
    const escape = this.findNearestSafeTile(bot, grid, dangerMap);
    if (escape) {
      this.moveTo(bot, escape, grid, dangerMap);
    }
  }

  isSafeToBomb(bot, grid, dangerMap, bombs) {
    const simulatedBombs = [...bombs, { x: bot.x, y: bot.y, timer: 3 }];
    const newDanger = this.computeDangerMap(
      simulatedBombs,
      grid,
      bot.bombRange
    );
    const escape = this.findNearestSafeTile(bot, grid, newDanger);
    return escape !== null;
  }

  findBlockingWall(bot, target, grid, dangerMap) {
    const path = this.aStar(
      { x: bot.x, y: bot.y },
      target,
      grid,
      dangerMap,
      true
    );
    if (path) {
      for (let node of path) {
        if (grid.isDestructible(node.x, node.y)) {
          return node;
        }
      }
    }
    return this.findNearestSoftBlock(bot, grid);
  }

  findNearestSoftBlock(bot, grid) {
    return this.findNearest(
      bot,
      grid,
      (x, y) => grid.isDestructible(x, y),
      (x, y) => grid.isWalkable(x, y)
    );
  }

  findNearestSafeTile(bot, grid, dangerMap) {
    return this.findNearest(
      bot,
      grid,
      (x, y) => dangerMap[y][x] === 0,
      (x, y) => grid.isWalkable(x, y)
    );
  }

  // Optimized Dijkstra Search (replaces BFS)
  findNearest(start, grid, predicate, walkableCheck) {
    const pq = new MinHeap();
    pq.push({ x: start.x, y: start.y, g: 0, f: 0 });
    const visited = new Set([`${start.x},${start.y}`]);

    while (!pq.isEmpty()) {
      const { x, y, g } = pq.pop();

      if (predicate(x, y)) return { x, y };

      const dirs = [
        { x: 1, y: 0 },
        { x: -1, y: 0 },
        { x: 0, y: 1 },
        { x: 0, y: -1 },
      ];
      for (let d of dirs) {
        const nx = x + d.x;
        const ny = y + d.y;
        const key = `${nx},${ny}`;

        if (!grid.inBounds(nx, ny)) continue;
        if (visited.has(key)) continue;

        // If it's the target, we can "reach" it even if it's not walkable (e.g. soft block)
        // But if it's not the target, we must be able to walk on it.
        const isTarget = predicate(nx, ny);
        if (!isTarget && !walkableCheck(nx, ny)) continue;

        visited.add(key);
        pq.push({ x: nx, y: ny, g: g + 1, f: g + 1 });
      }
    }
    return null;
  }

  // --- Danger Map ---
  computeDangerMap(bombs, grid, explosionRange) {
    const danger = Array.from({ length: grid.height }, () =>
      Array(grid.width).fill(0)
    );

    bombs.forEach((bomb) => {
      let { x, y, timer } = bomb;
      if (timer === undefined) timer = 3;

      const dirs = [
        { x: 1, y: 0 },
        { x: -1, y: 0 },
        { x: 0, y: 1 },
        { x: 0, y: -1 },
      ];

      if (grid.inBounds(x, y)) danger[y][x] = timer;

      dirs.forEach((d) => {
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

  // --- A* (A-Star Algorithm) ---
  aStar(start, goal, grid, dangerMap, allowSoftBlocks = false) {
    const pq = new MinHeap();
    const closed = new Set();

    const hStart = Math.abs(start.x - goal.x) + Math.abs(start.y - goal.y);
    pq.push({
      pos: start,
      g: 0,
      h: hStart,
      f: hStart,
      parent: null,
    });

    while (!pq.isEmpty()) {
      const current = pq.pop();
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

      if (closed.has(key)) continue;
      closed.add(key);

      const dirs = [
        { x: 1, y: 0 },
        { x: -1, y: 0 },
        { x: 0, y: 1 },
        { x: 0, y: -1 },
      ];

      for (let d of dirs) {
        const next = { x: current.pos.x + d.x, y: current.pos.y + d.y };
        const nextKey = `${next.x},${next.y}`;

        if (closed.has(nextKey)) continue;
        if (!grid.inBounds(next.x, next.y)) continue;

        let isWalkable = grid.isWalkable(next.x, next.y);
        let isSoft = grid.isDestructible(next.x, next.y);

        if (!isWalkable) {
          if (!(allowSoftBlocks && isSoft)) continue;
        }

        const dangerCost = dangerMap[next.y][next.x] > 0 ? 1000 : 0;
        const softBlockCost = allowSoftBlocks && isSoft ? 5 : 0;

        const g = current.g + 1 + dangerCost + softBlockCost;
        const h = Math.abs(next.x - goal.x) + Math.abs(next.y - goal.y);
        const f = g + h;

        pq.push({ pos: next, g, h, f, parent: current });
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

  findAdjacentWalkable(target, grid, bot) {
    if (bot) {
      const dist = Math.abs(bot.x - target.x) + Math.abs(bot.y - target.y);
      if (dist === 1 && grid.isWalkable(bot.x, bot.y)) {
        return { x: bot.x, y: bot.y };
      }
    }

    const dirs = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ];
    for (let d of dirs) {
      const nx = target.x + d.x;
      const ny = target.y + d.y;
      if (grid.isWalkable(nx, ny)) return { x: nx, y: ny };
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

  randomMove(bot, grid) {
    const dirs = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ];
    const valid = dirs.filter((d) => grid.isWalkable(bot.x + d.x, bot.y + d.y));
    if (valid.length) {
      const d = valid[Math.floor(Math.random() * valid.length)];
      const target = { x: bot.x + d.x, y: bot.y + d.y };
      if (target.x > bot.x) bot.moveRight();
      else if (target.x < bot.x) bot.moveLeft();
      else if (target.y > bot.y) bot.moveDown();
      else if (target.y < bot.y) bot.moveUp();
    }
  }
}

class MinHeap {
  constructor() {
    this.heap = [];
  }
  push(val) {
    this.heap.push(val);
    this.bubbleUp(this.heap.length - 1);
  }
  pop() {
    if (this.heap.length === 0) return null;
    const top = this.heap[0];
    const bottom = this.heap.pop();
    if (this.heap.length > 0) {
      this.heap[0] = bottom;
      this.bubbleDown(0);
    }
    return top;
  }
  isEmpty() {
    return this.heap.length === 0;
  }
  bubbleUp(index) {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.heap[parent].f <= this.heap[index].f) break;
      [this.heap[parent], this.heap[index]] = [
        this.heap[index],
        this.heap[parent],
      ];
      index = parent;
    }
  }
  bubbleDown(index) {
    while (true) {
      let left = 2 * index + 1;
      let right = 2 * index + 2;
      let smallest = index;
      if (left < this.heap.length && this.heap[left].f < this.heap[smallest].f)
        smallest = left;
      if (
        right < this.heap.length &&
        this.heap[right].f < this.heap[smallest].f
      )
        smallest = right;
      if (smallest === index) break;
      [this.heap[index], this.heap[smallest]] = [
        this.heap[smallest],
        this.heap[index],
      ];
      index = smallest;
    }
  }
}
