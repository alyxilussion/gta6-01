// Third-person chase camera: smooth follow with look-ahead, speed FOV kick,
// mouse-orbit offset, and a simple pull-in so it rarely clips buildings.

import * as THREE from 'three';
import { clamp, damp, dampAngle } from './random.js';

export function createCamera(camera) {
  const pos = new THREE.Vector3(0, 12, 24);
  const look = new THREE.Vector3();
  let yaw = 0;
  let orbit = 0; // mouse orbit offset, decays to 0
  let fov = 62;

  return {
    get yaw() { return yaw; },
    snap(x, y, z, heading) {
      yaw = heading;
      const d = 13;
      pos.set(x - Math.sin(heading) * d, y + 6, z - Math.cos(heading) * d);
      look.set(x, y + 2, z);
      camera.position.copy(pos);
      camera.lookAt(look);
    },
    update(dt, target, heading, speed, driving, effects) {
      // Mouse orbit: drag the view around, it eases back behind the target.
      orbit = damp(orbit, 0, 1.2, dt);
      const wantYaw = heading + orbit;
      yaw = dampAngle(yaw, wantYaw, driving ? 4.5 : 6, dt);
      const dist = driving ? 13.5 + Math.min(4, speed * 0.08) : 10;
      const height = driving ? 5.2 : 4.6;
      const tx = target.x - Math.sin(yaw) * dist;
      const tz = target.z - Math.cos(yaw) * dist;
      const ty = target.y + height;
      const rate = driving ? 7 : 9;
      pos.x = damp(pos.x, tx, rate, dt);
      pos.y = damp(pos.y, ty, rate, dt);
      pos.z = damp(pos.z, tz, rate, dt);
      if (pos.y < 1.6) pos.y = 1.6;
      // Look ahead in the direction of travel.
      const lead = driving ? Math.min(8, speed * 0.25) : 3;
      look.x = damp(look.x, target.x + Math.sin(heading) * lead, 10, dt);
      look.y = damp(look.y, target.y + 2.2, 10, dt);
      look.z = damp(look.z, target.z + Math.cos(heading) * lead, 10, dt);
      const sh = effects.shakeOffset();
      camera.position.set(pos.x + sh.x, pos.y + sh.y, pos.z);
      camera.lookAt(look);
      const wantFov = 62 + clamp(speed * 0.35, 0, 14);
      fov = damp(fov, wantFov, 4, dt);
      if (Math.abs(camera.fov - fov) > 0.05) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
    },
    addOrbit(dx) {
      orbit = clamp(orbit - dx * 0.004, -1.2, 1.2);
    },
  };
}
