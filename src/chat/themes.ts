/**
 * The dock's color themes. Each sets the dock's CSS variables (see styles.ts,
 * where Gray's values are the defaults); the dock picks one with its
 * data-theme attribute.
 */

export type ThemeId =
  | "gray"
  | "purple"
  | "blue"
  | "midnight"
  | "high-contrast"
  | "ember"
  | "solarized"
  | "forest"
  | "light"
  | "synthwave"
  | "ocean"
  | "sunset"
  | "crimson"
  | "matrix"
  | "sakura";

export interface Theme {
  id: ThemeId;
  label: string;
  /** --hfx-chat-* variables (without the prefix) that differ from Gray's */
  colors: Record<string, string>;
  /** Light panels: HF's username colors (made for its dark pages) are darkened */
  light?: boolean;
}

export const DEFAULT_THEME: ThemeId = "gray";

/** Gray's values: the dock's defaults, which other themes override. */
export const DEFAULT_COLORS: Record<string, string> = {
  bg: "#1f1f1f",
  header: "#2d2d2d",
  /** Muted text on the header bars */
  "header-muted": "var(--hfx-chat-muted)",
  /** Popups and notices: emoji, mentions, command replies, the reply button */
  popup: "var(--hfx-chat-header)",
  border: "#3c3c3c",
  text: "#cecece",
  muted: "#8a8a8a",
  strong: "#fff",
  mine: "#4e4e4e",
  "on-mine": "#fff",
  accent: "#4d2f5d",
  "on-accent": "#fff",
  /** White or black, as r, g, b: hover and selection washes */
  tint: "255, 255, 255",
  outline: "#555",
  input: "#2a2a2a",
  "input-border": "#222",
  "input-text": "#eee",
  link: "#9ecbff",
  "mention-bar": "#a982c4",
  "mention-bg": "rgba(77, 47, 93, 0.45)",
  "new-text": "#e0868a",
  "new-line": "#c4565c",
  error: "#ff8a80",
  "notice-icon": "#7fd67f",
  badge: "#d9534f",
  "on-badge": "#fff",
};

