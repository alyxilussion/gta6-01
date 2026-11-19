// Meridian Cay — entry builder.
//
// Copies game/ and screenshots/ into the output directory, then writes the
// make.fun dossier from what is actually there. Deterministic: the same repo
// always produces the same bytes — directory entries are copied in sorted
// order, nothing carries a timestamp, and the dossier is canonical JSON.
//
// Run: node main.ts            (writes to /output, or MAKEFUN_OUTPUT_DIR)
// The grader runs this file twice in a sandbox and diffs the two outputs.

import { readdirSync, statSync, copyFileSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const REPO = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.MAKEFUN_OUTPUT_DIR || '/output';

// The bounty gate caps (from the kit's gate.json): the dossier builder
// refuses when any of them is exceeded, exactly as the scorer would.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

// Copy a tree in sorted order, counting files and bytes as we go.
function copyTree(src: string, dst: string, tally: { files: number; bytes: number }): void {
  mkdirSync(dst, { recursive: true });
  const names = readdirSync(src).sort();
  for (const name of names) {
    const from = join(src, name);
    const to = join(dst, name);
    if (statSync(from).isDirectory()) {
      copyTree(from, to, tally);
    } else {
      copyFileSync(from, to);
      tally.files += 1;
      tally.bytes += statSync(from).size;
    }
  }
}

// Clear the output directory's CONTENTS. The directory itself is never
// removed: the sandbox mounts it, and removing it would break the run.
function emptyDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
  for (const name of readdirSync(dir)) {
    rmSync(join(dir, name), { recursive: true, force: true });
  }
}

function build(): void {
  const gameDir = join(REPO, 'game');
  const shotsDir = join(REPO, 'screenshots');
  if (!existsSync(gameDir)) throw new Error('game/ is missing from the repo');
  if (!existsSync(shotsDir)) throw new Error('screenshots/ is missing from the repo');

  emptyDir(OUT);
  const game = { files: 0, bytes: 0 };
  const shots = { files: 0, bytes: 0 };
  copyTree(gameDir, join(OUT, 'game'), game);
  copyTree(shotsDir, join(OUT, 'screenshots'), shots);

  const dossier = buildDossier(OUT, CAPS);
  writeFileSync(join(OUT, 'dossier.json'), dossier);

  console.log(`meridian-cay: game ${game.files} files (${game.bytes} bytes), ` +
    `screenshots ${shots.files} files (${shots.bytes} bytes), ` +
    `dossier ${dossier.length} bytes -> ${OUT}`);
}

build();
