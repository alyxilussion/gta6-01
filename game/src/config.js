// Meridian Cay — tuning, palette, districts, names. Every value here is ours.
// The city is a 9x9 block grid: BLOCK 72 + ROAD 18 = PITCH 90, roads at odd
// multiples of 45. A canal runs north-south on the x = -135 road line; three
// drawbridges cross it at z = -225, -45 and 135.

export const CITY = {
  seed: 1337,
  blocks: 9,
  block: 72,
  road: 18,
  pitch: 90,
  half: 405, // roads run -405..405
  sidewalk: 3,
  canalX: -135,
  bridges: [-225, -45, 135],
  bridgeCycleSec: 180, // a bridge lifts every 3 minutes
  bridgeLiftSec: 30, // stays up 30 seconds
  beachZ: 414, // sand starts here
  waterZ: 470, // sea starts here
};

// Golden-hour palette: warm sun, long shadows, orange-pink sky.
export const PALETTE = {
  skyTop: 0x7ec8e3,
  skyHorizon: 0xffb877,
  fog: 0xf7c489,
  sun: 0xffb347,
  sunIntensity: 2.6,
  hemiSky: 0xffe0b3,
  hemiGround: 0x5c4a3a,
  asphalt: 0x2b2f36,
  roadLine: 0xf5d76e,
  sidewalk: 0x9a938a,
  sand: 0xe8cf9a,
  water: 0x2e7f9e,
  canalWater: 0x2a6f8e,
  grass: 0x6f9e5a,
  hudGold: '#ffd166',
  hudRed: '#ff4757',
  hudBlue: '#4da6ff',
  hudWhite: '#ffffff',
};

export const DISTRICTS = [
  { id: 'harbor', name: 'Old Harbor', bounds: [-405, -270, -405, 405], tint: 0x8fa3b8, style: 'docks' },
  { id: 'strip', name: 'Solarium Strip', bounds: [-135, 135, -405, -135], tint: 0xd98cb8, style: 'neon' },
  { id: 'foundry', name: 'Foundry District', bounds: [270, 405, -405, -45], tint: 0xc98a5a, style: 'industrial' },
  { id: 'palmetto', name: 'Palmetto Rows', bounds: [-270, 270, 135, 405], tint: 0x9dbb7a, style: 'suburb' },
  { id: 'beach', name: 'Coral Beach', bounds: [-405, 405, 405, 470], tint: 0xe8cf9a, style: 'beach' },
];

export function districtAt(x, z) {
  for (const d of DISTRICTS) {
    const [x0, x1, z0, z1] = d.bounds;
    if (x >= x0 && x < x1 && z >= z0 && z < z1) return d;
  }
  return { id: 'midtown', name: 'Midtown', tint: 0xb8a88f, style: 'mixed' };
}

// Street names: invented, one per road line.
export const STREET_NS = ['Anchor Way', 'Gull Street', 'Harbor Line', 'Canal Row', 'Meridian Ave', 'Zola Street', 'Foundry Road', 'Coral Drive', 'Ember Lane', 'Palm Court'];
export const STREET_EW = ['Sunset Blvd', 'Casino Row', 'Tide Street', 'Market Lane', 'Solarium Ave', 'Bridge Street', 'Palmetto Ave', 'Shoreline Dr', 'Jacaranda Way', 'Boardwalk'];

export function streetAt(x, z) {
  // Nearest road line decides the street name.
  const lines = [-405, -315, -225, -135, -45, 45, 135, 225, 315, 405];
  let bi = 0; let bd = 1e9;
  for (let i = 0; i < lines.length; i++) {
    const d = Math.min(Math.abs(x - lines[i]), Math.abs(z - lines[i]));
    if (d < bd) { bd = d; bi = i; }
  }
  const ns = Math.abs(x - lines[bi]) <= Math.abs(z - lines[bi]);
  return ns ? STREET_NS[bi] : STREET_EW[bi];
}

export const PLAYER = {
  walkSpeed: 9,
  sprintSpeed: 15,
  jumpSpeed: 9,
  radius: 1.1,
  maxHealth: 100,
  maxArmor: 100,
  interactRange: 6,
};

