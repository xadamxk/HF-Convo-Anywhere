// Renders a folder's SVGs (assets/banners by default) to PNGs of the same
// size, using a Chrome that is running with --remote-debugging-port (default
// 9222; set CDP_PORT to change it). Run `npm run banners` first.
// Usage: node render-banners.js [folder] [--transparent]
//   --transparent keeps the area around the drawing transparent (the
//   buttons); without it PNGs have no alpha channel, as the Web Store needs.
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const PORT = process.env.CDP_PORT || 9222;
const args = process.argv.slice(2);
const transparent = args.includes("--transparent");
const dir = path.resolve(
  __dirname,
  "..",
  args.find((arg) => !arg.startsWith("--")) ?? "assets/banners"
);

async function connect() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, {
    method: "PUT",
  }).catch(() => null);
  if (!res?.ok) {
    throw new Error(
      `No Chrome with remote debugging on port ${PORT}; start one with --remote-debugging-port=${PORT}`
    );
  }
  const target = await res.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve) => ws.addEventListener("open", resolve));
  let id = 0;
  const pending = new Map();
  const listeners = new Set();
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    } else listeners.forEach((fn) => fn(msg));
  });
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      pending.set(++id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  const loaded = () =>
    new Promise((resolve) => {
      const fn = (msg) => {
        if (msg.method === "Page.loadEventFired") {
          listeners.delete(fn);
          resolve();
        }
      };
      listeners.add(fn);
    });
  const close = async () => {
    ws.close();
    await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`);
  };
  return { send, loaded, close };
}

(async () => {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".svg"));
  if (!files.length) throw new Error(`No SVGs in ${dir}`);
  const tab = await connect();
  await tab.send("Page.enable");
  if (transparent) {
    await tab.send("Emulation.setDefaultBackgroundColorOverride", {
      color: { r: 0, g: 0, b: 0, a: 0 },
    });
  }
  try {
    for (const file of files) {
      const source = fs.readFileSync(path.join(dir, file), "utf8");
      const [, width, height] = source.match(/width="(\d+)" height="(\d+)"/);
      await tab.send("Emulation.setDeviceMetricsOverride", {
        width: Number(width),
        height: Number(height),
        deviceScaleFactor: 1,
        mobile: false,
      });
      const loaded = tab.loaded();
      await tab.send("Page.navigate", {
        url: pathToFileURL(path.join(dir, file)).href,
      });
      await loaded;
      const shot = await tab.send("Page.captureScreenshot", {
        format: "png",
        clip: {
          x: 0,
          y: 0,
          width: Number(width),
          height: Number(height),
          scale: 1,
        },
      });
      const out = path.join(dir, file.replace(/\.svg$/, ".png"));
      fs.writeFileSync(out, Buffer.from(shot.result.data, "base64"));
      console.log(`${file} -> ${path.basename(out)} (${width}x${height})`);
    }
  } finally {
    await tab.close();
  }
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
