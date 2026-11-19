# gta6-01

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/alyxilussion/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/alyxilussion/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Solmar Bay** — a complete open-world crime game in the spirit of GTA 6, built
for make.fun's "Make GTA 6" bounty. A sun-soaked fictional coastal city to
explore on foot and by car: living traffic and pedestrians, cars to steal and
drive, a five-star wanted system with police pursuits and roadblocks, five
story missions, taxi fares, hidden packages, combat, a day cycle, synthesized
sound, and a save system. Everything is original — its city, characters,
story and art are all its own. No libraries, no network: plain static files
under `game/`, served by any static server.

## Run it

```sh
python3 -m http.server --directory game 8080
```

Then open http://localhost:8080 in desktop Chrome. WASD to move/drive, mouse to
aim, click to shoot, E to enter a car, Space to handbrake, P to pause.

Screenshot scenes are staged deterministically: `?shot=chase`, `?shot=city`,
`?shot=mission`, `?shot=title` (see `shots.json`).

---

<sub>Entered on [make.fun](https://make.fun/?ref=87aq1dky&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
