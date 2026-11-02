// Draws the promo banners into assets/banners as SVG, in the style of HFX's
// banner: the title over a doodle pattern, and a browser window showing an HF
// page with Convo Anywhere's bubbles and two chat windows (shapes only, no
// text). Three colours, three sizes: 920×680 and 440×280 like HFX, and
// the Chrome Web Store marquee (1400×560). Also two forum signatures
// (assets/signatures) in the same colours.
// Run with `npm run banners`; `npm run banners:png` then renders the PNGs.
const fs = require("fs");
const path = require("path");

// `cta`: text on the white call-to-action pill
const VARIANTS = {
  purple: { background: "#4d2f5d", pattern: "#432851", cta: "#4d2f5d" },
  blue: { background: "#00aaff", pattern: "#009bff", cta: "#0072b5" },
  grey: { background: "#2c2c2c", pattern: "#363636", cta: "#2c2c2c" },
};

// HF's page colours: black body, #333 rows, purple section headers
const PAGE = "#000000";
const ROW = "#333333";
const THEAD = "#4d2f5d";
const FONT = "'Segoe UI', Arial, sans-serif";

// The browser window is drawn in its own coordinates: 888 wide, the page
// starting below a 60px toolbar, cut off by the bottom of the banner at 473
const WIDTH = 888;
const BOTTOM = 473;

