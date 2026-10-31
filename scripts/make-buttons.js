// Draws the download buttons for the release thread into assets/buttons as
// SVG, styled like Convo Anywhere itself (transparent around the button):
//   button-message-<browser>.svg       a Convo message: browser as the avatar and name
//   button-notification-<browser>.svg  a new-message notification with an Install pill
//   new-messages.svg                   the "New messages" line, to go above the message buttons
// Run with `npm run buttons`; `npm run buttons:png` then renders the PNGs.
//
// The browser icons are drawn here. To use the official logo files instead,
// save them as assets/buttons/logos/chrome.svg and firefox.svg.
const fs = require("fs");
const path = require("path");

const outDir = path.resolve(__dirname, "../assets/buttons");
const FONT = "'Segoe UI', Arial, sans-serif";
const WIDTH = 1200;

const BROWSERS = {
  chrome: {
    name: "Chrome",
    nameColor: "#8ab4f8",
    message: "Click to install from the Official Chrome Web Store",
  },
  firefox: {
    name: "Firefox",
    nameColor: "#ffa436",
    message: "Click to install directly from Mozilla Add-ons",
  },
};

// ---- Browser icons, centred on (0, 0) with radius 50 ----

/**
 * Chrome's logo: three sections made by lines tangent to the centre circle,
 * each 120° apart, around a white ring and a blue centre.
 */
function chromeIcon() {
  const R = 50;
  const r = 22;
  const x = Math.sqrt(R * R - r * r);
  // The red section; the others are the same shape turned 120° and 240°
  const rot = (px, py, deg) => {
    const a = (deg * Math.PI) / 180;
    return [
      px * Math.cos(a) - py * Math.sin(a),
      px * Math.sin(a) + py * Math.cos(a),
    ];
  };
  const [b2x, b2y] = rot(x, -r, 240);
  const [t2x, t2y] = rot(0, -r, 240);
  const f = (n) => Math.round(n * 100) / 100;
  const section = `M0 ${-r} L${f(x)} ${-r} A${R} ${R} 0 0 0 ${f(b2x)} ${f(b2y)} L${f(t2x)} ${f(t2y)} L0 0 Z`;
  return [
    `<path d="${section}" fill="#db4437"/>`,
    `<path d="${section}" fill="#f4b400" transform="rotate(120)"/>`,
    `<path d="${section}" fill="#0f9d58" transform="rotate(240)"/>`,
    `<circle r="${r}" fill="#ffffff"/>`,
    `<circle r="${r - 4.5}" fill="#4285f4"/>`,
  ].join("");
}

/** A drawing of Firefox's logo: a purple globe wrapped by an orange fox. */
function firefoxIcon(id) {
  return [
    `<defs>`,
    `<radialGradient id="${id}-globe" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="#b833e1"/><stop offset="0.45" stop-color="#7542e5"/><stop offset="1" stop-color="#3a3dd0"/></radialGradient>`,
    `<linearGradient id="${id}-fox" x1="0.85" y1="0.1" x2="0.2" y2="0.95"><stop offset="0" stop-color="#ffe226"/><stop offset="0.35" stop-color="#ff980e"/><stop offset="0.7" stop-color="#ff3750"/><stop offset="1" stop-color="#eb0878"/></linearGradient>`,
    `</defs>`,
    // The globe, set to the top right where the fox's curl leaves it open
    `<circle cx="8" cy="-8" r="34" fill="url(#${id}-globe)"/>`,
    // The fox: its head across the top of the globe, its body thick down the
    // left and round the bottom, and its tail curling up the right side
    `<path d="M-2 -50 C10 -52 22 -48 29 -40 C21 -41 14 -42 8 -42 A34 34 0 1 0 42 -8 C44 -12 46 -16 46 -20 A50 50 0 1 1 -2 -50 Z" fill="url(#${id}-fox)"/>`,
    // The ear
    `<path d="M-2 -50 L-9 -58 L4 -51 Z" fill="#ff980e"/>`,
  ].join("");
}

