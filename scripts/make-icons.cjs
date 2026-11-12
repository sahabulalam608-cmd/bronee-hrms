const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const outDir = path.join(__dirname, '..', 'packages', 'web', 'public', 'icons');
fs.mkdirSync(outDir, { recursive: true });

const svg = fs.readFileSync(path.join(__dirname, '..', 'packages', 'web', 'public', 'favicon.svg'));

/** A maskable icon needs the artwork inside the 80% safe zone. */
function maskableSvg() {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#8F76EF"/>
      <stop offset="55%" stop-color="#7A5FE0"/>
      <stop offset="100%" stop-color="#6748C4"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#g)"/>
  <g transform="translate(256 256) scale(0.72) translate(-256 -256)" fill="none" stroke="#fff" stroke-width="30" stroke-linecap="round" stroke-linejoin="round">
    <path d="M136 372V196l120-60 120 60v176"/>
    <path d="M224 372v-84h64v84"/>
  </g>
</svg>`);
}

const targets = [
  { file: 'icon-192.png', size: 192, source: svg },
  { file: 'icon-512.png', size: 512, source: svg },
  { file: 'icon-512-maskable.png', size: 512, source: maskableSvg() },
  { file: 'apple-touch-icon.png', size: 180, source: svg },
];

(async () => {
  for (const target of targets) {
    await sharp(target.source).resize(target.size, target.size).png().toFile(path.join(outDir, target.file));
    console.log('wrote', target.file, target.size);
  }
})();
