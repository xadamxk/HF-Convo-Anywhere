/**
 * The extension's settings: their definitions (which the options page renders)
 * and reading/writing them in chrome.storage.local.
 */

import { THEMES, ThemeId, themeSwatches } from "./chat/themes";

export interface ConvoSettings {
  layout: "bubbles" | "list";
  side: "left" | "right";
  theme: ThemeId;
  maxBubbles: number;
  typingIndicators: boolean;
  globalChat: boolean;
  hideStanley: boolean;
  groupChats: boolean;
  convoLinks: boolean;
  sound: boolean;
  groupSound: "mentions" | "all";
  sharedConnection: boolean;
}

type KeysOfType<T> = {
  [K in keyof ConvoSettings]: ConvoSettings[K] extends T ? K : never;
}[keyof ConvoSettings];

interface BaseDefinition<K extends keyof ConvoSettings> {
  id: K;
  label: string;
  description: string;
}

export interface CheckboxDefinition extends BaseDefinition<
  KeysOfType<boolean>
> {
  type: "checkbox";
  default: boolean;
}

export interface RadioDefinition extends BaseDefinition<KeysOfType<string>> {
  type: "radio";
  default: string;
  /** Colors shown beside an option (the themes) */
  options: { label: string; value: string; swatches?: string[] }[];
}

export interface NumberDefinition extends BaseDefinition<KeysOfType<number>> {
  type: "number";
  default: number;
  min: number;
  max: number;
  step: number;
}

export type SettingDefinition =
  CheckboxDefinition | RadioDefinition | NumberDefinition;

/** Every setting, in the order the options page shows them. */
export const SETTINGS: SettingDefinition[] = [
  {
    type: "radio",
    id: "layout",
    label: "Layout",
    description:
      "Avatar bubbles, or a Messenger-style list of conversations with their latest message.",
    default: "bubbles",
    options: [
      { label: "Bubbles", value: "bubbles" },
      { label: "List", value: "list" },
    ],
  },
  {
    type: "radio",
    id: "side",
    label: "Dock side",
    description:
      "Which side of the page the chat bubbles or list and the chat windows sit on.",
    default: "right",
    options: [
      { label: "Right", value: "right" },
      { label: "Left", value: "left" },
    ],
  },
  {
    type: "radio",
    id: "theme",
    label: "Theme",
    description:
      "The chat dock's colors. Changes show on open HF pages right away.",
    default: "gray",
    options: THEMES.map((theme) => ({
      label: theme.label,
      value: theme.id,
      swatches: themeSwatches(theme),
    })),
  },
  {
    type: "number",
    id: "maxBubbles",
    label: "Conversations to show",
    description:
      "The most conversations to show: up to 10 bubbles, or up to 20 in the list. Unread conversations are shown first.",
    default: 8,
    min: 1,
    max: 20,
    step: 1,
  },
  {
    type: "checkbox",
    id: "typingIndicators",
    label: "Typing indicators",
    description:
      "Show when the other person is typing, and let them see when you are.",
    default: true,
  },
  {
    type: "checkbox",
    id: "globalChat",
    label: "Global chat",
    description:
      "Add a Global chat entry for HF's public Convo room. You only join the room, and show in its online list, while its window is open.",
    default: true,
  },
  {
    type: "checkbox",
    id: "hideStanley",
    label: "Hide Stanley in global chat",
    description:
      "Hide Stanley's automated notices (new threads and other alerts) from the global chat.",
    default: false,
  },
  {
    type: "checkbox",
    id: "groupChats",
    label: "Group chats",
    description:
      "Include your private group convos (Comrades on convo.php) alongside your DMs.",
    default: true,
  },
  {
    type: "checkbox",
    id: "convoLinks",
    label: "Open Convo links here",
    description:
      "HF's Convo buttons on profiles and posts open the chat here instead of on convo.php. Ctrl-click or middle-click still opens convo.php.",
    default: true,
  },
  {
    type: "checkbox",
    id: "sound",
    label: "Message sound",
    description:
      "Play Convo's sound for new messages, and for global chat messages that mention you. Conversations muted on convo.php stay silent.",
    default: false,
  },
  {
    type: "radio",
    id: "groupSound",
    label: "Group chat sound",
    description:
      "With Message sound on: which new group chat messages play it.",
    default: "mentions",
    options: [
      { label: "Mentions only", value: "mentions" },
      { label: "Every message", value: "all" },
    ],
  },
  {
    type: "checkbox",
    id: "sharedConnection",
    label: "Share one connection across tabs",
    description:
      "All your open HF tabs share one connection to Convo instead of opening one each. Turn off if chats misbehave with several tabs open.",
    default: true,
  },
];

export const DEFAULT_SETTINGS: ConvoSettings = Object.fromEntries(
  SETTINGS.map((setting) => [setting.id, setting.default])
) as unknown as ConvoSettings;

/** chrome.storage.local keys. */
export const SETTINGS_KEY = "settings";
export const DOCK_STATE_KEY = "dockState";
export const GROUP_LIST_KEY = "groupList";

/** Data the extension keeps (not settings), which the options page can clear. */
export const STORAGE_ITEMS: {
  id: string;
  label: string;
  description: string;
}[] = [
  {
    id: DOCK_STATE_KEY,
    label: "Chat windows",
    description:
      "Which chat windows are open or minimized, and group chat activity (this browser only).",
  },
  {
    id: GROUP_LIST_KEY,
    label: "Group list",
    description:
      "Your group chats, read once from convo.php (this browser only). Clear it to read them again.",
  },
];

/**
 * Keep only valid stored values, falling back to each setting's default (for
 * missing, older or hand-edited values).
 */
export function normalizeSettings(stored: unknown): ConvoSettings {
  const source = (stored && typeof stored === "object" ? stored : {}) as Record<
    string,
    unknown
  >;
  const settings: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const setting of SETTINGS) {
    const value = source[setting.id];
    switch (setting.type) {
      case "checkbox":
        if (typeof value === "boolean") settings[setting.id] = value;
        break;
      case "radio":
        if (setting.options.some((option) => option.value === value)) {
          settings[setting.id] = value;
        }
        break;
      case "number": {
        const number =
          typeof value === "number" || typeof value === "string"
            ? Number(value)
            : NaN;
        if (value !== "" && Number.isFinite(number)) {
          settings[setting.id] = Math.min(
            setting.max,
            Math.max(setting.min, Math.round(number))
          );
        }
        break;
      }
    }
  }
  return settings as unknown as ConvoSettings;
}

export async function loadSettings(): Promise<ConvoSettings> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  return normalizeSettings(stored[SETTINGS_KEY]);
}

export async function saveSettings(settings: ConvoSettings): Promise<void> {
  await chrome.storage.local.set({
    [SETTINGS_KEY]: normalizeSettings(settings),
  });
}

export async function getStorageItem<T>(key: string): Promise<T | undefined> {
  const stored = await chrome.storage.local.get(key);
  return stored[key] as T | undefined;
}

export async function setStorageItem(
  key: string,
  value: unknown
): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

export async function clearStorageItem(key: string): Promise<void> {
  await chrome.storage.local.remove(key);
}

/**
 * Call `listener` with the theme whenever the saved settings change it (the
 * settings page saves as soon as one is picked), so open pages follow along.
 */
export function watchTheme(listener: (theme: ThemeId) => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    const change = changes[SETTINGS_KEY];
    if (area !== "local" || !change) return;
    const theme = normalizeSettings(change.newValue).theme;
    if (theme !== normalizeSettings(change.oldValue).theme) listener(theme);
  });
}
