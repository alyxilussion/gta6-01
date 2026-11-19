// The Solarium Job — 8 story missions from Mama Zola, each a small stage
// machine: drive somewhere, steal something, lose the law, shoot it out,
// and finally hit the casino vault. Rewards pay cash + Rep.

import { MISSIONS } from './config.js';

function marker(x, z, label) {
  return { x, z, label };
}

export function createMissions() {
  let active = null; // {def, stage, stageT, data}
  let done = [];

  function startMission(index, G) {
    const def = MISSIONS[index];
    if (!def || done.includes(def.id)) return null;
    active = { def, index, stage: 0, stageT: 0, data: {} };
    G.audio.phone();
    G.hud.showPhone('MAMA ZOLA', def.brief);
    G.hud.banner('MISSION: ' + def.name.toUpperCase(), '');
    setupStage(G);
    return active;
  }

  function setupStage(G) {
    const m = active;
    const L = G.city.landmarks;
    const setMarker = (x, z, label, radius = 8) => {
      m.marker = marker(x, z, label);
      m.markerRadius = radius;
    };
    switch (m.def.id) {
      case 'm1':
        setMarker(L.harborMeet.x, L.harborMeet.z, 'Meet Mama Zola');
        G.hud.setObjective('Drive to the Old Harbor meet');
        break;
      case 'm2':
        if (m.stage === 0) {
          // A special coupe spawns on Casino Row.
          const car = G.vehicles.spawnCar(45, -315, Math.PI / 2, 1, { parked: true });
          m.data.targetCar = car;
          setMarker(45, -315, 'Steal the coupe');
          G.hud.setObjective('Steal the coupe on Casino Row');
        } else {
          setMarker(L.safehouse.x, L.safehouse.z, 'Bring it home');
          G.hud.setObjective('Bring the coupe to the safehouse');
        }
        break;
      case 'm3':
        G.police.addHeat(130, G);
        setMarker(L.sprayShop.x, L.sprayShop.z, 'Lose the heat');
        G.hud.setObjective('Lose the MCPA — reach Sunset Auto Body');
        break;
      case 'm4':
        if (m.stage === 0) {
          setMarker(-45, -225, 'Pick up the fare');
          G.hud.setObjective('Pick up the fare at the Strip');
          m.data.timer = 150;
        } else {
          setMarker(L.pier.x, 440, 'Drop at the pier');
          G.hud.setObjective('Drop the fare at Coral Beach pier');
        }
        break;
      case 'm5':
        if (m.stage === 0) {
          G.combat.spawnEnemy(315, -300, { tag: 'm5' });
          G.combat.spawnEnemy(315, -240, { tag: 'm5' });
          G.combat.spawnEnemy(270, -225, { tag: 'm5' });
          G.combat.spawnEnemy(360, -225, { tag: 'm5' });
          setMarker(315, -270, 'Clear the Foundry crew');
          G.hud.setObjective('Clear the rival crew at the Foundry (4 left)');
        } else {
          setMarker(L.safehouse.x, L.safehouse.z, 'Stash the crate');
          G.hud.setObjective('Take the crate to the safehouse');
        }
        break;
      case 'm6':
        m.data.timer = 120;
        setMarker(-45, -405, 'Cross before the lift');
        G.hud.setObjective('Reach the north bridge before it lifts!');
        break;
      case 'm7': {
        const truck = G.vehicles.spawnCar(-225, -45, Math.PI / 2, 2, {});
        truck.isTruck = true;
        truck.health = 400;
        m.data.truck = truck;
        setMarker(-225, -45, 'Stop the vault truck');
        G.hud.setObjective('Stop the vault truck on Meridian Ave');
        break;
      }
      case 'm8':
        if (m.stage === 0) {
          setMarker(L.casino.x, L.casino.z - 30, 'Reach the Solarium');
          G.hud.setObjective('Reach the Solarium Casino');
        } else if (m.stage === 1) {
          G.combat.spawnEnemy(-40, -280, { tag: 'm8' });
          G.combat.spawnEnemy(40, -280, { tag: 'm8' });
          G.combat.spawnEnemy(0, -280, { tag: 'm8' });
          G.combat.spawnEnemy(-40, -350, { tag: 'm8' });
          G.combat.spawnEnemy(40, -350, { tag: 'm8' });
          setMarker(L.casino.x, L.casino.z, 'Take the vault');
          G.hud.setObjective('Take the vault — clear the guards (5 left)');
        } else {
          G.police.addHeat(330, G);
          setMarker(L.safehouse.x, L.safehouse.z, 'Vanish');
          G.hud.setObjective('Vanish — reach the safehouse with 5 stars on you');
        }
        break;
      default:
        break;
    }
  }

  function atMarker(G) {
    if (!active || !active.marker) return false;
    const dx = G.player.x - active.marker.x;
    const dz = G.player.z - active.marker.z;
    const r = active.markerRadius || 8;
    return dx * dx + dz * dz < r * r;
  }

  function completeMission(G) {
    const def = active.def;
    done.push(def.id);
    G.cash += def.pay;
    G.rep += def.rep;
    G.effects.popup('MISSION COMPLETE  +' + def.pay + '  +REP', 'good');
    G.audio.cash();
    G.hud.banner('MISSION PASSED — ' + def.name.toUpperCase(), 'good');
    G.hud.setObjective('Next job: find the yellow marker');
    G.saveGame(true);
    active = null;
    G.onMissionComplete && G.onMissionComplete(def);
  }

  function failMission(G, reason) {
    G.hud.banner('MISSION FAILED — ' + reason, 'bad');
    G.audio.denied();
    G.combat.clearEnemies();
    if (active && active.data.truck) G.vehicles.removeCar(active.data.truck);
    active = null;
    G.hud.setObjective('Next job: find the yellow marker');
  }

  function nextMissionIndex() {
    for (let i = 0; i < MISSIONS.length; i++) {
      if (!done.includes(MISSIONS[i].id)) return i;
    }
    return -1;
  }

  function startPoint(G) {
    // Every mission starts at the safehouse door — the drive to the job
    // is part of the job. (The first mission's marker is the harbor meet,
    // across the map, so it can never complete instantly.)
    if (nextMissionIndex() < 0) return null;
    return { x: G.city.landmarks.safehouse.x, z: G.city.landmarks.safehouse.z - 14 };
  }

  return {
    get active() { return active; },
    get done() { return done; },
    setDone(list) { done = [...list]; },
    startMission,
    nextMissionIndex,
    startPoint,
    update(dt, G) {
      if (!active) return;
      const m = active;
      m.stageT += dt;
      // Mission timers.
      if (m.data.timer !== undefined) {
        m.data.timer -= dt;
        G.hud.setTimer(m.data.timer);
        if (m.data.timer <= 0) { failMission(G, 'OUT OF TIME'); return; }
      } else {
        G.hud.setTimer(null);
      }
      switch (m.def.id) {
        case 'm1':
          if (atMarker(G)) completeMission(G);
          break;
        case 'm2':
          if (m.stage === 0) {
            if (G.inCar && G.car === m.data.targetCar) {
              m.stage = 1;
              G.hud.banner('NICE WHEELS', 'good');
              setupStage(G);
            }
          } else if (atMarker(G) && G.inCar) {
            completeMission(G);
          }
          break;
        case 'm3':
          if (G.police.stars === 0) completeMission(G);
          else if (atMarker(G) && G.inCar) G.police.spray(G);
          break;
        case 'm4':
          if (m.stage === 0) {
            if (atMarker(G)) { m.stage = 1; G.hud.banner('FARE ON BOARD', 'good'); setupStage(G); }
          } else if (atMarker(G)) {
            completeMission(G);
            G.taxiFares++;
          }
          break;
        case 'm5': {
          const left = G.combat.enemies.filter((e) => e.tag === 'm5' && e.state !== 'down').length;
          if (m.stage === 0) {
            G.hud.setObjective('Clear the rival crew at the Foundry (' + left + ' left)');
            if (left === 0) { m.stage = 1; G.hud.banner('CRATE SECURED', 'good'); setupStage(G); }
          } else if (atMarker(G)) {
            completeMission(G);
          }
          break;
        }
        case 'm6':
          if (atMarker(G)) completeMission(G);
          break;
        case 'm7': {
          const truck = m.data.truck;
          if (!truck || truck.dead || truck.health <= 0) {
            G.cash += 400;
            G.effects.popup('VAULT CASH +$400', 'good');
            completeMission(G);
          } else {
            // The truck flees along Meridian Ave.
            truck.x += 11 * dt;
            if (truck.x > 400) { failMission(G, 'THE TRUCK GOT AWAY'); return; }
            truck.mesh.position.set(truck.x, 0, truck.z);
            m.marker = marker(truck.x, truck.z, 'Stop the vault truck');
          }
          break;
        }
        case 'm8': {
          if (m.stage === 0) {
            if (atMarker(G)) { m.stage = 1; setupStage(G); }
          } else if (m.stage === 1) {
            const left = G.combat.enemies.filter((e) => e.tag === 'm8' && e.state !== 'down').length;
            G.hud.setObjective('Take the vault — clear the guards (' + left + ' left)');
            if (left === 0) { m.stage = 2; G.hud.banner('VAULT CRACKED — RUN!', 'bad'); setupStage(G); }
          } else if (atMarker(G) && G.police.stars === 0) {
            completeMission(G);
          }
          break;
        }
        default:
          break;
      }
    },
  };
}
