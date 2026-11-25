import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';

// Serve the media client from our own origin. The viewer imports it on demand.
await mkdir('public/assets', { recursive: true });
await build({
  stdin: {
    contents: "export { Room, RoomEvent, Track, ParticipantKind } from 'livekit-client';",
    resolveDir: process.cwd(),
  },
  outfile: 'public/assets/livekit.mjs',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2020'],
  minify: true,
  legalComments: 'linked',
});

// Only ship runtime code. Never enumerate user credentials or runtime data.
const modules = (await readdir('worker')).filter(name =>
  /^[a-z][a-z0-9-]*\.mjs$/.test(name) && !name.includes('.test.')
);
const files = await Promise.all(['package.json', 'package-lock.json', ...modules].map(async name =>
  [name, await readFile('worker/' + name, 'utf8')]
));
await writeFile('server/worker-files.json', JSON.stringify(Object.fromEntries(files)));

// The Sandbox SDK re-exports an optional CJS drive adapter that requires an ESM
// package. Bundle this server-only SDK once so Vercel's function loader doesn't
// resolve that mixed module graph differently from local Node.
await build({
  stdin: { contents: "export { Sandbox } from '@vercel/sandbox';", resolveDir: process.cwd() },
  outfile: 'server/sandbox-sdk.mjs',
  platform: 'node', format: 'esm', bundle: true, target: 'node24',
  banner: { js: "import {createRequire as __bulletinRequire} from 'node:module';const require=__bulletinRequire(import.meta.url);" },
});
import './build-english.js';
