import { mkdir, readFile, readdir, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const publicDir = path.join(root, 'public');
const target = path.join(root, 'dist', 'server');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.webp': 'image/webp',
};
const assets = {};
for (const filename of (await readdir(publicDir, { recursive: true })).sort()) {
  const contentType = types[path.extname(filename)];
  if (!contentType) continue;
  const data = await readFile(path.join(publicDir, filename));
  assets[`/${filename.replaceAll(path.sep, '/')}`] = [contentType, data.toString('base64')];
}

await mkdir(target, { recursive: true });
await writeFile(path.join(target, 'assets.js'), `export const assets = ${JSON.stringify(assets)};\n`);
await copyFile(path.join(publicDir, 'artworks.js'), path.join(target, 'artworks.js'));
await copyFile(path.join(root, 'worker', 'index.js'), path.join(target, 'index.js'));
await mkdir(path.join(root, 'dist', '.openai'), { recursive: true });
await copyFile(path.join(root, '.openai', 'hosting.json'), path.join(root, 'dist', '.openai', 'hosting.json'));
console.log(`Built the exhibition with ${Object.keys(assets).length} assets.`);
