import { el } from "../core/Dom";
import type { ChatUser } from "./ConvoClient";
import {
  previewKey,
  previewText,
  RenderableMessage,
  trimUrl,
} from "./formatMessage";
import { userLabel } from "./roomLayout";

/**
 * Quoted replies, for extension users only. Convo has no replies of its own,
 * so a reply is sent as an ordinary message (with the @mention HFX has always
 * added, which is all convo.php shows) and the replied-to message travels in
 * the message's `requestId`.
 *
 * Why the requestId: the client picks it, the server stores it and sends it
 * to everyone with the message (live and in history), and convo.php never
 * shows it (verified 2026-11-03 in the global room). So nothing extra appears
 * for people without the extension.
 *
 * Format: still a valid version 4 UUID, in case the server ever checks:
 *
 *   rrrrrrrr-rrrr-4e9c-a7f1-mmmmmmmmmmmm
 *
 * `r` is random (to keep each send's id unique), `4e9c-a7f1` marks a reply,
 * and `m` is the replied-to message's id (mid) in hex. Message ids are per
 * conversation (and per server boot in the global room), so the target is
 * looked up in the same conversation's loaded messages; one that isn't loaded
 * (or a random UUID that happens to match) just shows as a plain message.
 */

const MARKER = "4e9c-a7f1";
const REPLY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4e9c-a7f1-([0-9a-f]{12})$/i;
const MAX_MID = 2 ** 48 - 1;

const randomHex = (length: number): string => {
  const bytes = new Uint8Array(Math.ceil(length / 2));
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, length);
};

/** A requestId that marks the message as a reply to message `mid`. */
export function replyRequestId(
  mid: number,
  random: (length: number) => string = randomHex
): string {
  if (!Number.isSafeInteger(mid) || mid <= 0 || mid > MAX_MID)
    throw new RangeError(`Can't reply to message ${mid}.`);
  const r = random(12);
  return `${r.slice(0, 8)}-${r.slice(8, 12)}-${MARKER}-${mid.toString(16).padStart(12, "0")}`;
}

/** The mid a message replies to, from its requestId; null if it isn't a reply. */
export function replyTarget(requestId: string | undefined): number | null {
  const match = requestId?.match(REPLY_PATTERN);
  if (!match) return null;
  const mid = parseInt(match[1], 16);
  return mid > 0 ? mid : null;
}

/** Find a message's target among the conversation's loaded messages. */
export function findReplyTarget<T extends { mid: number; requestId?: string }>(
  message: T,
  messages: readonly T[],
  usable: (m: T) => boolean = () => true
) {
  const mid = replyTarget(message.requestId);
  // A reply is always to an earlier message
  if (mid === null || mid >= message.mid) return undefined;
  return messages.find((m) => m.mid === mid && usable(m));
}

/**
 * The text without its leading mention of `user` (the quoted author), since
 * the quote already names them. HF turns @name@ into their profile URL; older
 * messages may still have the @name@ text. Unchanged if it doesn't start with
 * one, or if the mention is all there is.
 */
export function withoutLeadingMention(
  text: string,
  user: { uid: number; username?: string },
  origin = location.origin
): string {
  const trimmed = text.trimStart();
  let rest: string | null = null;
  const at = user.username ? `@${user.username}@` : null;
  if (at && trimmed.toLowerCase().startsWith(at.toLowerCase())) {
    rest = trimmed.slice(at.length);
  } else {
    const match = trimmed.match(/^https?:\/\/[^\s<>"']+/i);
    if (match) {
      const { url, trailing } = trimUrl(match[0]);
      if (
        previewKey(url, origin) === `/member.php?action=profile&uid=${user.uid}`
      )
        rest = trailing + trimmed.slice(match[0].length);
    }
  }
  if (rest === null) return text;
  rest = rest.replace(/^[\s,:]+/, "");
  return rest || text;
}

/**
 * The quote above a reply: "@Name: what they said", clickable to jump to it.
 */
export function createReplyQuote(
  target: RenderableMessage & { uid: number },
  author: ChatUser | undefined,
  origin: string,
  onClick: () => void
): HTMLElement {
  const name = author?.username ?? `User ${target.uid}`;
  const quote = el(
    "button",
    {
      type: "button",
      class: "hfx-gc-quote",
      title: `Jump to ${name}'s message`,
    },
    [
      el("span", { class: "hfx-gc-quote-name" }, [
        "@",
        userLabel(author, target.uid),
        ":",
      ]),
      el(
        "span",
        { class: "hfx-gc-quote-text" },
        previewText(target, origin) || "…"
      ),
    ]
  );
  quote.addEventListener("click", onClick);
  return quote;
}

/** Scroll a message's line into view and flash it. */
export function jumpToLine(line: HTMLElement | undefined): void {
  if (!line) return;
  line.scrollIntoView({ block: "center", behavior: "smooth" });
  line.classList.remove("hfx-gc-flash");
  // Restart the animation if it's still running
  void line.offsetWidth;
  line.classList.add("hfx-gc-flash");
  line.addEventListener(
    "animationend",
    () => line.classList.remove("hfx-gc-flash"),
    { once: true }
  );
}

/** A pending reply: the message (mid) and who sent it. */
export interface ReplyTo {
  mid: number;
  uid: number;
  author?: ChatUser;
}

/** "Replying to Name ×" above the compose box while a reply is pending. */
export class ReplyBar {
  readonly root: HTMLElement;
  private readonly label: HTMLElement;
  private target: ReplyTo | null = null;

  constructor() {
    this.label = el("span", { class: "hfx-chat-replying-label" });
    const cancel = el(
      "button",
      {
        type: "button",
        class: "hfx-chat-replying-cancel",
        title: "Cancel reply",
        "aria-label": "Cancel reply",
      },
      "×"
    );
    cancel.addEventListener("click", () => this.clear());
    this.root = el("div", { class: "hfx-chat-replying", hidden: true }, [
      this.label,
      cancel,
    ]);
  }

  /** What's being replied to, if anything. */
  get current(): ReplyTo | null {
    return this.target;
  }

  set(target: ReplyTo): void {
    this.target = target;
    this.label.replaceChildren(
      "Replying to ",
      userLabel(target.author, target.uid)
    );
    this.root.hidden = false;
  }

  clear(): void {
    this.target = null;
    this.root.hidden = true;
  }
}
