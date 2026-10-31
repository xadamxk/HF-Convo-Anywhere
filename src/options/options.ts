import { el } from "../core/Dom";
import {
  clearStorageItem,
  ConvoSettings,
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  SettingDefinition,
  SETTINGS,
  STORAGE_ITEMS,
} from "../settings";

/**
 * The settings page: one row per setting, saved as soon as it changes. Changes
 * apply to HF pages the next time they load.
 */
export async function renderOptions(root: HTMLElement): Promise<void> {
  let settings = await loadSettings();
  const status = el("p", { class: "status", role: "status" });
  let statusTimer: ReturnType<typeof setTimeout> | undefined;

  const showStatus = (message: string, isError = false) => {
    status.textContent = message;
    status.classList.toggle("error", isError);
    clearTimeout(statusTimer);
    if (!isError) {
      statusTimer = setTimeout(() => (status.textContent = ""), 2500);
    }
  };

  const save = async (change: Partial<ConvoSettings>) => {
    settings = { ...settings, ...change };
    try {
      await saveSettings(settings);
      showStatus("Saved. Reload HF pages to apply.");
    } catch (error) {
      showStatus(`Couldn't save: ${(error as Error)?.message}`, true);
    }
  };

  const form = el("form", { class: "settings", novalidate: true });
  form.addEventListener("submit", (event) => event.preventDefault());

  const renderRows = () => {
    form.replaceChildren(
      ...SETTINGS.map((setting) => settingRow(setting, settings, save))
    );
  };
  renderRows();

  const reset = el("button", { type: "button", class: "secondary" }, [
    "Reset to defaults",
  ]);
  reset.addEventListener("click", async () => {
    await save({ ...DEFAULT_SETTINGS });
    renderRows();
  });

  root.replaceChildren(
    el("header", null, [
      el("img", { src: "assets/icons/icon48.png", alt: "", width: 32 }),
      el("h1", null, "HF Convo Anywhere"),
    ]),
    el("section", null, [el("h2", null, "Settings"), form, reset, status]),
    el("section", null, [
      el("h2", null, "Stored data"),
      ...STORAGE_ITEMS.map((item) => storageRow(item, showStatus)),
    ])
  );
}

function settingRow(
  setting: SettingDefinition,
  settings: ConvoSettings,
  save: (change: Partial<ConvoSettings>) => void
): HTMLElement {
  const inputId = `setting-${setting.id}`;
  const description = el(
    "p",
    { class: "description", id: `${inputId}-description` },
    setting.description
  );

  switch (setting.type) {
    case "checkbox": {
      const input = el("input", {
        type: "checkbox",
        id: inputId,
        name: setting.id,
        "aria-describedby": description.id,
        checked: settings[setting.id],
      });
      input.addEventListener("change", () =>
        save({ [setting.id]: input.checked })
      );
      return el("div", { class: "row checkbox" }, [
        input,
        el("div", null, [
          el("label", { for: inputId }, setting.label),
          description,
        ]),
      ]);
    }
    case "radio": {
      const current = settings[setting.id];
      const options = setting.options.map((option) => {
        const input = el("input", {
          type: "radio",
          name: setting.id,
          value: option.value,
          checked: option.value === current,
        });
        input.addEventListener("change", () => {
          if (input.checked) save({ [setting.id]: option.value });
        });
        return el("label", { class: "choice" }, [input, option.label]);
      });
      return el(
        "fieldset",
        { class: "row radio", "aria-describedby": description.id },
        [
          el("legend", null, setting.label),
          description,
          el("div", { class: "choices" }, options),
        ]
      );
    }
    case "number": {
      const input = el("input", {
        type: "number",
        id: inputId,
        name: setting.id,
        min: setting.min,
        max: setting.max,
        step: setting.step,
        value: settings[setting.id],
        "aria-describedby": description.id,
      });
      input.addEventListener("change", () => {
        const value = Math.min(
          setting.max,
          Math.max(setting.min, Math.round(Number(input.value)))
        );
        if (!Number.isFinite(value)) {
          input.value = String(settings[setting.id]);
          return;
        }
        input.value = String(value);
        save({ [setting.id]: value });
      });
      return el("div", { class: "row number" }, [
        el("label", { for: inputId }, setting.label),
        description,
        input,
      ]);
    }
  }
}

function storageRow(
  item: (typeof STORAGE_ITEMS)[number],
  showStatus: (message: string, isError?: boolean) => void
): HTMLElement {
  const clear = el("button", { type: "button", class: "secondary" }, "Clear");
  clear.addEventListener("click", async () => {
    try {
      await clearStorageItem(item.id);
      showStatus(`${item.label} cleared.`);
    } catch (error) {
      showStatus(`Couldn't clear: ${(error as Error)?.message}`, true);
    }
  });
  return el("div", { class: "row storage" }, [
    el("div", null, [
      el("strong", null, item.label),
      el("p", { class: "description" }, item.description),
    ]),
    clear,
  ]);
}