/** Seeded random numbers, so the pattern and line lengths never change. */
function random(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r1 = (n) => Math.round(n * 10) / 10;

// Avatars: flat two-colour gradients, like the demo screenshots
const AVATARS = [
  ["#7b5cff", "#2bc0e4"],
  ["#ff7e5f", "#feb47b"],
  ["#ee0979", "#ff6a00"],
  ["#11998e", "#38ef7d"],
  ["#4568dc", "#b06ab3"],
  ["#f7971e", "#ffd200"],
  ["#00b4db", "#0083b0"],
];
const PRESENCE = { online: "#3cc13b", away: "#e0a526", offline: "#8a8a8a" };
const NAME_COLORS = ["#ffb400", "#3b9cff", "#ffffff", "#b066ff", "#38d16a"];

function avatarDefs() {
  return AVATARS.map(
    ([a, b], i) =>
      `<linearGradient id="av${i}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`
  ).join("");
}

// ---- The doodle pattern behind everything ----

function doodle(kind, color) {
  const stroke = `fill="none" stroke="${color}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"`;
  switch (kind) {
    case 0:
      return `<circle r="6" ${stroke}/>`;
    case 1:
      return `<path d="M0 -7 L6.5 5 L-6.5 5 Z" ${stroke}/>`;
    case 2:
      return `<rect x="-4.5" y="-4.5" width="9" height="9" rx="2" fill="${color}"/>`;
    case 3:
      return `<path d="M0 6 C-9 -1 -5 -9 0 -4 C5 -9 9 -1 0 6 Z" fill="${color}"/>`;
    case 4:
      return `<path d="M-5 -5 L5 5 M5 -5 L-5 5" ${stroke}/>`;
    case 5:
      return `<path d="M-9 2 L-4.5 -3 L0 2 L4.5 -3 L9 2" ${stroke}/>`;
    default:
      return `<path d="M0 7 C-6 0 -6 -7 0 -7 C6 -7 6 0 0 7 Z" fill="${color}"/>`;
  }
}

function pattern(width, height, color, cell, scale, seed) {
  const rand = random(seed);
  const shapes = [];
  for (let y = cell / 2; y < height + cell; y += cell) {
    for (let x = cell / 2; x < width + cell; x += cell) {
      if (rand() < 0.25) continue;
      const jx = x + (rand() - 0.5) * cell * 0.6;
      const jy = y + (rand() - 0.5) * cell * 0.6;
      const kind = Math.floor(rand() * 7);
      const angle = Math.round(rand() * 360);
      shapes.push(
        `<g transform="translate(${r1(jx)} ${r1(jy)}) rotate(${angle}) scale(${scale})">${doodle(kind, color)}</g>`
      );
    }
  }
  return shapes.join("");
}

// ---- The browser window and HF page ----

function toolbar() {
  return [
    `<path d="M6 0 H${WIDTH - 6} A6 6 0 0 1 ${WIDTH} 6 V60 H0 V6 A6 6 0 0 1 6 0 Z" fill="#d1d3d0"/>`,
    `<circle cx="19" cy="11" r="6" fill="#cf3232"/>`,
    `<circle cx="41" cy="11" r="6" fill="#daa533"/>`,
    `<circle cx="63" cy="11" r="6" fill="#00ae4d"/>`,
    `<circle cx="870" cy="11" r="5.5" fill="#898989"/>`,
    `<rect x="12" y="26" width="54" height="18" rx="7" fill="#efefef"/>`,
    `<rect x="75" y="26" width="458" height="18" rx="7" fill="#efefef"/>`,
    `<rect x="541" y="26" width="297" height="18" rx="7" fill="#efefef"/>`,
    `<rect x="859" y="26" width="18" height="18" rx="5" fill="#efefef"/>`,
  ].join("");
}

/** A forum category: purple header strip, then rows of forum lines. */
function forumBlock(top, rows, rand) {
  const height = 31 + rows * 28;
  const parts = [
    `<rect x="40" y="${top}" width="808" height="${height}" rx="4" fill="${ROW}"/>`,
    `<path d="M44 ${top} H844 A4 4 0 0 1 848 ${top + 4} V${top + 9} H40 V${top + 4} A4 4 0 0 1 44 ${top} Z" fill="${THEAD}"/>`,
  ];
  for (let i = 0; i < rows; i++) {
    const y = top + 22 + i * 28;
    parts.push(
      `<rect x="42" y="${y}" width="18" height="18" rx="4" fill="#6b4a80"/>`,
      `<rect x="63" y="${y + 1}" width="${Math.round(35 + rand() * 50)}" height="4" rx="2" fill="#ffffff"/>`,
      `<rect x="63" y="${y + 9}" width="${Math.round(330 + rand() * 80)}" height="7" rx="3.5" fill="#cccccc"/>`,
      `<rect x="725" y="${y}" width="25" height="17" rx="3" fill="#cccccc"/>`,
      `<rect x="777" y="${y}" width="69" height="17" rx="3" fill="#cccccc"/>`
    );
  }
  return parts.join("");
}

function page(rand) {
  return [
    `<rect y="60" width="${WIDTH}" height="${BOTTOM + 20 - 60}" fill="${PAGE}"/>`,
    // Header and nav bar
    `<rect x="40" y="107" width="808" height="28" rx="4" fill="${ROW}"/>`,
    `<path d="M44 107 H844 A4 4 0 0 1 848 111 V115 H40 V111 A4 4 0 0 1 44 107 Z" fill="${THEAD}"/>`,
    forumBlock(166, 4, rand),
    forumBlock(323, 5, rand),
  ].join("");
}

// ---- Convo Anywhere: bubbles and windows ----

const BUBBLE_X = 862;
const R = 17;

function presenceDot(cx, cy, status, r = 5) {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${PRESENCE[status]}" stroke="#1f1f1f" stroke-width="2"/>`;
}

function badge(cx, cy) {
  return `<circle cx="${cx}" cy="${cy}" r="6" fill="#e53935" stroke="#1f1f1f" stroke-width="2"/>`;
}

function chatIcon(cx, cy, color) {
  return `<path d="M${cx - 7} ${cy - 6} h14 a2.5 2.5 0 0 1 2.5 2.5 v7 a2.5 2.5 0 0 1 -2.5 2.5 h-8 l-4.5 3.5 v-3.5 h-1.5 a2.5 2.5 0 0 1 -2.5 -2.5 v-7 a2.5 2.5 0 0 1 2.5 -2.5 z" fill="${color}"/>`;
}

function globeIcon(cx, cy, r, color) {
  const s = `fill="none" stroke="${color}" stroke-width="1.6"`;
  return [
    `<circle cx="${cx}" cy="${cy}" r="${r}" ${s}/>`,
    `<ellipse cx="${cx}" cy="${cy}" rx="${r1(r * 0.42)}" ry="${r}" ${s}/>`,
    `<path d="M${cx - r} ${cy} H${cx + r}" ${s}/>`,
  ].join("");
}

function peopleIcon(cx, cy, color) {
  const s = `fill="none" stroke="${color}" stroke-width="1.7" stroke-linecap="round"`;
  return [
    `<circle cx="${cx - 3}" cy="${cy - 3}" r="3.2" ${s}/>`,
    `<path d="M${cx - 9} ${cy + 7} a6 6 0 0 1 12 0" ${s}/>`,
    `<circle cx="${cx + 5}" cy="${cy - 4}" r="2.6" ${s}/>`,
    `<path d="M${cx + 4} ${cy + 1} a5 5 0 0 1 6 5" ${s}/>`,
  ].join("");
}

function bubbles() {
  const parts = [];
  // Bottom up: launcher, global chat (open), group chats, then DMs
  let y = BOTTOM - 23;
  parts.push(
    `<circle cx="${BUBBLE_X}" cy="${y}" r="${R}" fill="#262626" stroke="#3a3a3a" stroke-width="1"/>`,
    chatIcon(BUBBLE_X, y - 1, "#e6e6e6")
  );
  y -= 42;
  parts.push(
    `<circle cx="${BUBBLE_X}" cy="${y}" r="${R}" fill="#262626"/>`,
    `<circle cx="${BUBBLE_X}" cy="${y}" r="${R + 3}" fill="none" stroke="#ffffff" stroke-width="2"/>`,
    globeIcon(BUBBLE_X, y, 8, "#e6e6e6")
  );
  y -= 42;
  parts.push(
    `<rect x="${BUBBLE_X - R}" y="${y - R}" width="${R * 2}" height="${R * 2}" rx="9" fill="#2c2c2c" stroke="#3a3a3a" stroke-width="1"/>`,
    peopleIcon(BUBBLE_X, y, "#e6e6e6"),
    badge(BUBBLE_X + 13, y + 13)
  );
  // [presence, window open, unread]; the open DM is the one in its window
  const dms = [
    ["online", true, false],
    ["online", false, true],
    ["online", false, false],
    ["away", false, true],
    ["offline", false, false],
    ["online", false, false],
  ];
  dms.forEach(([status, open, unread], i) => {
    y -= 42;
    if (open) {
      parts.push(
        `<circle cx="${BUBBLE_X}" cy="${y}" r="${R + 3}" fill="none" stroke="#ffffff" stroke-width="2"/>`
      );
    }
    parts.push(
      `<circle cx="${BUBBLE_X}" cy="${y}" r="${R}" fill="url(#av${i})"/>`,
      presenceDot(BUBBLE_X + 12, y - 12, status),
      unread ? badge(BUBBLE_X + 12, y + 12) : ""
    );
  });
  return parts.join("");
}

/** The ↗ – × buttons at the right of a window's header. */
function windowActions(right, cy) {
  const s = `fill="none" stroke="#cfcfcf" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"`;
  const a = right - 58;
  const m = right - 37;
  const c = right - 17;
  return [
    `<path d="M${a - 4} ${cy + 4} L${a + 4} ${cy - 4} M${a - 1} ${cy - 4} H${a + 4} V${cy + 1}" ${s}/>`,
    `<path d="M${m - 4} ${cy} H${m + 4}" ${s}/>`,
    `<path d="M${c - 4} ${cy - 4} L${c + 4} ${cy + 4} M${c + 4} ${cy - 4} L${c - 4} ${cy + 4}" ${s}/>`,
  ].join("");
}

/**
 * A chat window docked at the bottom: header, messages (avatar, coloured name
 * line, then text lines) and the input bar.
 */
function chatWindow(left, top, width, { header, messages }) {
  const right = left + width;
  const parts = [
    `<path d="M${left + 10} ${top} H${right - 10} A10 10 0 0 1 ${right} ${top + 10} V${BOTTOM + 20} H${left} V${top + 10} A10 10 0 0 1 ${left + 10} ${top} Z" fill="#242424" stroke="#3d3d3d" stroke-width="1"/>`,
    `<path d="M${left} ${top + 40} H${right}" stroke="#3a3a3a" stroke-width="1"/>`,
    header(left, top + 20, right),
    windowActions(right, top + 20),
  ];
  let y = top + 52;
  for (const { avatar, name, lines } of messages) {
    parts.push(
      avatar === "self"
        ? `<circle cx="${left + 20}" cy="${y + 9}" r="9" fill="#5a5a5a"/><circle cx="${left + 20}" cy="${y + 7}" r="3.5" fill="#d9d9d9"/><path d="M${left + 14} ${y + 15} a6 5 0 0 1 12 0" fill="#d9d9d9"/>`
        : `<circle cx="${left + 20}" cy="${y + 9}" r="9" fill="url(#av${avatar})"/>`,
      `<rect x="${left + 36}" y="${y + 1}" width="${name[0]}" height="5" rx="2.5" fill="${name[1]}"/>`
    );
    lines.forEach((length, i) => {
      parts.push(
        `<rect x="${left + 36}" y="${y + 12 + i * 10}" width="${length}" height="5" rx="2.5" fill="#d0d0d0" opacity="0.85"/>`
      );
    });
    y += 20 + lines.length * 10;
  }
  // Input: + button, rounded field, emoji button
  const inputY = BOTTOM - 26;
  parts.push(
    `<path d="M${left} ${BOTTOM - 44} H${right}" stroke="#333333" stroke-width="1"/>`,
    `<path d="M${left + 11} ${inputY} H${left + 21} M${left + 16} ${inputY - 5} V${inputY + 5}" stroke="#cfcfcf" stroke-width="1.6" stroke-linecap="round"/>`,
    `<rect x="${left + 30}" y="${inputY - 11}" width="${width - 64}" height="22" rx="11" fill="#1b1b1b" stroke="#4a4a4a" stroke-width="1"/>`,
    `<circle cx="${right - 17}" cy="${inputY}" r="7" fill="none" stroke="#aaaaaa" stroke-width="1.5"/>`,
    `<path d="M${right - 20} ${inputY + 2} a3.5 3 0 0 0 6 0" fill="none" stroke="#aaaaaa" stroke-width="1.3" stroke-linecap="round"/>`
  );
  return parts.join("");
}

function dmWindow() {
  return chatWindow(428, 225, 200, {
    header: (left, cy) =>
      [
        `<circle cx="${left + 22}" cy="${cy}" r="11" fill="url(#av0)"/>`,
        presenceDot(left + 30, cy - 8, "online", 4),
        `<rect x="${left + 40}" y="${cy - 3}" width="58" height="6" rx="3" fill="#ffffff"/>`,
      ].join(""),
    messages: [
      { avatar: 0, name: [42, NAME_COLORS[0]], lines: [128] },
      { avatar: "self", name: [48, "#cfcfcf"], lines: [140, 96] },
      { avatar: 0, name: [42, NAME_COLORS[0]], lines: [134, 70] },
      { avatar: "self", name: [48, "#cfcfcf"], lines: [118] },
    ],
  });
}

function globalWindow() {
  return chatWindow(636, 225, 200, {
    header: (left, cy) =>
      [
        globeIcon(left + 20, cy, 8, "#e6e6e6"),
        `<rect x="${left + 36}" y="${cy - 3}" width="54" height="6" rx="3" fill="#ffffff"/>`,
        `<rect x="${left + 94}" y="${cy - 7}" width="30" height="14" rx="7" fill="none" stroke="#8a8a8a" stroke-width="1"/>`,
      ].join(""),
    messages: [
      { avatar: 2, name: [40, NAME_COLORS[0]], lines: [136] },
      { avatar: 4, name: [46, NAME_COLORS[2]], lines: [142, 88] },
      { avatar: 1, name: [34, NAME_COLORS[1]], lines: [112] },
      { avatar: 5, name: [44, NAME_COLORS[2]], lines: [128] },
      { avatar: 3, name: [50, NAME_COLORS[2]], lines: [96] },
    ],
  });
}

function browser() {
  const rand = random(7);
  return [toolbar(), page(rand), dmWindow(), globalWindow(), bubbles()].join(
    ""
  );
}

// ---- The two banner sizes ----

function svg(width, height, variant, body) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<defs>${avatarDefs()}<clipPath id="canvas"><rect width="${width}" height="${height}"/></clipPath></defs>`,
    `<g clip-path="url(#canvas)">`,
    `<rect width="${width}" height="${height}" fill="${variant.background}"/>`,
    body,
    `</g>`,
    `</svg>`,
    "",
  ].join("\n");
}

function title(x, lines, size, firstBaseline, lineHeight) {
  return lines
    .map(
      (line, i) =>
        `<text x="${x}" y="${firstBaseline + i * lineHeight}" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="${size}" letter-spacing="1" fill="#ffffff">${line}</text>`
    )
    .join("");
}

function large(variant) {
  return svg(
    920,
    680,
    variant,
    [
      pattern(920, 680, variant.pattern, 46, 1, 1),
      title(460, ["HF CONVO", "ANYWHERE"], 52, 96, 58),
      `<g transform="translate(16 207)">${browser()}</g>`,
    ].join("\n")
  );
}

function small(variant) {
  const scale = 0.47;
  const left = r1((440 - WIDTH * scale) / 2);
  return svg(
    440,
    280,
    variant,
    [
      pattern(440, 280, variant.pattern, 34, 0.7, 2),
      title(220, ["HF CONVO ANYWHERE"], 25, 37, 0),
      `<g transform="translate(${left} 56) scale(${scale})">${browser()}</g>`,
    ].join("\n")
  );
}

/** The large banner as a Web Store screenshot (1280×800): scaled to the full height, pattern edge to edge. */
function screenshot(variant) {
  const scale = 800 / 680;
  const left = r1((1280 - 920 * scale) / 2);
  return svg(
    1280,
    800,
    variant,
    [
      pattern(1280, 800, variant.pattern, r1(46 * scale), r1(scale), 4),
      `<g transform="translate(${left} 0) scale(${r1(scale * 1000) / 1000})">`,
      title(460, ["HF CONVO", "ANYWHERE"], 52, 96, 58),
      `<g transform="translate(16 207)">${browser()}</g>`,
      `</g>`,
    ].join("\n")
  );
}

/** The Chrome Web Store's marquee tile: title on the left, browser on the right. */
function marquee(variant) {
  const scale = 0.86;
  const left = r1(1400 - WIDTH * scale - 36);
  const top = r1(560 - BOTTOM * scale);
  return svg(
    1400,
    560,
    variant,
    [
      pattern(1400, 560, variant.pattern, 46, 1, 3),
      title(310, ["HF CONVO", "ANYWHERE"], 76, 250, 84),
      `<text x="310" y="392" text-anchor="middle" font-family="${FONT}" font-weight="600" font-size="25" fill="#ffffff" opacity="0.85">Your Convo chats on every HF page</text>`,
      `<g transform="translate(${left} ${top}) scale(${scale})">${browser()}</g>`,
    ].join("\n")
  );
}

// ---- Forum signatures (HF allows up to 650×200 and 500KB) ----

/** The extension's icon (assets/icon.svg), `size` pixels square, centred. */
function appIcon(cx, cy, size) {
  const s = size / 128;
  return [
    `<g transform="translate(${r1(cx - 64 * s)} ${r1(cy - 64 * s)}) scale(${r1(s * 1000) / 1000})">`,
    `<path d="M10 14 L118 14 L118 86 L62 86 L32 114 L32 86 L10 86 Z" fill="#2c2c2c" stroke="#ffffff" stroke-width="7"/>`,
    `<path d="M34 30 V70 M56 30 V70 M34 50 H56 M76 30 V70 M70.5 35.5 H98 M76 50 H94" stroke="#ffffff" stroke-width="11" fill="none"/>`,
    `</g>`,
  ].join("");
}

/** A pill-shaped call to action, centred on `cx`. */
function pill(cx, cy, width, height, fill, color, label, size) {
  return [
    `<rect x="${r1(cx - width / 2)}" y="${r1(cy - height / 2)}" width="${width}" height="${height}" rx="${height / 2}" fill="${fill}"/>`,
    `<text x="${cx}" y="${r1(cy + size * 0.36)}" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="${size}" fill="${color}">${label}</text>`,
  ].join("");
}

/**
 * Signature 1 (650×200): the name, tagline and call to action on the left,
 * and a close-up of the dock (two chat windows and the bubbles) on the right.
 */
function signatureShowcase(variant) {
  const scale = 0.66;
  const shot = { x: 312, y: 12, width: 326, height: 176 };
  // The browser's right edge on the shot's, its windows' bottoms on its bottom
  const left = r1(shot.x + shot.width - WIDTH * scale);
  const top = r1(shot.y + shot.height - BOTTOM * scale);
  return svg(
    650,
    200,
    variant,
    [
      pattern(650, 200, variant.pattern, 34, 0.7, 4),
      title(160, ["HF CONVO", "ANYWHERE"], 36, 64, 42),
      `<text x="160" y="134" text-anchor="middle" font-family="${FONT}" font-weight="600" font-size="16" fill="#ffffff" opacity="0.9">Messenger-style chat for HF</text>`,
      pill(
        160,
        166,
        262,
        34,
        "#ffffff",
        variant.cta,
        "Install free · Chrome &amp; Firefox",
        15
      ),
      `<clipPath id="shot"><rect x="${shot.x}" y="${shot.y}" width="${shot.width}" height="${shot.height}" rx="10"/></clipPath>`,
      `<g clip-path="url(#shot)"><g transform="translate(${left} ${top}) scale(${scale})">${browser()}</g></g>`,
      `<rect x="${shot.x}" y="${shot.y}" width="${shot.width}" height="${shot.height}" rx="10" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="2"/>`,
    ].join("\n")
  );
}

/**
 * Signature 2 (650×120): a Convo message from the extension under a "New
 * messages" line, with an Install pill and a small bubble column beside it.
 */
function signatureMessage(variant) {
  const card = { x: 8, y: 30, width: 560, height: 82 };
  const mid = card.x + card.width / 2;
  const cy = card.y + card.height / 2;
  // The dock's bubbles, shrunk: launcher, global chat (open), then two DMs
  const dock = [
    `<circle cx="0" cy="0" r="${R}" fill="#262626" stroke="#3a3a3a" stroke-width="1"/>`,
    chatIcon(0, -1, "#e6e6e6"),
    `<circle cx="0" cy="-42" r="${R}" fill="#262626"/>`,
    `<circle cx="0" cy="-42" r="${R + 3}" fill="none" stroke="#ffffff" stroke-width="2"/>`,
    globeIcon(0, -42, 8, "#e6e6e6"),
    `<circle cx="0" cy="-84" r="${R}" fill="url(#av0)"/>`,
    presenceDot(12, -96, "online"),
    badge(12, -72),
    `<circle cx="0" cy="-126" r="${R}" fill="url(#av2)"/>`,
    presenceDot(12, -138, "away"),
  ].join("");
  return svg(
    650,
    120,
    variant,
    [
      pattern(650, 120, variant.pattern, 30, 0.6, 5),
      // The "New messages" line, as the extension draws it
      `<path d="M${card.x + 6} 16 H${mid - 62} M${mid + 62} 16 H${card.x + card.width - 6}" stroke="#e0868a" stroke-width="2" stroke-linecap="round"/>`,
      `<text x="${mid}" y="20" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="11" letter-spacing="1" fill="#ffd0d3">NEW MESSAGES</text>`,
      `<rect x="${card.x}" y="${card.y}" width="${card.width}" height="${card.height}" rx="14" fill="#242424" stroke="#3d3d3d" stroke-width="1.5"/>`,
      `<circle cx="${card.x + 42}" cy="${cy}" r="29" fill="#1a1a1a"/>`,
      appIcon(card.x + 42, cy + 2, 44),
      `<text x="${card.x + 84}" y="${cy - 6}" font-family="${FONT}" font-weight="700" font-size="19" fill="#ffd200">HF Convo Anywhere<tspan dx="10" font-size="12" font-weight="400" fill="#8a8a8a">now</tspan></text>`,
      `<text x="${card.x + 84}" y="${cy + 20}" font-family="${FONT}" font-size="16" fill="#e6e6e6">Messenger-style chat on every HF page</text>`,
      pill(
        card.x + card.width - 70,
        cy,
        112,
        34,
        "#4d2f5d",
        "#ffffff",
        "Get it free",
        15
      ),
      `<g transform="translate(612 104) scale(0.72)">${dock}</g>`,
    ].join("\n")
  );
}

const BANNERS = { large, small, marquee, screenshot };
const SIGNATURES = { showcase: signatureShowcase, message: signatureMessage };

const outDir = path.resolve(__dirname, "../assets/banners");
const signatureDir = path.resolve(__dirname, "../assets/signatures");
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(signatureDir, { recursive: true });
for (const [name, variant] of Object.entries(VARIANTS)) {
  for (const [size, draw] of Object.entries(BANNERS)) {
    fs.writeFileSync(
      path.join(outDir, `banner-${size}-${name}.svg`),
      draw(variant)
    );
  }
  for (const [design, draw] of Object.entries(SIGNATURES)) {
    fs.writeFileSync(
      path.join(signatureDir, `signature-${design}-${name}.svg`),
      draw(variant)
    );
  }
}
const count = (map) => Object.keys(VARIANTS).length * Object.keys(map).length;
console.log(
  `Wrote ${count(BANNERS)} banners to ${outDir} and ${count(SIGNATURES)} signatures to ${signatureDir}`
);
