/**
 * 图标生成：static/favicon.png（512×512）→ installer/resources/icon.ico（多尺寸）。
 * ICO 容器按规范手工打包（PNG-in-ICO，Windows Vista+ 支持），尺寸 256 以 0 字节表示。
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import sharp from 'sharp';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const source = path.join(repoRoot, 'static', 'favicon.png');
const outDir = path.resolve(here, '..', 'resources');
const outFile = path.join(outDir, 'icon.ico');

const SIZES = [256, 64, 48, 32, 16];

function packIco(pngBuffers) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(pngBuffers.length, 4);

  const entries = [];
  let offset = 6 + pngBuffers.length * 16;
  for (let i = 0; i < pngBuffers.length; i++) {
    const size = SIZES[i];
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // width（0 表示 256）
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
    entry.writeUInt8(0, 2); // palette
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bit count
    entry.writeUInt32LE(pngBuffers[i].length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += pngBuffers[i].length;
    entries.push(entry);
  }
  return Buffer.concat([header, ...entries, ...pngBuffers]);
}

if (!fs.existsSync(source)) {
  console.error(`icon source not found: ${source}`);
  process.exit(1);
}

const pngs = await Promise.all(
  SIZES.map((size) =>
    sharp(source)
      .resize(size, size, { fit: 'contain', background: { b: 0, g: 0, r: 0, alpha: 0 } })
      .png()
      .toBuffer()
  )
);

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, packIco(pngs));
const written = fs.statSync(outFile).size;
console.log(`icon.ico: ${SIZES.join('/')} px, ${written} bytes -> ${outFile}`);
