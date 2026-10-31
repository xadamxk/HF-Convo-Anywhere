import { CHAT_DOCK_CSS } from "./styles";
import { DEFAULT_COLORS, themeCss, THEMES, themeSwatches } from "./themes";

/** The theme's own variables: a theme may also set its scrollbar colors. */
const THEME_ONLY = ["theme-scroll-thumb", "theme-scroll-track"];

describe("themes", () => {
  it("only set variables the dock has", () => {
    for (const theme of THEMES) {
      for (const name of Object.keys(theme.colors)) {
        expect([...Object.keys(DEFAULT_COLORS), ...THEME_ONLY]).toContain(name);
      }
    }
  });

  it("use every variable the dock's styles read", () => {
    const used = new Set(
      Array.from(
        CHAT_DOCK_CSS.matchAll(/var\(--hfx-chat-([a-z-]+)/g),
        (m) => m[1]
      )
    );
    const declared = new Set(
      Array.from(CHAT_DOCK_CSS.matchAll(/--hfx-chat-([a-z-]+):/g), (m) => m[1])
    );
    for (const name of used) {
      if (!THEME_ONLY.includes(name)) expect(declared).toContain(name);
    }
  });

  it("are scoped to the dock with that theme", () => {
    const css = themeCss();
    expect(css).toContain('#hfx-chat-dock[data-theme="purple"] {');
    expect(css).toContain("--hfx-chat-accent: #7b4a99;");
    // Gray is the stylesheet's defaults
    expect(css).not.toContain('data-theme="gray"');
    expect(CHAT_DOCK_CSS).toContain("--hfx-chat-bg: #1f1f1f;");
    expect(CHAT_DOCK_CSS).toContain(css);
  });

  it("show their panel, header, border and accent colors", () => {
    const gray = THEMES.find((theme) => theme.id === "gray")!;
    expect(themeSwatches(gray)).toEqual([
      "#1f1f1f",
      "#2d2d2d",
      "#3c3c3c",
      "#4d2f5d",
    ]);
    const midnight = THEMES.find((theme) => theme.id === "midnight")!;
    // Midnight keeps Gray's accent
    expect(themeSwatches(midnight)[3]).toBe("#4d2f5d");
  });

  it("darken HF's username colors on light themes only", () => {
    const css = themeCss();
    for (const id of ["light", "sakura"]) {
      expect(css).toContain(
        `#hfx-chat-dock[data-theme="${id}"] [class^="group"]`
      );
      expect(css).toContain(
        `#hfx-chat-dock[data-theme="${id}"] [class*=" group"]`
      );
    }
    expect(css).not.toContain('[data-theme="sunset"] [class^="group"]');
    expect(css).toContain(' group"] { filter: brightness(0.45); }');
  });

  it("give Crimson its own badge color, so badges don't vanish in the red", () => {
    const crimson = THEMES.find((theme) => theme.id === "crimson")!;
    expect(crimson.colors.badge).not.toBe(DEFAULT_COLORS.badge);
    expect(crimson.colors["on-badge"]).toBeDefined();
  });
});
