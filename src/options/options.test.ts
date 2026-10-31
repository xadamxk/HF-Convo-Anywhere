import {
  DEFAULT_SETTINGS,
  DOCK_STATE_KEY,
  GROUP_LIST_KEY,
  loadSettings,
  saveSettings,
  SETTINGS,
} from "../settings";
import { renderOptions } from "./options";

const flush = () => new Promise((resolve) => setTimeout(resolve, 5));

async function render(): Promise<HTMLElement> {
  const root = document.createElement("main");
  document.body.replaceChildren(root);
  await renderOptions(root);
  return root;
}

function radio(root: HTMLElement, name: string, value: string) {
  return root.querySelector(
    `input[name="${name}"][value="${value}"]`
  ) as HTMLInputElement;
}

function input(root: HTMLElement, name: string) {
  return root.querySelector(`input[name="${name}"]`) as HTMLInputElement;
}

describe("options page", () => {
  it("shows a control for every setting", async () => {
    const root = await render();
    for (const setting of SETTINGS) {
      expect(input(root, setting.id)).not.toBeNull();
    }
  });

  it("shows the stored settings", async () => {
    await saveSettings({
      ...DEFAULT_SETTINGS,
      layout: "list",
      maxBubbles: 9,
      sound: true,
    });
    const root = await render();
    expect(radio(root, "layout", "list").checked).toBe(true);
    expect(radio(root, "layout", "bubbles").checked).toBe(false);
    expect(input(root, "maxBubbles").value).toBe("9");
    expect(input(root, "sound").checked).toBe(true);
    expect(input(root, "globalChat").checked).toBe(true);
  });

  it("saves every setting as it changes", async () => {
    const root = await render();
    const check = (name: string) => {
      const box = input(root, name);
      box.click();
    };
    radio(root, "layout", "list").click();
    radio(root, "side", "left").click();
    radio(root, "theme", "solarized").click();
    radio(root, "groupSound", "all").click();
    const count = input(root, "maxBubbles");
    count.value = "15";
    count.dispatchEvent(new Event("change"));
    [
      "typingIndicators",
      "globalChat",
      "hideStanley",
      "groupChats",
      "convoLinks",
      "sound",
    ].forEach(check);
    await flush();

    expect(await loadSettings()).toEqual({
      layout: "list",
      side: "left",
      theme: "solarized",
      maxBubbles: 15,
      typingIndicators: false,
      globalChat: false,
      hideStanley: true,
      groupChats: false,
      convoLinks: false,
      sound: true,
      groupSound: "all",
    });
    expect(root.querySelector(".status")?.textContent).toContain("Saved");
  });

  it("shows each theme with its colors", async () => {
    const root = await render();
    const choices = Array.from(
      root.querySelectorAll<HTMLInputElement>('input[name="theme"]')
    ).map((input) => input.closest("label")!);
    expect(choices.map((label) => label.textContent)).toEqual([
      "Gray",
      "HF Purple",
      "HFX Blue",
      "Midnight",
      "High Contrast",
      "Ember",
      "Solarized",
      "Forest",
      "Light",
      "Synthwave",
      "Ocean",
      "Sunset",
      "Crimson",
      "Matrix",
      "Sakura",
    ]);
    for (const label of choices) {
      expect(label.querySelectorAll(".swatch")).toHaveLength(4);
    }
    expect(radio(root, "theme", "gray").checked).toBe(true);
  });

  it("says a new theme shows without reloading", async () => {
    const root = await render();
    radio(root, "theme", "midnight").click();
    await flush();
    expect(root.querySelector(".status")?.textContent).toBe("Saved.");
    radio(root, "side", "left").click();
    await flush();
    expect(root.querySelector(".status")?.textContent).toBe(
      "Saved. Reload HF pages to apply."
    );
  });

  it("keeps the conversation count in range", async () => {
    const root = await render();
    const count = input(root, "maxBubbles");
    count.value = "99";
    count.dispatchEvent(new Event("change"));
    await flush();
    expect(count.value).toBe("20");
    expect((await loadSettings()).maxBubbles).toBe(20);
  });

  it("resets to defaults", async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, side: "left", sound: true });
    const root = await render();
    const reset = Array.from(root.querySelectorAll("button")).find(
      (button) => button.textContent === "Reset to defaults"
    )!;
    reset.click();
    await flush();
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(radio(root, "side", "right").checked).toBe(true);
    expect(input(root, "sound").checked).toBe(false);
  });

  it("clears stored chat data", async () => {
    await chrome.storage.local.set({
      [DOCK_STATE_KEY]: { open: [] },
      [GROUP_LIST_KEY]: { groups: [] },
    });
    const root = await render();
    const clears = Array.from(root.querySelectorAll("button")).filter(
      (button) => button.textContent === "Clear"
    );
    expect(clears).toHaveLength(2);
    clears.forEach((button) => button.click());
    await flush();
    expect(await chrome.storage.local.get(null)).toEqual({});
  });
});
