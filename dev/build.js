// Builds the store package without the dev hot reload:
//   node dev/build.js   ->  dist/tracs-plus/ (unpacked) and dist/tracs-plus-<version>.zip (Chrome Web Store upload)
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const out = path.join(dist, 'tracs-plus');
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const entry of ['manifest.json', 'src', 'guide', 'icons']) {
  fs.cpSync(path.join(root, entry), path.join(out, entry), { recursive: true });
}

// The hot reload only runs for unpacked installs anyway; leaving it out keeps the package free of localhost code.
fs.rmSync(path.join(out, 'src', 'dev-reload.js'));
const bg = path.join(out, 'src', 'background.js');
const src = fs.readFileSync(bg, 'utf8');
const stripped = src.replace("importScripts('lib.js', 'dev-reload.js');", "importScripts('lib.js');");
if (stripped === src) throw new Error('background.js: importScripts line not found');
fs.writeFileSync(bg, stripped);

// Windows' bsdtar writes zip archives with forward-slash paths, as the store expects.
const zip = path.join(dist, `tracs-plus-${version}.zip`);
const tar = process.platform === 'win32' ? path.join(process.env.SystemRoot, 'System32', 'tar.exe') : 'zip';
if (process.platform === 'win32') execFileSync(tar, ['-a', '-cf', zip, ...fs.readdirSync(out)], { cwd: out });
else execFileSync('zip', ['-qr', zip, '.'], { cwd: out });
console.log(`built ${path.relative(root, out)} and ${path.relative(root, zip)}`);
