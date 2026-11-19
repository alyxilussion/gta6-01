// Solmar Bay — tuning constants and the Solmar Sunset palette.
// One place for every number the game balances on, so a playtest fix
// never means hunting through a dozen files.
export const WORLD = {
  width: 4800,
  height: 3600,
  oceanEdge: 240, // x < this is water
  beachEdge: 480, // x < this is sand
  roadWidthV: 120,
  roadWidthH: 110,
  seed: 1337,
};

// Vertical avenues (x) and horizontal streets (y) of the road grid.
export const AVENUES = [700, 1300, 1900, 2500, 3100, 3700, 4300];
export const STREETS = [500, 1100, 1700, 2300, 2900];
export const COASTAL_ROAD_X = 560; // Ocean Drive, along the beach

// Solmar Sunset palette — every named color the game draws with.
export const PALETTE = {
  coral: '#FF6B4A',
  magenta: '#FF2E88',
  teal: '#0E7C7B',
  sand: '#F2D8A7',
  asphalt: '#23232E',
  violet: '#2B1B4E',
  gold: '#FFC53D',
  ocean: '#1B7F8E',
  oceanDeep: '#0F5A66',
  grass: '#7BA05B',
  sidewalk: '#C9BFA8',
  buildingRoof: '#8E8AA3',
};

export const PLAYER = {
  walkSpeed: 235,
  sprintSpeed: 345,
  radius: 14,
  maxHp: 100,
  fireRate: 0.16, // seconds between shots
  bulletSpeed: 900,
  bulletDamage: 34,
  regenDelay: 5, // seconds after last damage before regen
  regenRate: 6, // hp per second
};

export const CAR = {
  accel: 420,
  brake: 700,
  reverseMax: 180,
  maxSpeed: 560,
  grip: 6.5, // lateral velocity damping (higher = grippier)
  driftGrip: 2.2, // with handbrake held
  turnRate: 2.6, // radians per second at full lock, scaled by speed
  length: 46,
  width: 22,
  maxHp: 100,
};

export const TRAFFIC = {
  targetCars: 14,
  targetParked: 22,
  speed: 170,
  spawnDistance: 900,
  despawnDistance: 1400,
};

export const PEDS = {
  target: 42,
  walkSpeed: 55,
  fleeSpeed: 210,
  spawnDistance: 800,
  despawnDistance: 1300,
};

export const WANTED = {
  maxStars: 5,
  heatPerStar: 100,
  decayDelay: 8, // seconds unseen before heat decays
  decayRate: 6, // heat per second while hidden
  stealHeat: 45,
  killPedHeat: 60,
  killCopHeat: 120,
  shootHeat: 8, // per shot heard by a cop nearby
  resprayCost: 100,
};

export const COP = {
  accel: 470,
  maxSpeed: 590,
  ramDamage: 12,
  footSpeed: 260,
  shootRange: 320,
  shootDamage: 7,
  bustRadius: 46,
  bustTime: 1.2, // seconds adjacent while slow to get busted
};

export const TIME = {
  start: 17.5, // golden hour
  hoursPerSecond: 1 / 150, // one game hour per 2.5 real minutes
};

export const CAMERA = {
  lookahead: 0.35, // fraction of velocity to look ahead by
  smoothing: 4.5,
  driveZoomOut: 0.82, // zoom at top speed while driving
  shakeDecay: 6,
};

export const SAVE_KEY = 'solmar-bay-save-v1';
