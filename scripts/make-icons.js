// Draws the toolbar/store icons into src/assets/icons from the shapes in
// assets/icon.svg: a dark speech bubble with a white outline (HFX's icon style)
// holding the letters HF. Run with `npm run icons` after changing either.
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const SIZES = [16, 32, 48, 128];
const VIEWBOX = 128;
const SAMPLES = 8;
const FILL = [44, 44, 44]; // #2c2c2c
const WHITE = [255, 255, 255];

// The bubble (clockwise) and its outline width, as in assets/icon.svg
const BUBBLE = [
  [10, 14],
  [118, 14],
  [118, 86],
  [62, 86],
  [32, 114],
  [32, 86],
  [10, 86],
];
const OUTLINE = 5;

// The letters' 11-wide strokes, as rectangles [left, top, right, bottom]
const LETTERS = [
  // H
  [28.5, 30, 39.5, 70],
  [50.5, 30, 61.5, 70],
  [34, 44.5, 56, 55.5],
  // F
  [70.5, 30, 81.5, 70],
  [70.5, 30, 98, 41],
  [76, 44.5, 94, 55.5],
];

/** The polygon moved `distance` outward (negative: inward), with mitered corners. */
function offsetPolygon(points, distance) {
  const n = points.length;
  const normals = points.map((p, i) => {
    const q = points[(i + 1) % n];
    const length = Math.hypot(q[0] - p[0], q[1] - p[1]);
    // Outward for a clockwise polygon in y-down coordinates
    return [(q[1] - p[1]) / length, -(q[0] - p[0]) / length];
  });
  return points.map((p, i) => {
    const a = normals[(i + n - 1) % n];
    const b = normals[i];
    const scale = distance / (1 + a[0] * b[0] + a[1] * b[1]);
    return [p[0] + (a[0] + b[0]) * scale, p[1] + (a[1] + b[1]) * scale];
  });
}

function inside(points, x, y) {
  let result = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      result = !result;
    }
  }
  return result;
}

/**
 * The colour at a point in the 128×128 viewBox, or null where it's
 * transparent. `outer` and `inner` are the outline's edges.
 */
function colorAt(x, y, { outer, inner }) {
  if (LETTERS.some(([l, t, r, b]) => x >= l && x < r && y >= t && y < b)) {
    return WHITE;
  }
  if (!inside(outer, x, y)) return null;
  return inside(inner, x, y) ? FILL : WHITE;
}

function drawIcon(size) {
  const scale = VIEWBOX / size;
  // At least 1px wide, so the outline doesn't fade to grey in small icons
  const outline = Math.max(OUTLINE, scale);
  const bubble = {
    outer: offsetPolygon(BUBBLE, outline / 2),
    inner: offsetPolygon(BUBBLE, -outline / 2),
  };
  const rows = [];
  for (let py = 0; py < size; py++) {
    const row = Buffer.alloc(1 + size * 4);
    for (let px = 0; px < size; px++) {
      const sum = [0, 0, 0];
      let covered = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const color = colorAt(
            (px + (sx + 0.5) / SAMPLES) * scale,
            (py + (sy + 0.5) / SAMPLES) * scale,
            bubble
          );
          if (!color) continue;
          covered++;
          for (let c = 0; c < 3; c++) sum[c] += color[c];
        }
      }
      if (!covered) continue;
      const offset = 1 + px * 4;
      for (let c = 0; c < 3; c++)
        row[offset + c] = Math.round(sum[c] / covered);
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
