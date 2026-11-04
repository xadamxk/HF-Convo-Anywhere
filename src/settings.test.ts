import {
  DEFAULT_SETTINGS,
  loadSettings,
  normalizeSettings,
  saveSettings,
  SETTINGS,
  SETTINGS_KEY,
  watchTheme,
} from "./settings";

describe("settings", () => {
  it("has HFX's Convo Anywhere defaults, but shows 8 conversations", () => {
    expect(DEFAULT_SETTINGS).toEqual({
      layout: "bubbles",
      side: "right",
      theme: "gray",
      maxBubbles: 8,
      typingIndicators: true,
      globalChat: true,
      hideStanley: false,
      groupChats: true,
      convoLinks: true,
      sound: false,
      groupSound: "mentions",
      sharedConnection: true,
    });
  });

  it("loads defaults when nothing is stored", async () => {
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("saves and loads every setting", async () => {
    const changed = {
      layout: "list",
      side: "left",
      theme: "light",
      maxBubbles: 12,
      typingIndicators: false,
      globalChat: false,
      hideStanley: true,
      groupChats: false,
      convoLinks: false,
      sound: true,
      groupSound: "all",
      sharedConnection: false,
    } as const;
    // Every setting differs from its default
    for (const setting of SETTINGS) {
      expect(changed[setting.id]).not.toEqual(setting.default);
    }
    await saveSettings(changed);
    expect(await loadSettings()).toEqual(changed);
  });

  it("falls back to defaults for invalid stored values", () => {
    expect(
      normalizeSettings({
        layout: "grid",
        side: 3,
        theme: "neon",
        maxBubbles: "lots",
        sound: "yes",
        groupSound: null,
        unknown: true,
      })
    ).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps the conversation count in range", () => {
    expect(normalizeSettings({ maxBubbles: 50 }).maxBubbles).toBe(20);
    expect(normalizeSettings({ maxBubbles: 0 }).maxBubbles).toBe(1);
    expect(normalizeSettings({ maxBubbles: "7" }).maxBubbles).toBe(7);
  });

  it("stores settings under one key", async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, side: "left" });
    const stored = await chrome.storage.local.get(SETTINGS_KEY);
    expect(stored[SETTINGS_KEY]).toMatchObject({ side: "left" });
  });

  it("tells open pages when the theme changes, and only then", async () => {
    const listener = jest.fn();
    watchTheme(listener);
    await saveSettings({ ...DEFAULT_SETTINGS, theme: "ember" });
    await saveSettings({ ...DEFAULT_SETTINGS, theme: "ember", sound: true });
    await chrome.storage.local.set({ dockState: { collapsed: true } });
    expect(listener.mock.calls).toEqual([["ember"]]);
    // Cleared settings: back to the default
    await chrome.storage.local.remove(SETTINGS_KEY);
    expect(listener.mock.calls).toEqual([["ember"], ["gray"]]);
  });
});
