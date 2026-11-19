// A tiny event queue so modules can report what happened (a crime, a
// kill, a pickup) without importing each other. main.js drains the queue
// after every step and applies the consequences (heat, stats, cash).
export function pushEvent(state, type, data) {
  state.events.push({ type, data: data || {} });
}

export function drainEvents(state) {
  const drained = state.events;
  state.events = [];
  return drained;
}