export const DRIVING = {
  accel: 26,
  brake: 42,
  reverseMax: 14,
  maxSpeed: 52, // ~187 km/h
  steerRate: 1.9,
  grip: 7.5,
  driftGrip: 2.6,
  drag: 0.35,
  trafficSpeed: 13,
};

export const WANTED = {
  starHeat: [0, 25, 60, 120, 200, 320], // heat needed per star (index = stars)
  decayPerSec: 6, // when hidden from all police
  heatHitPed: 30,
  heatHitCop: 45,
  heatSteal: 20,
  heatShoot: 15,
  heatKill: 60,
  bustRange: 3.2,
  sprayCost: 100,
  sprayCooldownSec: 20,
};

export const MISSIONS = [
  { id: 'm1', name: 'First Gear', pay: 150, rep: 10, brief: 'Mama Zola needs a driver. Get to the Old Harbor meet.' },
  { id: 'm2', name: 'Borrowed Wheels', pay: 250, rep: 15, brief: 'Steal the coupe parked on Casino Row. No witnesses, Rook.' },
  { id: 'm3', name: 'Cold Trail', pay: 300, rep: 20, brief: 'The MCPA is on you. Lose them — three stars and counting.' },
  { id: 'm4', name: 'Fare Play', pay: 200, rep: 15, brief: 'A fare is waiting at the Strip. Drop them at the pier, fast.' },
  { id: 'm5', name: 'Foundry Fire', pay: 450, rep: 25, brief: 'Rival crew at the Foundry. Clear them out and take the crate.' },
  { id: 'm6', name: 'Bridge Run', pay: 400, rep: 25, brief: 'The north bridge lifts in two minutes. Beat it — or swim.' },
  { id: 'm7', name: 'Vault Truck', pay: 600, rep: 35, brief: 'Ambush the Solarium vault truck on Meridian Ave. Take the cash.' },
  { id: 'm8', name: 'The Solarium Job', pay: 1500, rep: 60, brief: 'The big one. Hit the casino vault and vanish into the Cay.' },
];

export const REP_RANKS = [
  { rep: 0, title: 'Nobody' },
  { rep: 40, title: 'Wheelman' },
  { rep: 90, title: 'Getaway Driver' },
  { rep: 140, title: 'Cay Runner' },
  { rep: 180, title: 'King of the Strip' },
  { rep: 205, title: 'Legend of the Cay' }, // 205 = every mission's Rep
];

export function repTitle(rep) {
  let t = REP_RANKS[0].title;
  for (const r of REP_RANKS) if (rep >= r.rep) t = r.title;
  return t;
}

export const RADIO = [
  { id: 'cayfm', name: 'CAY FM 88.5', tag: 'sunset drive', tracks: ['Palmetto Sunset', 'Neon Tide', 'Harbor Lights', 'Golden Hour Run'] },
  { id: 'solar', name: 'SOLAR 101', tag: 'night pulse', tracks: ['Midnight Meridian', 'Casino Static', 'Drawbridge Blues', 'Rook\'s Theme'] },
];

export const CAR_MODELS = [
  { name: 'Comet Sedan', color: 0xd94f4f, speed: 1.0, body: [4.4, 1.1, 2.0] },
  { name: 'Palmetto Coupe', color: 0x4f7fd9, speed: 1.12, body: [4.2, 1.0, 1.9] },
  { name: 'Harbor Van', color: 0xe8e0d0, speed: 0.85, body: [4.8, 1.6, 2.1] },
  { name: 'Coral Convertible', color: 0xffd166, speed: 1.18, body: [4.1, 0.9, 1.9] },
  { name: 'Foundry Pickup', color: 0x6f9e5a, speed: 0.95, body: [4.9, 1.2, 2.1] },
  { name: 'Solarium Limo', color: 0x2b2f36, speed: 1.05, body: [5.6, 1.2, 2.0] },
];

export const SAVE_KEY = 'meridian-cay-save-v2';
export const DAY_MINUTES = 18 * 60 + 24; // the game opens at golden hour, 18:24
