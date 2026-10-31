import { el } from "../core/Dom";

/**
 * The outcomes of commands sent as messages (/flip 100, /jackpot play,
 * /price BTC). The server answers each with its own event naming the
 * message's id, and convo.php's features (flip.js, jackpot.js, price.js) add
 * the outcome under that message. They're live only: history doesn't have them.
 */

export type CommandResult =
  | { kind: "flip"; win: boolean; outcome: string; balance: number }
  | { kind: "jackpot"; won: number; balance: number; pot: number }
  | { kind: "jackpot-error"; error: string }
  | { kind: "price"; name: string; price: string; change: number };

const num = (value: unknown): number => {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n : 0;
};

/** jackpot.js's names for the server's error codes. */
const JACKPOT_ERRORS: Record<string, string> = {
  bad_format_generic: "Invalid Format",
  bad_format_plays: "Invalid Format",
  already_playing: "Already Playing",
  low_balance: "Insufficient Bytes",
  max_plays_exceeded: "Max Plays: 100",
};

const PARSERS: Record<string, (data: any) => CommandResult> = {
  convo_flip_result: (data) => ({
    kind: "flip",
    win: !!data.win,
    outcome: String(data.outcome ?? ""),
    balance: num(data.balance),
  }),
  convo_jackpot_result: (data) =>
    data.success
      ? {
          kind: "jackpot",
          won: num(data.bytesWon),
          balance: num(data.balance),
          pot: num(data.pot),
        }
      : {
          kind: "jackpot-error",
          error: JACKPOT_ERRORS[String(data.message)] ?? "Unknown Error",
        },
  convo_coin_result: (data) => ({
    kind: "price",
    name: String(data.name ?? ""),
    price: String(data.price ?? ""),
    change: num(data.daychange),
  }),
};

/** The socket events that carry a command's outcome. */
export const RESULT_EVENTS = Object.keys(PARSERS);

/** A result event's message id and outcome; null if it names no message. */
export function parseCommandResult(
  event: string,
  data: any
): { mid: number; result: CommandResult } | null {
  const parse = PARSERS[event];
  const mid = Math.trunc(num(data?.mid));
  if (!parse || mid <= 0) return null;
  return { mid, result: parse(data) };
}

/**
 * Outcomes by message id, so one that arrives before its message (or for a
 * window not open yet) is still there when the message is shown.
 */
export class CommandResults {
  private readonly results = new Map<number, CommandResult>();

  constructor(private readonly limit = 200) {}

  set(mid: number, result: CommandResult): void {
    this.results.delete(mid);
    this.results.set(mid, result);
    if (this.results.size > this.limit) {
      this.results.delete(this.results.keys().next().value!);
    }
  }

  get(mid: number): CommandResult | undefined {
    return this.results.get(mid);
  }

  clear(): void {
    this.results.clear();
  }
}

const bytes = (value: number) => `β${Math.floor(value).toLocaleString()}`;

const row = (label: string, value: string) =>
  el("div", null, [
    el("span", { class: "hfx-chat-result-label" }, label),
    value,
  ]);

/** The outcome as convo.php shows it, as a small card under the message. */
export function renderCommandResult(result: CommandResult): HTMLElement {
  switch (result.kind) {
    case "flip":
      return el(
        "div",
        {
          class: `hfx-chat-result hfx-chat-result-${result.win ? "win" : "loss"}`,
        },
        [
          // The server sends "heads" / "tails"
          row(
            "Result:",
            result.outcome.charAt(0).toUpperCase() + result.outcome.slice(1)
          ),
          row(
            result.win ? "Won · Balance:" : "Lost · Balance:",
            bytes(result.balance)
          ),
        ]
      );
    case "jackpot":
      return el(
        "div",
        {
          class: `hfx-chat-result hfx-chat-result-${result.won > 0 ? "win" : "loss"}`,
        },
        [
          result.won > 0 &&
            row("Won:", `+${Math.floor(result.won).toLocaleString()}`),
          row("Balance:", bytes(result.balance)),
          row("Pot:", bytes(result.pot)),
        ]
      );
    case "jackpot-error":
      return el(
        "div",
        { class: "hfx-chat-result hfx-chat-result-warn" },
        result.error
      );
    case "price": {
      const change = parseFloat(result.change.toFixed(2)) + 0;
      return el(
        "div",
        {
          class: `hfx-chat-result hfx-chat-result-${change >= 0 ? "win" : "loss"}`,
        },
        [
          result.name &&
            el("div", { class: "hfx-chat-result-title" }, result.name),
          row("USD Value:", `$${result.price}`),
          row("24h Change:", `${change > 0 ? "+" : ""}${change}%`),
        ]
      );
    }
  }
}

/** Show (or replace) a message line's outcome. */
export function showCommandResult(
  line: HTMLElement,
  result: CommandResult
): void {
  line.querySelector(":scope > .hfx-chat-result")?.remove();
  line.appendChild(renderCommandResult(result));
}
