// Draws the store image for the themes feature into assets/themes as SVG: a
// grid of tiles, one per theme, each with the dock's bubbles, chats list and a
// group chat window in that theme's colours (shapes only, no message text).
// The colours come from src/chat/themes.ts, so the image follows the themes.
// Usage: node make-themes-image.js [theme ids...] [--columns=2]
//   Without ids it shows THEMES_SHOWN. `npm run themes-image:png` then
//   renders the PNG (1280×800, no alpha) and copies it into store/.
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "assets", "themes", "7-themes.svg");
const THEMES_SHOWN = [
  "midnight",
  "gray",
  "solarized",
  "sunset",
  "synthwave",
  "crimson",
];

// The Web Store's screenshot size
const WIDTH = 1280;
const HEIGHT = 800;
const MARGIN = 24;
const GAP = 16;
// Tiles are drawn at this size, then scaled to fit the grid
const TILE_W = 608;
const TILE_H = 240;

const FONT = "'Segoe UI', Arial, sans-serif";
const PAGE = "#000000";
const BACKGROUND = "#161616";
const AVATARS = [
  ["#ff7e5f", "#feb47b"],
  ["#4568dc", "#b06ab3"],
  ["#11998e", "#38ef7d"],
  ["#ee0979", "#ff6a00"],
];
const PRESENCE = { online: "rgb(63, 160, 63)", away: "#a8923a" };
// An HF group's initials colour, as its group style draws them
const GROUP_COLOR = "#c2a5ff";

/** src/chat/themes.ts, compiled on the fly. */
function loadThemes() {
  const file = path.join(ROOT, "src", "chat", "themes.ts");
  const { outputText } = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const module = { exports: {} };
  new Function("module", "exports", "require", outputText)(
    module,
    module.exports,
    require
  );
  return module.exports;
}

/** A theme's colours, with Gray's for the rest and var() references resolved. */
function colorsOf(theme, defaults) {
  const colors = { ...defaults, ...theme.colors };
  const resolve = (value, depth = 0) =>
    value.replace(/var\(--hfx-chat-([a-z-]+)\)/g, (_, name) =>
      depth > 5 ? "" : resolve(colors[name], depth + 1)
    );
  const resolved = {};
  for (const [name, value] of Object.entries(colors)) {
    resolved[name] = resolve(value);
  }
  return resolved;
}

const escape = (text) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const bar = (x, y, width, height, fill) =>
  `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${height / 2}" fill="${fill}"/>`;

const text = (x, y, size, fill, label, weight = 700, anchor = "start") =>
  `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${escape(label)}</text>`;

function peopleIcon(cx, cy, color, scale = 1) {
  const s = `fill="none" stroke="${color}" stroke-width="1.7" stroke-linecap="round"`;
  return `<g transform="translate(${cx} ${cy}) scale(${scale})">${[
    `<circle cx="-3" cy="-3" r="3.2" ${s}/>`,
    `<path d="M-9 7 a6 6 0 0 1 12 0" ${s}/>`,
    `<circle cx="5" cy="-4" r="2.6" ${s}/>`,
    `<path d="M4 1 a5 5 0 0 1 6 5" ${s}/>`,
  ].join("")}</g>`;
}

function globeIcon(cx, cy, r, color) {
  const s = `fill="none" stroke="${color}" stroke-width="1.6"`;
  return [
    `<circle cx="${cx}" cy="${cy}" r="${r}" ${s}/>`,
    `<ellipse cx="${cx}" cy="${cy}" rx="${r * 0.42}" ry="${r}" ${s}/>`,
    `<path d="M${cx - r} ${cy} H${cx + r}" ${s}/>`,
  ].join("");
}

function chatIcon(cx, cy, color) {
  return `<path d="M${cx - 7} ${cy - 6} h14 a2.5 2.5 0 0 1 2.5 2.5 v7 a2.5 2.5 0 0 1 -2.5 2.5 h-8 l-4.5 3.5 v-3.5 h-1.5 a2.5 2.5 0 0 1 -2.5 -2.5 v-7 a2.5 2.5 0 0 1 2.5 -2.5 z" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round"/>`;
}

const avatar = (cx, cy, r, index) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#av${index})"/>`;

