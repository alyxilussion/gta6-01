// Save and load: mission progress, cash, packages and stats in
// localStorage. Autosaves on mission completion; the player can also save
// at the Safehouse marker or from the pause menu.
import { SAVE_KEY } from './config.js';

export function hasSave() {
  try {
    return !!window.localStorage.getItem(SAVE_KEY);
  } catch {
    return false;
  }
}

export function saveGame(state) {
  try {
    const data = {
      version: 1,
      cash: state.player.cash,
      missionIndex: state.mission.index,
      missionComplete: state.mission.complete,
      packages: state.packages.map((p) => p.taken),
      stats: state.stats,
      timeOfDay: state.timeOfDay,
      player: { x: state.player.x, y: state.player.y },
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadSave(state) {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return false;
    state.player.cash = data.cash || 0;
    state.stats = { ...state.stats, ...(data.stats || {}) };
    state.timeOfDay = typeof data.timeOfDay === 'number' ? data.timeOfDay : 17.5;
    if (Array.isArray(data.packages)) {
      data.packages.forEach((taken, i) => {
        if (state.packages[i]) state.packages[i].taken = !!taken;
      });
    }
    if (data.player) {
      state.player.x = data.player.x;
      state.player.y = data.player.y;
    }
    if (data.missionComplete) {
      state.mission.index = 4;
      state.mission.complete = true;
      state.mission.active = false;
    } else if (typeof data.missionIndex === 'number') {
      state.mission.index = data.missionIndex;
    }
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Storage unavailable — nothing to clear.
  }
}
