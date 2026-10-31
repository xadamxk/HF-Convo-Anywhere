// Draws the placeholder toolbar/store icons (a white chat bubble on a purple
// rounded square) into src/assets/icons. Run with `npm run icons`.
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const SIZES = [16, 32, 48, 128];
const BACKGROUND = [123, 91, 214];
const BUBBLE = [255, 255, 255];
const SAMPLES = 4;

/** Coverage of the shapes at a point in the unit square: 0 none, 1 bg, 2 bubble. */
function shapeAt(x, y) {
  // Rounded square
  const r = 0.2;
  const dx = Math.max(r - x, 0, x - (1 - r));
  const dy = Math.max(r - y, 0, y - (1 - r));
  if (dx * dx + dy * dy > r * r) return 0;
  // Speech bubble: an ellipse with a tail at the bottom left
  const ex = (x - 0.5) / 0.32;
  const ey = (y - 0.46) / 0.25;
  if (ex * ex + ey * ey <= 1) return 2;
  const inTail = y >= 0.62 && y <= 0.8 && x >= 0.3 && x <= 0.46 - (y - 0.62);
  return inTail ? 2 : 1;
}

function drawIcon(size) {
  const rows = [];
  for (let py = 0; py < size; py++) {
    const row = Buffer.alloc(1 + size * 4);
    for (let px = 0; px < size; px++) {
      let bg = 0;
      let bubble = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const shape = shapeAt(
            (px + (sx + 0.5) / SAMPLES) / size,
            (py + (sy + 0.5) / SAMPLES) / size
          );
          if (shape === 1) bg++;
          if (shape === 2) bubble++;
        }
      }
      const covered = bg + bubble;
      const offset = 1 + px * 4;
      if (!covered) continue;
      for (let c = 0; c < 3; c++) {
        row[offset + c] = Math.round(
          (BACKGROUND[c] * bg + BUBBLE[c] * bubble) / covered
        );
      }
      row[offset + 3] = Math.round((255 * covered) / SAMPLES ** 2);
    }
    rows.push(row);
  }
  return png(size, Buffer.concat(rows));
}

function png(size, raw) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

const outDir = path.resolve(__dirname, "../src/assets/icons");
fs.mkdirSync(outDir, { recursive: true });
for (const size of SIZES) {
  fs.writeFileSync(path.join(outDir, `icon${size}.png`), drawIcon(size));
}
console.log(`Wrote ${SIZES.length} icons to ${outDir}`);
