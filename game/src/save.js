// localStorage save: cash, rep, missions done, packages found, position,
// wanted cleared on load. Continue restores progress at the safehouse.

import { SAVE_KEY } from './config.js';

export function createSave() {
  function blank() {
    return {
      cash: 250, rep: 0, missionsDone: [], packages: [],
      taxiFares: 0, stuntJumps: 0, timeTrials: 0,
      playerX: 0, playerZ: 300, health: 100, armor: 0,
      savedAt: 0,
    };
  }

  return {
    blank,
    load() {
      try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (!data || typeof data.cash !== 'number') return null;
        return { ...blank(), ...data };
      } catch {
        return null;
      }
    },
    write(state) {
      try {
        const data = {
          cash: state.cash, rep: state.rep,
          missionsDone: state.missionsDone, packages: state.packages,
          taxiFares: state.taxiFares, stuntJumps: state.stuntJumps,
          timeTrials: state.timeTrials,
          playerX: state.playerX, playerZ: state.playerZ,
          health: state.health, armor: state.armor,
          savedAt: Date.now(),
        };
        localStorage.setItem(SAVE_KEY, JSON.stringify(data));
        return true;
      } catch {
        return false;
      }
    },
    clear() {
      try { localStorage.removeItem(SAVE_KEY); } catch { /* storage unavailable */ }
    },
    progress(data) {
      // Percent complete: 8 missions (80%) + 12 packages (12%) + 3 activities (8%).
      const m = (data.missionsDone.length / 8) * 80;
      const p = (data.packages.length / 12) * 12;
      const a = Math.min(3, data.taxiFares + data.stuntJumps + data.timeTrials) / 3 * 8;
      return Math.min(100, Math.round(m + p + a));
    },
  };
}