const dot = (cx, cy, r, status, ring) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${PRESENCE[status]}" stroke="${ring}" stroke-width="2.5"/>`;

function badge(cx, cy, c, label) {
  return [
    `<circle cx="${cx}" cy="${cy}" r="7.5" fill="${c.badge}"/>`,
    text(cx, cy + 3.5, 10, c["on-badge"], label, 700, "middle"),
  ].join("");
}

/** A panel docked at the bottom of the tile: rounded top corners. */
function panel(x, y, width, height, c) {
  const r = 8;
  return `<path d="M${x} ${y + height} V${y + r} a${r} ${r} 0 0 1 ${r} ${-r} H${x + width - r} a${r} ${r} 0 0 1 ${r} ${r} V${y + height} Z" fill="${c.bg}" stroke="${c.border}" stroke-width="1"/>`;
}

/** The panel's top band in the header colour, under the same rounded corners. */
function headerBand(x, y, width, height, c) {
  const r = 8;
  return [
    `<path d="M${x} ${y + height} V${y + r} a${r} ${r} 0 0 1 ${r} ${-r} H${x + width - r} a${r} ${r} 0 0 1 ${r} ${r} V${y + height} Z" fill="${c.header}"/>`,
    `<path d="M${x} ${y + height} H${x + width}" stroke="${c.border}" stroke-width="1"/>`,
  ].join("");
}

const wash = (c, alpha) => `rgba(${c.tint}, ${alpha})`;

function chatsList(x, y, width, height, c) {
  const parts = [panel(x, y, width, height, c), headerBand(x, y, width, 34, c)];
  parts.push(
    chatIcon(x + 20, y + 17, c.strong),
    text(x + 36, y + 22, 13, c.strong, "Chats"),
    badge(x + width - 34, y + 17, c, "3"),
    `<path d="M${x + width - 18} ${y + 15} l4 4 l4 -4" fill="none" stroke="${c["header-muted"]}" stroke-width="1.6" stroke-linecap="round"/>`
  );
  // Filters: All picked
  parts.push(
    `<rect x="${x + 10}" y="${y + 42}" width="30" height="16" rx="8" fill="${c.mine}"/>`,
    text(x + 25, y + 54, 10, c["on-mine"], "All", 600, "middle"),
    `<rect x="${x + 46}" y="${y + 42}" width="34" height="16" rx="8" fill="none" stroke="${c.outline}"/>`,
    text(x + 63, y + 54, 10, c.text, "DMs", 600, "middle"),
    `<rect x="${x + 86}" y="${y + 42}" width="46" height="16" rx="8" fill="none" stroke="${c.outline}"/>`,
    text(x + 109, y + 54, 10, c.text, "Groups", 600, "middle")
  );
  // Rows: the global chat, an unread DM, the open DM
  const rows = [
    { kind: "global", name: 62, preview: 96 },
    {
      kind: "dm",
      avatar: 0,
      status: "online",
      name: 54,
      preview: 84,
      unread: "2",
    },
    {
      kind: "dm",
      avatar: 2,
      status: "away",
      name: 46,
      preview: 70,
      open: true,
    },
  ];
  rows.forEach((row, i) => {
    const top = y + 64 + i * 40;
    const cy = top + 20;
    if (row.open) {
      parts.push(
        `<rect x="${x + 1}" y="${top}" width="${width - 2}" height="40" fill="${wash(c, 0.1)}"/>`
      );
    }
    if (row.kind === "global") {
      parts.push(
        `<circle cx="${x + 26}" cy="${cy}" r="14" fill="${c.header}"/>`,
        globeIcon(x + 26, cy, 7, c.text)
      );
    } else {
      parts.push(
        avatar(x + 26, cy, 14, row.avatar),
        dot(x + 37, cy - 11, 4.5, row.status, c.bg)
      );
    }
    const strong = row.unread ? c.strong : c.text;
    parts.push(
      bar(x + 50, cy - 9, row.name, 7, strong),
      bar(x + 50, cy + 3, row.preview, 6, row.unread ? c.strong : c.muted),
      bar(x + width - 32, cy - 9, 16, 5, c.muted)
    );
    if (row.unread) parts.push(badge(x + width - 22, cy + 6, c, row.unread));
  });
  return parts.join("");
}

