// Global constants and flags

let cheats = {
  noClip: false,
  god: false,
};

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
  Fire: 8, // added to allow monster/player fire collision checks
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

// Maximum number of human + bot players allowed in a match
const MAX_PLAYERS = 8;

// Feature flags
const APOCALYPSE_ENABLED = true; // global enable; first round still overridden to off dynamically
