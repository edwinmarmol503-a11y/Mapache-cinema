import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
const root = process.cwd();
const output = path.resolve(root, 'dist');
if (path.dirname(output) !== root) throw new Error('La salida debe estar dentro del proyecto.');
await rm(output, { recursive: true, force: true });
await mkdir(path.join(output, 'client'), { recursive: true });
await mkdir(path.join(output, 'server'), { recursive: true });
await mkdir(path.join(output, '.openai'), { recursive: true });
for (const item of ['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'icons', 'assets']) {
  await cp(path.join(root, item), path.join(output, 'client', item), { recursive: true });
}
await build({ entryPoints: [path.join(root, 'server/index.js')], outfile: path.join(output, 'server/index.js'), bundle: true, platform: 'browser', format: 'esm', target: 'es2022' });
const hosting = JSON.parse(await readFile(path.join(root, '.openai/hosting.json'), 'utf8'));
await writeFile(path.join(output, '.openai/hosting.json'), JSON.stringify(hosting, null, 2) + '\n');
// The remote publishing path consumes build output, so include migrations here
// as well as in source. Local Sites packaging preserves this same sidecar.
await cp(path.join(root, 'drizzle'), path.join(output, '.openai/drizzle'), { recursive: true });
console.log('Juego y servidor preparados en dist/client y dist/server.');
