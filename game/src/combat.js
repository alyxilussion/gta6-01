// Combat: bullets, the player's gun, syndicate thugs who shoot back,
// and damage to peds, cars, cops and the player. Hitscan is faked with
// fast projectiles so tracers, sparks and misses all read on screen.
import { PLAYER } from './config.js';
import { spawnBlood, spawnMuzzle, spawnSparks } from './effects.js';
import { pushEvent } from './events.js';
import { damageCar } from './vehicles.js';
import { sfxHit, sfxShoot } from './audio.js';

export function initCombat(state) {
  state.bullets = [];
  state.thugs = [];
}

export function fireBullet(state, x, y, angle, opts = {}) {
  const speed = opts.speed || PLAYER.bulletSpeed;
  state.bullets.push({
    x, y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    life: 1.1,
    damage: opts.damage || PLAYER.bulletDamage,
    fromPlayer: !!opts.fromPlayer,
    fromCop: !!opts.fromCop,
    fromThug: !!opts.fromThug,
  });
  spawnMuzzle(state, x, y, angle);
}

function pointInCollider(city, x, y) {
  for (const r of city.colliders) {
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return true;
  }
  return false;
}

function hitCircle(b, x, y, radius) {
  return Math.hypot(b.x - x, b.y - y) < radius;
}

export function damagePlayer(state, amount) {
  if (state.player.hp <= 0) return;
  state.player.hp = Math.max(0, state.player.hp - amount);
  state.player.lastDamageAt = state.time;
  state.player.hitFlash = 1;
}

export function stepBullets(state, dt) {
  for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
    const b = state.bullets[i];
    b.life -= dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    let spent = b.life <= 0;
    if (!spent && pointInCollider(state.city, b.x, b.y)) {
      spawnSparks(state, b.x, b.y, '#FFC53D', 3, 120);
      spent = true;
    }
    if (!spent && b.fromPlayer) {
      // Thugs first (mission enemies), then cops, then peds, then cars.
      for (const thug of state.thugs) {
        if (thug.hp > 0 && hitCircle(b, thug.x, thug.y, 16)) {
          thug.hp -= b.damage;
          thug.alerted = true;
          spawnBlood(state, b.x, b.y);
          sfxHit();
          if (thug.hp <= 0) pushEvent(state, 'thugKilled', { thug });
          spent = true;
          break;
        }
      }
      if (!spent) {
        for (const cop of state.footCops) {
          if (cop.hp > 0 && hitCircle(b, cop.x, cop.y, 14)) {
            cop.hp -= b.damage;
            spawnBlood(state, b.x, b.y);
            sfxHit();
            if (cop.hp <= 0) pushEvent(state, 'copKilled', { cop });
            spent = true;
            break;
          }
        }
      }
      if (!spent) {
        for (const ped of state.peds) {
          if (ped.state !== 'dead' && hitCircle(b, ped.x, ped.y, 13)) {
            ped.state = 'dead';
            ped.deadTimer = 0;
            spawnBlood(state, b.x, b.y);
            pushEvent(state, 'pedHit', { fatal: true });
            spent = true;
            break;
          }
        }
      }
      if (!spent) {
        for (const car of state.cars) {
          if (car.dead || car.isPlayer) continue;
          if (hitCircle(b, car.x, car.y, 24)) {
            damageCar(state, car, b.damage * 0.5, 'shot');
            spawnSparks(state, b.x, b.y, '#FFC53D', 4, 140);
            spent = true;
            break;
          }
        }
      }
    }
    if (!spent && (b.fromCop || b.fromThug)) {
      const p = state.player;
      if (p.car) {
        if (hitCircle(b, p.car.x, p.car.y, 24)) {
          damageCar(state, p.car, b.damage * 0.4, 'shot');
          spawnSparks(state, b.x, b.y, '#FFC53D', 3, 120);
          spent = true;
        }
      } else if (p.hp > 0 && hitCircle(b, p.x, p.y, 14)) {
        damagePlayer(state, b.damage);
        spawnBlood(state, b.x, b.y);
        spent = true;
      }
    }
    if (spent) state.bullets.splice(i, 1);
  }
}

// The player fires toward the mouse while the button is held.
export function playerShoot(state, targetX, targetY) {
  const p = state.player;
  if (p.car || p.hp <= 0) return;
  if (state.time - p.lastShotAt < PLAYER.fireRate) return;
  p.lastShotAt = state.time;
  const angle = Math.atan2(targetY - p.y, targetX - p.x);
  p.angle = angle;
  const mx = p.x + Math.cos(angle) * 20;
  const my = p.y + Math.sin(angle) * 20;
  fireBullet(state, mx, my, angle + (Math.random() - 0.5) * 0.05, { fromPlayer: true });
  sfxShoot();
  pushEvent(state, 'shotFired', { x: p.x, y: p.y });
}

// Syndicate thugs: mission enemies with guns.
export function spawnThug(state, x, y, opts = {}) {
  const thug = {
    x, y,
    angle: 0,
    hp: opts.hp || 70,
    alerted: !!opts.alerted,
    shootTimer: 0.5 + Math.random(),
    burstLeft: 0,
    postX: x,
    postY: y,
    shirt: opts.shirt || '#8A2A2A', // maroon: reads as hostile at a glance
  };
  state.thugs.push(thug);
  return thug;
}

export function alertThugs(state, x, y, radius) {
  for (const thug of state.thugs) {
    if (thug.hp > 0 && Math.hypot(thug.x - x, thug.y - y) < radius) thug.alerted = true;
  }
}

export function stepThugs(state, dt) {
  const p = state.player;
  const px = p.car ? p.car.x : p.x;
  const py = p.car ? p.car.y : p.y;
  for (const thug of state.thugs) {
    if (thug.hp <= 0) continue;
    const dx = px - thug.x;
    const dy = py - thug.y;
    const dist = Math.hypot(dx, dy);
    if (!thug.alerted && dist < 420) thug.alerted = true;
    if (!thug.alerted) {
      // Idle: face the street, slight sway.
      thug.angle = Math.sin(state.time * 0.5 + thug.postX) * 0.3;
      continue;
    }
    thug.angle = Math.atan2(dy, dx);
    if (dist > 300) {
      // Close the distance.
      const speed = 165;
      thug.x += (dx / dist) * speed * dt;
      thug.y += (dy / dist) * speed * dt;
    } else if (dist < 150) {
      // Back off a little — thugs like mid-range.
      thug.x -= (dx / dist) * 60 * dt;
      thug.y -= (dy / dist) * 60 * dt;
    }
    thug.shootTimer -= dt;
    if (thug.shootTimer <= 0 && dist < 520) {
      thug.shootTimer = 0.55 + Math.random() * 0.5;
      const spread = 0.16;
      fireBullet(state, thug.x + Math.cos(thug.angle) * 18, thug.y + Math.sin(thug.angle) * 18,
        thug.angle + (Math.random() - 0.5) * spread * 2, { fromThug: true, damage: 8, speed: 700 });
      sfxShoot();
    }
  }
  // Remove long-dead thugs.
  for (let i = state.thugs.length - 1; i >= 0; i -= 1) {
    if (state.thugs[i].hp <= 0) {
      state.thugs[i].deadTimer = (state.thugs[i].deadTimer || 0) + dt;
      if (state.thugs[i].deadTimer > 20) state.thugs.splice(i, 1);
    }
  }
}

export function thugsAlive(state) {
  return state.thugs.filter((t) => t.hp > 0).length;
}