function groupWindow(x, y, width, height, c) {
  const parts = [panel(x, y, width, height, c), headerBand(x, y, width, 36, c)];
  // Header: group icon, name, who's here, actions
  parts.push(
    `<rect x="${x + 10}" y="${y + 7}" width="22" height="22" rx="6" fill="${c.accent}"/>`,
    peopleIcon(x + 21, y + 18, c["on-accent"], 0.75),
    bar(x + 40, y + 14, 76, 8, c.strong),
    `<rect x="${x + 124}" y="${y + 10}" width="38" height="16" rx="8" fill="none" stroke="${c.outline}"/>`,
    bar(x + 133, y + 16, 20, 4, c["header-muted"]),
    `<path d="M${x + width - 46} ${y + 18} h9" stroke="${c.text}" stroke-width="1.8" stroke-linecap="round"/>`,
    `<path d="M${x + width - 22} ${y + 14} l8 8 m0 -8 l-8 8" stroke="${c.text}" stroke-width="1.8" stroke-linecap="round"/>`
  );
  const left = x + 10;
  const textX = x + 44;
  // A message
  let top = y + 46;
  parts.push(
    avatar(left + 12, top + 12, 12, 1),
    bar(textX, top + 2, 52, 7, c.strong),
    bar(textX + 58, top + 3, 26, 5, c.muted),
    bar(textX, top + 15, 150, 6, c.text),
    bar(textX, top + 26, 108, 6, c.text)
  );
  // New messages divider
  top += 42;
  parts.push(
    `<path d="M${left} ${top} H${x + width / 2 - 26} M${x + width / 2 + 26} ${top} H${x + width - 10}" stroke="${c["new-line"]}" stroke-width="1"/>`,
    bar(x + width / 2 - 20, top - 3, 40, 6, c["new-text"])
  );
  // A message that mentions you
  top += 10;
  parts.push(
    avatar(left + 12, top + 12, 12, 3),
    bar(textX, top + 2, 46, 7, c.strong),
    bar(textX + 52, top + 3, 26, 5, c.muted),
    `<rect x="${textX - 6}" y="${top + 12}" width="${width - 48}" height="14" fill="${c["mention-bg"]}"/>`,
    `<rect x="${textX - 6}" y="${top + 12}" width="3" height="14" fill="${c["mention-bar"]}"/>`,
    bar(textX + 2, top + 16, 38, 6, c.strong),
    bar(textX + 46, top + 16, 92, 6, c.text)
  );
  // Jump to the newest
  top += 34;
  parts.push(
    `<rect x="${x + width / 2 - 44}" y="${top}" width="88" height="16" rx="8" fill="${c.accent}"/>`,
    bar(x + width / 2 - 30, top + 5, 60, 6, c["on-accent"])
  );
  // Compose
  const compose = y + height - 40;
  parts.push(
    `<path d="M${x} ${compose} H${x + width}" stroke="${c.border}" stroke-width="1"/>`,
    `<path d="M${x + 14} ${compose + 20} h12 m-6 -6 v12" stroke="${c.text}" stroke-width="1.8" stroke-linecap="round"/>`,
    `<rect x="${x + 36}" y="${compose + 7}" width="${width - 76}" height="26" rx="13" fill="${c.input}" stroke="${c["input-border"]}"/>`,
    bar(x + 48, compose + 17, 84, 6, c.muted),
    `<circle cx="${x + width - 20}" cy="${compose + 20}" r="7.5" fill="none" stroke="${c.text}" stroke-width="1.6"/>`
  );
  return parts.join("");
}