/** A browser's icon as an avatar, or the official logo if one was saved. */
function icon(browser, cx, cy, radius, id) {
  const logo = path.join(outDir, "logos", `${browser}.svg`);
  if (fs.existsSync(logo)) {
    return `<image href="logos/${browser}.svg" x="${cx - radius}" y="${cy - radius}" width="${radius * 2}" height="${radius * 2}"/>`;
  }
  const scale = radius / 50;
  const body = browser === "chrome" ? chromeIcon() : firefoxIcon(id);
  return `<g transform="translate(${cx} ${cy}) scale(${scale})">${body}</g>`;
}

// ---- Images ----

function svg(width, height, body) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    body,
    `</svg>`,
    "",
  ].join("\n");
}

const text = (x, y, size, color, content, extra = "") =>
  `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" fill="${color}" ${extra}>${content}</text>`;

/** Option 1: a Convo message, with the browser as the avatar and name. */
function messageButton(browser) {
  const b = BROWSERS[browser];
  const height = 132;
  return svg(
    WIDTH,
    height,
    [
      `<rect x="2" y="2" width="${WIDTH - 4}" height="${height - 4}" rx="20" fill="#242424" stroke="#3d3d3d" stroke-width="2"/>`,
      icon(browser, 76, height / 2, 46, `${browser}-message`),
      // The time right after the name, as in a chat window
      text(
        148,
        56,
        32,
        b.nameColor,
        `${b.name}<tspan dx="14" font-size="22" font-weight="400" fill="#8a8a8a">now</tspan>`,
        'font-weight="700"'
      ),
      text(148, 100, 32, "#e6e6e6", b.message),
    ].join("\n")
  );
}

/** Option 3: a new-message notification with an unread badge and an Install pill. */
function notificationButton(browser) {
  const b = BROWSERS[browser];
  const height = 132;
  const pillWidth = 170;
  const pillX = WIDTH - 36 - pillWidth;
  return svg(
    WIDTH,
    height,
    [
      `<rect x="2" y="2" width="${WIDTH - 4}" height="${height - 4}" rx="20" fill="#242424" stroke="#3d3d3d" stroke-width="2"/>`,
      icon(browser, 76, height / 2, 44, `${browser}-notification`),
      `<circle cx="110" cy="96" r="16" fill="#e53935" stroke="#242424" stroke-width="4"/>`,
      text(
        110,
        104,
        21,
        "#ffffff",
        "1",
        'font-weight="700" text-anchor="middle"'
      ),
      text(150, 58, 32, "#ffffff", b.name, 'font-weight="700"'),
      text(150, 98, 27, "#a8a8a8", b.message),
      `<rect x="${pillX}" y="${height / 2 - 30}" width="${pillWidth}" height="60" rx="30" fill="#4d2f5d"/>`,
      text(
        pillX + pillWidth / 2,
        height / 2 + 10,
        27,
        "#ffffff",
        "Install",
        'font-weight="600" text-anchor="middle"'
      ),
    ].join("\n")
  );
}

/** The "New messages" line, as the extension draws it above unread messages. */
function newMessages() {
  const height = 56;
  const label = "NEW MESSAGES";
  const labelWidth = 230;
  const y = height / 2;
  return svg(
    WIDTH,
    height,
    [
      `<path d="M8 ${y} H${WIDTH / 2 - labelWidth / 2 - 16} M${WIDTH / 2 + labelWidth / 2 + 16} ${y} H${WIDTH - 8}" stroke="#c4565c" stroke-width="3" stroke-linecap="round"/>`,
      text(
        WIDTH / 2,
        y + 9,
        26,
        "#e0868a",
        label,
        'font-weight="700" text-anchor="middle" letter-spacing="1.5"'
      ),
    ].join("\n")
  );
}

fs.mkdirSync(outDir, { recursive: true });
const files = { "new-messages.svg": newMessages() };
for (const browser of Object.keys(BROWSERS)) {
  files[`button-message-${browser}.svg`] = messageButton(browser);
  files[`button-notification-${browser}.svg`] = notificationButton(browser);
}
for (const [name, content] of Object.entries(files)) {
  fs.writeFileSync(path.join(outDir, name), content);
}
console.log(`Wrote ${Object.keys(files).length} images to ${outDir}`);