export const THEMES: Theme[] = [
  { id: "gray", label: "Gray", colors: {} },
  {
    id: "purple",
    label: "HF Purple",
    colors: {
      bg: "#241b2b",
      header: "#3a2847",
      border: "#4d3a5c",
      text: "#d8cfe0",
      muted: "#9a8ba6",
      mine: "#5e3d72",
      accent: "#7b4a99",
      outline: "#6a5679",
      input: "#2e2236",
      "input-border": "#1a1320",
      link: "#c9a6ff",
      "mention-bar": "#c49bdf",
      "mention-bg": "rgba(150, 90, 190, 0.33)",
      "theme-scroll-thumb": "#4d3a5c",
      "theme-scroll-track": "#241b2b",
    },
  },
  {
    id: "blue",
    label: "HFX Blue",
    colors: {
      bg: "#151c23",
      header: "#1f2a35",
      border: "#2c3b49",
      text: "#cdd8e2",
      muted: "#8496a6",
      mine: "#2b4a63",
      accent: "#0a7fc0",
      outline: "#3e5266",
      input: "#1b242d",
      "input-border": "#0f1419",
      link: "#7fd4ff",
      "mention-bar": "#4fc3ff",
      "mention-bg": "rgba(0, 170, 255, 0.18)",
      "theme-scroll-thumb": "#2c3b49",
      "theme-scroll-track": "#151c23",
    },
  },
  {
    id: "midnight",
    label: "Midnight",
    colors: {
      bg: "#0a0a0a",
      header: "#161616",
      border: "#262626",
      text: "#d0d0d0",
      muted: "#7a7a7a",
      mine: "#333",
      outline: "#444",
      input: "#121212",
      "input-border": "#000",
    },
  },
  {
    id: "high-contrast",
    label: "High Contrast",
    colors: {
      bg: "#000",
      header: "#000",
      border: "#fff",
      text: "#fff",
      muted: "#d6d6d6",
      mine: "#ffd400",
      "on-mine": "#000",
      accent: "#ffd400",
      "on-accent": "#000",
      outline: "#fff",
      input: "#000",
      "input-border": "#fff",
      "input-text": "#fff",
      link: "#6fc3df",
      "mention-bar": "#ffd400",
      "mention-bg": "rgba(255, 212, 0, 0.2)",
      "new-text": "#ff9a9a",
      "new-line": "#ff6b6b",
      "theme-scroll-thumb": "#8a8a8a",
      "theme-scroll-track": "#000",
    },
  },
  {
    id: "ember",
    label: "Ember",
    colors: {
      bg: "#282828",
      header: "#3c3836",
      border: "#504945",
      text: "#ebdbb2",
      muted: "#a89984",
      strong: "#fbf1c7",
      mine: "#665c54",
      "on-mine": "#fbf1c7",
      accent: "#c45a10",
      outline: "#665c54",
      input: "#32302f",
      "input-border": "#1d2021",
      "input-text": "#fbf1c7",
      link: "#fabd2f",
      "mention-bar": "#fe8019",
      "mention-bg": "rgba(214, 93, 14, 0.24)",
      "theme-scroll-thumb": "#504945",
      "theme-scroll-track": "#282828",
    },
  },
  {
    id: "solarized",
    label: "Solarized",
    colors: {
      bg: "#002b36",
      header: "#073642",
      border: "#174652",
      text: "#93a1a1",
      muted: "#74878d",
      strong: "#eee8d5",
      mine: "#0e5160",
      "on-mine": "#eee8d5",
      accent: "#1a8a82",
      outline: "#2a5a66",
      input: "#01313d",
      "input-border": "#00212b",
      "input-text": "#eee8d5",
      link: "#4ea3e0",
      "mention-bar": "#2aa198",
      "mention-bg": "rgba(42, 161, 152, 0.2)",
      "theme-scroll-thumb": "#174652",
      "theme-scroll-track": "#002b36",
    },
  },
  {
    id: "forest",
    label: "Forest",
    colors: {
      bg: "#2d353b",
      header: "#343f44",
      border: "#475258",
      text: "#d3c6aa",
      muted: "#859289",
      strong: "#ece3cc",
      mine: "#4f6b3a",
      "on-mine": "#ece3cc",
      accent: "#5a7d3c",
      outline: "#56635f",
      input: "#272e33",
      "input-border": "#1e2326",
      "input-text": "#ece3cc",
      link: "#83c092",
      "mention-bar": "#a7c080",
      "mention-bg": "rgba(167, 192, 128, 0.18)",
      "theme-scroll-thumb": "#475258",
      "theme-scroll-track": "#2d353b",
    },
  },
  {
    id: "light",
    label: "Light",
    light: true,
    colors: {
      bg: "#fff",
      header: "#f2f2f4",
      border: "#d5d5da",
      text: "#1d1c1d",
      muted: "#6b6b70",
      strong: "#1d1c1d",
      mine: "#4d2f5d",
      tint: "0, 0, 0",
      outline: "#bdbdc2",
      input: "#fff",
      "input-border": "#c8c8cc",
      "input-text": "#1d1c1d",
      link: "#1264a3",
      "mention-bar": "#4d2f5d",
      "mention-bg": "rgba(77, 47, 93, 0.1)",
      "new-text": "#c62828",
      "new-line": "#e57373",
      error: "#c62828",
      "notice-icon": "#2e7d32",
      "theme-scroll-thumb": "#c1c1c6",
      "theme-scroll-track": "#f2f2f4",
    },
  },
  {
    id: "synthwave",
    label: "Synthwave",
    colors: {
      bg: "#1a1033",
      header: "#a3206f",
      "header-muted": "#f0c6e0",
      popup: "#2a1d48",
      border: "#3b2463",
      text: "#e6dcff",
      muted: "#a395cc",
      mine: "#5a2d91",
      accent: "#ff2e88",
      outline: "#6a4a9c",
      input: "#22163f",
      "input-border": "#120a24",
      link: "#3ee6ff",
      "mention-bar": "#3ee6ff",
      "mention-bg": "rgba(62, 230, 255, 0.14)",
      "theme-scroll-thumb": "#3b2463",
      "theme-scroll-track": "#1a1033",
    },
  },
  {
    id: "ocean",
    label: "Ocean",
    colors: {
      bg: "#0d2f45",
      header: "#0e7490",
      "header-muted": "#bfe6f0",
      popup: "#123f5a",
      border: "#1b4f6b",
      text: "#d4eef7",
      muted: "#8bb5c8",
      mine: "#155e75",
      accent: "#ff7a59",
      "on-accent": "#3a1206",
      outline: "#2b6a87",
      input: "#0a2638",
      "input-border": "#061b29",
      link: "#67e8f9",
      "mention-bar": "#ff9f80",
      "mention-bg": "rgba(255, 122, 89, 0.16)",
      "theme-scroll-thumb": "#1b4f6b",
      "theme-scroll-track": "#0d2f45",
    },
  },
  {
    id: "sunset",
    label: "Sunset",
    colors: {
      bg: "#2a1226",
      header: "#c4420f",
      "header-muted": "#ffd9c4",
      popup: "#3a1d35",
      border: "#4a2340",
      text: "#f5dfe6",
      muted: "#c497a8",
      mine: "#6b2a50",
      accent: "#f6b73c",
      "on-accent": "#3a2200",
      outline: "#6e3a5f",
      input: "#33172e",
      "input-border": "#1c0a19",
      link: "#ffb38a",
      "mention-bar": "#ff8fab",
      "mention-bg": "rgba(255, 105, 150, 0.18)",
      "theme-scroll-thumb": "#4a2340",
      "theme-scroll-track": "#2a1226",
    },
  },
  {
    id: "crimson",
    label: "Crimson",
    colors: {
      bg: "#1f0d10",
      header: "#9b1c24",
      "header-muted": "#f2c4c7",
      popup: "#2e1418",
      border: "#4a1c22",
      text: "#f0d9da",
      muted: "#b08a8d",
      mine: "#5c1f26",
      accent: "#e8b923",
      "on-accent": "#2a1d00",
      outline: "#6b2d34",
      input: "#2a1114",
      "input-border": "#12060a",
      link: "#ffcf66",
      "mention-bar": "#e8b923",
      "mention-bg": "rgba(232, 185, 35, 0.16)",
      // Red badges and lines would vanish against the red
      badge: "#ffd166",
      "on-badge": "#3a1d00",
      "new-text": "#ffd166",
      "new-line": "#e8b923",
      "theme-scroll-thumb": "#4a1c22",
      "theme-scroll-track": "#1f0d10",
    },
  },
  {
    id: "matrix",
    label: "Matrix",
    colors: {
      bg: "#020a04",
      header: "#062612",
      border: "#0f5a26",
      text: "#7dff9b",
      muted: "#45c065",
      strong: "#c2ffd0",
      mine: "#0d3d1c",
      "on-mine": "#c2ffd0",
      accent: "#00c853",
      "on-accent": "#00220c",
      tint: "125, 255, 155",
      outline: "#1b7a3a",
      input: "#031208",
      "input-border": "#0f5a26",
      "input-text": "#c2ffd0",
      link: "#c2ffd0",
      "mention-bar": "#39ff6a",
      "mention-bg": "rgba(57, 255, 106, 0.12)",
      "theme-scroll-thumb": "#0f5a26",
      "theme-scroll-track": "#020a04",
    },
  },
  {
    id: "sakura",
    label: "Sakura",
    light: true,
    colors: {
      bg: "#fff7fa",
      header: "#fbd3e0",
      popup: "#fde8ef",
      border: "#f0b3c7",
      text: "#3d1f2b",
      muted: "#8a5a6c",
      strong: "#2b1420",
      mine: "#b8336a",
      accent: "#b8336a",
      tint: "0, 0, 0",
      outline: "#e3a0b8",
      input: "#fff",
      "input-border": "#f0b3c7",
      "input-text": "#2b1420",
      link: "#a3195b",
      "mention-bar": "#b8336a",
      "mention-bg": "rgba(184, 51, 106, 0.1)",
      "new-text": "#c62828",
      "new-line": "#e57373",
      error: "#c62828",
      "notice-icon": "#2e7d32",
      "theme-scroll-thumb": "#e3a0b8",
      "theme-scroll-track": "#fde8ef",
    },
  },
];

/**
 * Each theme's variables, scoped to the dock with that data-theme, and on
 * light themes, HF's username colors darkened.
 */
export function themeCss(): string {
  const dock = (theme: Theme) => `#hfx-chat-dock[data-theme="${theme.id}"]`;
  const colors = THEMES.filter((theme) => Object.keys(theme.colors).length).map(
    (theme) => {
      const vars = Object.entries(theme.colors)
        .map(([name, value]) => `  --hfx-chat-${name}: ${value};`)
        .join("\n");
      return `${dock(theme)} {\n${vars}\n}`;
    }
  );
  const names = THEMES.filter((theme) => theme.light).flatMap((theme) => [
    `${dock(theme)} [class^="group"]`,
    `${dock(theme)} [class*=" group"]`,
  ]);
  return [...colors, `${names.join(",\n")} { filter: brightness(0.45); }`].join(
    "\n"
  );
}

/**
 * A theme's four main colors (panel, header, border, accent), for the
 * settings page's swatches.
 */
export function themeSwatches(theme: Theme): string[] {
  return ["bg", "header", "border", "accent"].map(
    (name) => theme.colors[name] ?? DEFAULT_COLORS[name]
  );
}