function bubbles(cx, bottom, c, light) {
  const parts = [];
  const r = 20;
  const ring = (y) =>
    `<circle cx="${cx}" cy="${y}" r="${r + 4}" fill="none" stroke="${c.text}" stroke-width="2"/>`;
  // Bottom up: the global chat (open), groups, a group, a DM
  let y = bottom - r - 6;
  parts.push(
    ring(y),
    `<circle cx="${cx}" cy="${y}" r="${r}" fill="${c.header}"/>`,
    globeIcon(cx, y, 9, c.text)
  );
  y -= 48;
  parts.push(
    `<circle cx="${cx}" cy="${y}" r="${r}" fill="${c.accent}"/>`,
    peopleIcon(cx, y, c["on-accent"])
  );
  y -= 48;
  parts.push(
    `<rect x="${cx - r}" y="${y - r}" width="${r * 2}" height="${r * 2}" rx="12" fill="${c.header}" stroke="${c.border}" stroke-width="2"/>`,
    text(cx, y + 5, 14, light ? "#574a73" : GROUP_COLOR, "RC", 700, "middle"),
    badge(cx + 15, y + 15, c, "1")
  );
  y -= 48;
  parts.push(
    avatar(cx, y, r, 0),
    dot(cx + 15, y - 15, 5.5, "online", c.bg),
    badge(cx + 15, y + 15, c, "2")
  );
  return parts.join("");
}

function tile(theme, c) {
  const parts = [
    `<rect x="0" y="0" width="${TILE_W}" height="${TILE_H}" rx="14" fill="${PAGE}" stroke="#2c2c2c"/>`,
  ];
  // The name top left, its colours top right
  parts.push(text(20, 32, 20, "#ffffff", theme.label));
  ["bg", "header", "border", "accent"].forEach((name, i) => {
    parts.push(
      `<rect x="${TILE_W - 88 + i * 17}" y="19" width="13" height="13" rx="3.5" fill="${c[name]}" stroke="rgba(255, 255, 255, 0.3)"/>`
    );
  });
  // The dock, at the bottom right as on HF
  const panelsTop = 48;
  const panelsHeight = TILE_H - panelsTop;
  parts.push(
    chatsList(20, panelsTop, 236, panelsHeight, c),
    groupWindow(268, panelsTop, 272, panelsHeight, c),
    bubbles(TILE_W - 36, TILE_H, c, theme.light)
  );
  return `<g clip-path="url(#tile)">${parts.join("")}</g>`;
}

function render(ids, columns) {
  const { THEMES, DEFAULT_COLORS } = loadThemes();
  const themes = ids.map((id) => {
    const theme = THEMES.find((t) => t.id === id);
    if (!theme) {
      throw new Error(
        `No theme "${id}"; there are: ${THEMES.map((t) => t.id).join(", ")}`
      );
    }
    return theme;
  });
  const rows = Math.ceil(themes.length / columns);
  const cellW = (WIDTH - MARGIN * 2 - GAP * (columns - 1)) / columns;
  const cellH = (HEIGHT - MARGIN * 2 - GAP * (rows - 1)) / rows;
  const scale = Math.min(cellW / TILE_W, cellH / TILE_H);
  // Centre the grid when the tiles' shape leaves room
  const gridW = columns * TILE_W * scale + GAP * (columns - 1);
  const gridH = rows * TILE_H * scale + GAP * (rows - 1);
  const left = (WIDTH - gridW) / 2;
  const top = (HEIGHT - gridH) / 2;
  const tiles = themes.map((theme, i) => {
    const x = left + (i % columns) * (TILE_W * scale + GAP);
    const y = top + Math.floor(i / columns) * (TILE_H * scale + GAP);
    const c = colorsOf(theme, DEFAULT_COLORS);
    return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${scale.toFixed(4)})">${tile(theme, c)}</g>`;
  });
  const gradients = AVATARS.map(
    ([a, b], i) =>
      `<linearGradient id="av${i}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`
  ).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
<defs>${gradients}<clipPath id="tile"><rect x="0" y="0" width="${TILE_W}" height="${TILE_H}" rx="14"/></clipPath></defs>
<rect width="${WIDTH}" height="${HEIGHT}" fill="${BACKGROUND}"/>
${tiles.join("\n")}
</svg>
`;
}

const args = process.argv.slice(2);
const columnsArg = args.find((arg) => arg.startsWith("--columns="));
const columns = columnsArg ? Number(columnsArg.split("=")[1]) : 2;
const ids = args.filter((arg) => !arg.startsWith("--"));
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, render(ids.length ? ids : THEMES_SHOWN, columns));
console.log(`Wrote ${path.relative(ROOT, OUT)}`);
