# MERIDIAN CAY

![make.fun bounty](https://make.fun/badge/gta6-01.svg)
![rank](https://make.fun/badge/gta6-01/alyxilussion/gta6-01/rank.svg)
![reward](https://make.fun/badge/gta6-01/alyxilussion/gta6-01/reward.svg)

An open-world crime game in the browser — built for the [gta6-01 bounty on make.fun](https://make.fun). No installs, no network: open `game/index.html` and play.

## The game

You are **Rook**, a getaway driver back in **Meridian Cay** — a sun-soaked canal city of six districts: Old Harbor, the Solarium Strip, the Foundry, Palmetto Rows, Coral Beach, and Midtown. The fixer **Mama Zola** has eight jobs for you, ending in **The Solarium Job**: a casino-vault heist with the whole MCPA on your tail.

**The hook — drawbridges on a schedule.** Three drawbridges cross the canal, and they lift on a fixed cycle (first lift 45 seconds in, then every 3 minutes, up for 30 seconds). The HUD counts down every lift. Cross before it rises — or swim for it. One mission, *Bridge Run*, is a race against the lift itself.

## Systems

- **Open world, on foot and by car** — steal any of 6 car models, traffic AI that stops for lifted bridges, pedestrians who flee from gunfire
- **5-star wanted system** — the MCPA (Meridian Cay Port Authority) chases with cop cars, foot cops, roadblocks at 3+ stars, and the Skyhook helicopter at 4+. Respray at Sunset Auto Body to clear the heat
- **8 story missions** with phone dialogue from Mama Zola, timers, shootouts, a vault-truck ambush, and the final heist
- **Side content** — 12 hidden packages, 3 stunt jumps, a beach-sprint time trial, taxi fares
- **Rep ranks** — Nobody → Wheelman → Getaway Driver → Cay Runner → King of the Strip → Legend of the Cay
- **Save** — localStorage autosave after every mission, manual save at the safehouse, Continue on the title screen
- **Radio** — two procedural WebAudio stations (CAY FM 88.5, SOLAR 101) with named tracks; synth SFX throughout
- **HUD** — round live minimap, stars, cash, clock, street + district readout, bridge countdown, objective + timer

## Controls

| Key | Action |
| --- | --- |
| WASD | Move / drive |
| Shift | Sprint / boost |
| Space | Jump / handbrake |
| E | Enter / exit car |
| F | Interact (missions, save, respray) |
| Click | Shoot (on foot) |
| R | Radio station |
| M | Mute |
| P / Esc | Pause |
| Drag mouse | Look around |

## Tech

- Three.js (vendored `three.module.min.js`, r160) + plain ES modules — zero network requests, zero build step
- Procedural city: instanced buildings, palms and lamps, gradient sky dome, golden-hour sun with a shadow camera that follows the player
- Fixed-timestep simulation (60 Hz) with a decoupled render loop
- 17 source modules under `game/src/`, one job each: `city`, `vehicles`, `pedestrians`, `police`, `combat`, `missions`, `hud`, `audio`, `effects`, `save`, `input`, `camera`, `player`, `config`, `random`, `shots`, `main`
- Screenshot scenes are deterministic: `?shot=chase|city|mission|title`

## Screenshots

Captured from the game itself at 1280×720:

1. `1-chase.jpg` — 3-star chase down Meridian Ave
2. `2-city.jpg` — on foot in the Solarium Strip at golden hour
3. `3-mission.jpg` — the Foundry shootout (mission 5)
4. `4-title.jpg` — title screen over the city

## License

MIT — see [LICENSE](LICENSE). All names, places and characters are invented; a fan-made game, not affiliated with any commercial game.
