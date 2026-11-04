import { DEFAULT_COLORS, themeCss } from "./themes";

const DEFAULT_VARS = Object.entries(DEFAULT_COLORS)
  .map(([name, value]) => `  --hfx-chat-${name}: ${value};`)
  .join("\n");

/** Styles for the chat dock, matched to HF's dark theme and Convo bubbles. */
export const CHAT_DOCK_CSS = `
#hfx-chat-dock {
  /* Gray: the default theme (see themes.ts) */
${DEFAULT_VARS}
  /* Online matches convo.php's inbox dot */
  --hfx-chat-online: rgb(63, 160, 63);
  --hfx-chat-away: #a8923a;
  --hfx-chat-offline: gray;
  /* HF's scrollbar colors; replaced at runtime by mirrorSiteScrollbar */
  --hfx-chat-scroll-thumb: #111;
  --hfx-chat-scroll-track: #222;
  position: fixed;
  right: 16px;
  bottom: 0;
  z-index: 100000;
  display: flex;
  flex-direction: row-reverse;
  align-items: flex-end;
  gap: 10px;
  pointer-events: none;
  font-family: Verdana, Arial, sans-serif;
  font-size: 13px;
  color: var(--hfx-chat-text);
}
#hfx-chat-dock > * { pointer-events: auto; }
/* Left side: mirror the dock (bubbles at the edge, windows growing inward) */
#hfx-chat-dock.hfx-chat-left {
  right: auto;
  left: 16px;
  flex-direction: row;
}
#hfx-chat-dock button { font-family: inherit; }

.hfx-chat-heads {
  display: flex;
  flex-direction: column-reverse;
  align-items: center;
  gap: 10px;
  padding: 6px 6px 16px;
  /* Many groups and DMs: scroll rather than run off the top of the page */
  max-height: calc(100vh - 8px);
  box-sizing: border-box;
  overflow-y: auto;
  scrollbar-width: none;
}
.hfx-chat-heads::-webkit-scrollbar { display: none; }
.hfx-chat-head,
.hfx-chat-launcher {
  position: relative;
  width: 48px;
  height: 48px;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 50%;
  background: var(--hfx-chat-header);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
  cursor: pointer;
}
.hfx-chat-head img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
  display: block;
}
/* An open chat gets an outer ring */
.hfx-chat-head.hfx-chat-head-open {
  box-shadow: 0 0 0 2px #000, 0 0 0 4px var(--hfx-chat-text), 0 2px 8px rgba(0, 0, 0, 0.6);
}
/* Unread count at the bottom right; the status dot has the top right */
.hfx-chat-head .hfx-chat-badge { top: auto; bottom: -4px; right: -4px; }

/* Discord-style status dot, cut out of the avatar by a ring in the surface color */
.hfx-chat-dot {
  --hfx-chat-dot-size: 14px;
  position: absolute;
  top: -1px;
  right: -1px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-width: var(--hfx-chat-dot-size);
  height: var(--hfx-chat-dot-size);
  box-sizing: border-box;
  border-radius: calc(var(--hfx-chat-dot-size) / 2);
  background: var(--hfx-chat-offline);
  box-shadow: 0 0 0 3px var(--hfx-chat-dot-ring, var(--hfx-chat-bg));
  transition: min-width 0.15s ease;
}
.hfx-chat-dot.hfx-chat-presence-online { background: var(--hfx-chat-online); }
.hfx-chat-dot.hfx-chat-presence-away { background: var(--hfx-chat-away); }
/* Typing: the dot stretches into a pill with bouncing dots */
.hfx-chat-dot.hfx-chat-dot-typing {
  min-width: calc(var(--hfx-chat-dot-size) * 2);
  padding: 0 3px;
}
.hfx-chat-dot i {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: #fff;
  animation: hfx-chat-typing 1.2s infinite ease-in-out;
}
.hfx-chat-dot i:nth-child(2) { animation-delay: 0.15s; }
.hfx-chat-dot i:nth-child(3) { animation-delay: 0.3s; }
@keyframes hfx-chat-typing {
  0%, 60%, 100% { opacity: 0.4; transform: translateY(0); }
  30% { opacity: 1; transform: translateY(-1px); }
}
/* List layout: a Messenger-style "Chats" panel docked at the bottom edge */
.hfx-chat-list {
  width: 300px;
  display: flex;
  flex-direction: column;
  background: var(--hfx-chat-bg);
  border: 1px solid var(--hfx-chat-border);
  border-bottom: none;
  border-radius: 8px 8px 0 0;
  box-shadow: 0 0 12px rgba(0, 0, 0, 0.7);
  overflow: hidden;
}
.hfx-chat-list-header {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  border: none;
  border-bottom: 1px solid var(--hfx-chat-border);
  background: var(--hfx-chat-header);
  color: var(--hfx-chat-strong);
  --hfx-chat-muted: var(--hfx-chat-header-muted);
  font-size: 14px;
  font-weight: bold;
  text-align: left;
  cursor: pointer;
}
.hfx-chat-list-header:hover { filter: brightness(1.15); }
.hfx-chat-list-header svg { width: 20px; height: 20px; flex: none; }
.hfx-chat-list-title { flex: 1; }
.hfx-chat-list-header .hfx-chat-badge { position: static; }
.hfx-chat-list-chevron { color: var(--hfx-chat-muted); font-size: 12px; }
.hfx-chat-list-rows {
  list-style: none;
  margin: 0;
  padding: 4px 0;
  max-height: min(60vh, 520px);
  overflow-y: auto;
  overscroll-behavior: contain;
}
.hfx-chat-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 7px 12px;
  border: none;
  background: transparent;
  color: var(--hfx-chat-text);
  text-align: left;
  cursor: pointer;
}
.hfx-chat-row:hover { background: rgba(var(--hfx-chat-tint), 0.06); }
.hfx-chat-row.hfx-chat-row-open { background: rgba(var(--hfx-chat-tint), 0.1); }
.hfx-chat-row-avatar {
  position: relative;
  flex: none;
  width: 40px;
  height: 40px;
}
.hfx-chat-row-avatar .hfx-chat-dot {
  --hfx-chat-dot-size: 12px;
  --hfx-chat-dot-ring: var(--hfx-chat-bg);
  top: -1px;
  right: -1px;
}
/* The row's wash over the panel, so the dot's cut-out matches it */
.hfx-chat-row:hover .hfx-chat-dot {
  --hfx-chat-dot-ring: color-mix(in srgb, var(--hfx-chat-bg), rgb(var(--hfx-chat-tint)) 6%);
}
.hfx-chat-row.hfx-chat-row-open .hfx-chat-dot {
  --hfx-chat-dot-ring: color-mix(in srgb, var(--hfx-chat-bg), rgb(var(--hfx-chat-tint)) 10%);
}
.hfx-chat-row-avatar img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
  display: block;
}
.hfx-chat-row-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.hfx-chat-row-top { display: flex; align-items: baseline; gap: 6px; }
.hfx-chat-row-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--hfx-chat-strong);
}
.hfx-chat-row-time { flex: none; color: var(--hfx-chat-muted); font-size: 11px; }
.hfx-chat-row-preview {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--hfx-chat-muted);
  font-size: 12px;
}
.hfx-chat-row-unread .hfx-chat-row-name,
.hfx-chat-row-unread .hfx-chat-row-preview { font-weight: bold; color: var(--hfx-chat-strong); }
.hfx-chat-row-unread .hfx-chat-row-time { color: var(--hfx-chat-text); }
.hfx-chat-row-badge { position: static; flex: none; }

/* Archive (×) on a DM's bubble or row, shown while it's hovered or focused */
.hfx-chat-head-wrap,
.hfx-chat-row-item { position: relative; }
.hfx-chat-archive {
  position: absolute;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 1px solid var(--hfx-chat-border);
  border-radius: 50%;
  background: var(--hfx-chat-header);
  color: var(--hfx-chat-text);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.1s ease;
}
.hfx-chat-head-wrap:hover .hfx-chat-archive,
.hfx-chat-row-item:hover .hfx-chat-archive,
.hfx-chat-archive:focus-visible,
.hfx-chat-archive:disabled {
  opacity: 1;
  pointer-events: auto;
}
.hfx-chat-archive:hover { background: var(--hfx-chat-badge); color: var(--hfx-chat-on-badge); }
.hfx-chat-archive:disabled { cursor: progress; opacity: 0.6; }
/* Top left of a bubble: the status dot and badge have the right side */
.hfx-chat-head-wrap .hfx-chat-archive { top: -4px; left: -4px; }
/* Right of a row, in place of its unread badge while hovered */
.hfx-chat-row-item .hfx-chat-archive { top: 50%; right: 12px; transform: translateY(-50%); }
.hfx-chat-row-item:hover .hfx-chat-row-badge { visibility: hidden; }
@media (prefers-reduced-motion: reduce) {
  .hfx-chat-archive { transition: none; }
}

/* Global chat: pinned entries */
.hfx-chat-head-global {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--hfx-chat-text);
}
.hfx-chat-head-global svg { width: 26px; height: 26px; }
.hfx-chat-row-globe {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--hfx-chat-header);
  color: var(--hfx-chat-text);
}
.hfx-chat-row-globe svg { width: 22px; height: 22px; }

/* Group convos: a rounded square tells a group from a person (circle) */
.hfx-chat-head.hfx-chat-head-group {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  /* Dark, like HF's own pages, so the group's colors show */
  background: var(--hfx-chat-header);
  border-color: var(--hfx-chat-border);
  color: var(--hfx-chat-strong);
}
.hfx-chat-group-initials { font-size: 15px; font-weight: bold; letter-spacing: 0.5px; }
/* The initials wear the group's HF style (class groupN); keep its size and spacing ours */
#hfx-chat-dock .hfx-chat-group-initials > span {
  font-size: inherit !important;
  line-height: 1 !important;
  letter-spacing: inherit !important;
  padding: 0 !important;
}
/* The Groups bubble: one entry for all group chats, expanded on click */
.hfx-chat-groups-toggle svg { width: 24px; height: 24px; }
.hfx-chat-head.hfx-chat-groups-toggle {
  background: var(--hfx-chat-accent);
  border-color: transparent;
  color: var(--hfx-chat-on-accent);
}
.hfx-chat-head.hfx-chat-groups-toggle.hfx-chat-groups-expanded {
  background: var(--hfx-chat-header);
  border-color: var(--hfx-chat-accent);
  color: var(--hfx-chat-text);
}
.hfx-chat-row-group-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  border: 1px solid var(--hfx-chat-border);
  border-radius: 11px;
  background: var(--hfx-chat-header);
  color: var(--hfx-chat-strong);
}
.hfx-chat-row-group-icon .hfx-chat-group-initials { font-size: 13px; }
/* HF's group name styles come from its own stylesheet; keep them row-sized */
#hfx-chat-dock .hfx-chat-row-name > span[class^="group"] {
  font-size: inherit !important;
  line-height: inherit !important;
  letter-spacing: normal !important;
}
.hfx-chat-filters {
  display: flex;
  gap: 6px;
  padding: 6px 12px 2px;
}
.hfx-chat-filter {
  padding: 2px 10px;
  border: 1px solid var(--hfx-chat-outline);
  border-radius: 10px;
  background: transparent;
  color: var(--hfx-chat-text);
  font-size: 11px;
  cursor: pointer;
}
.hfx-chat-filter:hover { background: rgba(var(--hfx-chat-tint), 0.08); }
.hfx-chat-filter.hfx-chat-filter-on {
  background: var(--hfx-chat-mine);
  border-color: var(--hfx-chat-mine);
  color: var(--hfx-chat-on-mine);
}
.hfx-gc-group-window .hfx-gc-icon {
  padding: 3px;
  border-radius: 7px;
  background: var(--hfx-chat-accent);
  color: var(--hfx-chat-on-accent);
}
.hfx-gc-group-window .hfx-gc-icon svg { width: 18px; height: 18px; }

/* Global chat window: Discord-style groups */
.hfx-gc-window { width: 340px; }
.hfx-gc-icon { display: flex; flex: none; color: var(--hfx-chat-text); }
.hfx-gc-icon svg { width: 22px; height: 22px; }
.hfx-gc-online-toggle {
  flex: none;
  padding: 1px 8px;
  border: 1px solid var(--hfx-chat-outline);
  border-radius: 10px;
  background: transparent;
  color: var(--hfx-chat-text);
  font-size: 11px;
  cursor: pointer;
}
.hfx-gc-online-toggle:hover,
.hfx-gc-online-toggle[aria-expanded="true"] { background: rgba(var(--hfx-chat-tint), 0.1); color: var(--hfx-chat-strong); }
.hfx-gc-body {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
/* Both classes, so this beats .hfx-chat-messages' side padding: each group
   already has 10px on each side */
.hfx-chat-messages.hfx-gc-messages { gap: 0; padding: 6px 0; }
.hfx-gc-group {
  display: flex;
  gap: 8px;
  padding: 4px 10px;
}
.hfx-gc-group + .hfx-gc-group { margin-top: 6px; }
/* Above the line highlights, which reach under the avatar column; isolated so
   it stays below the people panel */
.hfx-gc-messages { isolation: isolate; }
.hfx-gc-avatar { flex: none; width: 32px; height: 32px; position: relative; z-index: 1; }
.hfx-gc-avatar img { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; display: block; }
.hfx-gc-content { flex: 1; min-width: 0; }
.hfx-gc-meta { display: flex; align-items: baseline; gap: 6px; min-width: 0; }
.hfx-gc-name {
  min-width: 0;
  padding: 0;
  border: none;
  background: none;
  color: var(--hfx-chat-strong);
  font: bold 12px Verdana, Arial, sans-serif;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hfx-gc-name:hover span { text-decoration: underline; }
/* HF's username styles (class="groupN") come from its own stylesheet; keep their size in check */
#hfx-chat-dock .hfx-gc-name > span,
#hfx-chat-dock .hfx-gc-user > span {
  font-size: 12px !important;
  line-height: 1.3 !important;
  letter-spacing: normal !important;
}
.hfx-gc-time { flex: none; color: var(--hfx-chat-muted); font-size: 11px; }
.hfx-gc-line {
  margin: 0 -10px 0 -50px;
  padding: 1px 10px 1px 50px;
  line-height: 1.4;
  word-break: break-word;
}
.hfx-gc-line:hover { background: rgba(var(--hfx-chat-tint), 0.04); }
/* Reply (mention the sender), in the space left of the text, shown on hover */
.hfx-gc-line { position: relative; }
.hfx-gc-reply {
  position: absolute;
  top: 0;
  left: 24px;
  z-index: 2;
  display: block;
  opacity: 0;
  width: 22px;
  height: 20px;
  padding: 2px 3px;
  border: none;
  border-radius: 4px;
  background: var(--hfx-chat-popup);
  color: var(--hfx-chat-muted);
  cursor: pointer;
}
/* Faded out, not removed, so keyboard users can tab to it */
.hfx-gc-line:hover > .hfx-gc-reply,
.hfx-gc-reply:focus-visible { opacity: 1; }
.hfx-gc-reply:hover {
  background: color-mix(in srgb, var(--hfx-chat-popup), rgb(var(--hfx-chat-tint)) 8%);
  color: var(--hfx-chat-strong);
}
.hfx-gc-reply svg { display: block; width: 16px; height: 16px; }
/* A quoted reply's quote, above its text (extension users only; see replies.ts) */
.hfx-gc-quote {
  display: flex;
  align-items: baseline;
  gap: 4px;
  max-width: 100%;
  box-sizing: border-box;
  margin: 2px 0 1px;
  padding: 1px 6px;
  border: none;
  border-left: 3px solid var(--hfx-chat-outline);
  border-radius: 3px;
  background: rgba(var(--hfx-chat-tint), 0.05);
  color: var(--hfx-chat-muted);
  font: 11px Verdana, Arial, sans-serif;
  line-height: 1.4;
  text-align: left;
  cursor: pointer;
}
.hfx-gc-quote:hover { background: rgba(var(--hfx-chat-tint), 0.1); color: var(--hfx-chat-text); }
.hfx-gc-quote-name { flex: none; font-weight: bold; color: var(--hfx-chat-strong); }
#hfx-chat-dock .hfx-gc-quote-name > span {
  font-size: 11px !important;
  line-height: inherit !important;
  letter-spacing: normal !important;
}
.hfx-gc-quote-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* The quoted message, jumped to */
@keyframes hfx-gc-flash {
  from { background: rgba(var(--hfx-chat-tint), 0.18); }
  to { background: transparent; }
}
.hfx-gc-line.hfx-gc-flash { animation: hfx-gc-flash 1.6s ease-out; }
/* "Replying to Name ×" above the compose box */
.hfx-chat-replying {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 8px 2px;
  padding: 3px 4px 3px 8px;
  border-left: 3px solid var(--hfx-chat-accent);
  border-radius: 4px;
  background: var(--hfx-chat-popup);
  color: var(--hfx-chat-muted);
  font-size: 11px;
}
.hfx-chat-replying[hidden] { display: none; }
.hfx-chat-replying-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#hfx-chat-dock .hfx-chat-replying-label > span {
  font-size: 11px !important;
  line-height: inherit !important;
  letter-spacing: normal !important;
}
.hfx-chat-replying-cancel {
  flex: none;
  padding: 0 4px;
  border: 0;
  background: none;
  color: var(--hfx-chat-muted);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
}
.hfx-chat-replying-cancel:hover { color: var(--hfx-chat-text); }
.hfx-gc-line a { color: var(--hfx-chat-link); text-decoration: underline; }
/* Font Awesome link icons in Helpbot notices, like HF draws them */
.hfx-chat-icon { margin-left: 3px; font-size: 10px; color: var(--hfx-chat-notice-icon); vertical-align: super; }
.hfx-gc-line img { max-width: 100%; height: auto; border-radius: 6px; display: block; margin: 2px 0; }
/* A command's outcome under its message (/flip, /jackpot, /price), as convo.php adds it */
.hfx-chat-result {
  width: fit-content;
  max-width: 100%;
  box-sizing: border-box;
  margin: 3px 0 2px;
  padding: 3px 8px;
  border-left: 3px solid var(--hfx-chat-outline);
  border-radius: 4px;
  background: rgba(var(--hfx-chat-tint), 0.05);
  color: var(--hfx-chat-text);
  font-size: 12px;
  line-height: 1.5;
}
.hfx-chat-result-win { border-left-color: var(--hfx-chat-notice-icon); }
.hfx-chat-result-loss { border-left-color: var(--hfx-chat-error); }
.hfx-chat-result-label { margin-right: 4px; color: var(--hfx-chat-muted); }
.hfx-chat-result-title { font-weight: 600; color: var(--hfx-chat-strong); }
/* An image link shown as an image above its message, as convo.php does */
/*
 * Fixed height, so a message list never grows when one loads (and stays at
 * the bottom); the width follows the image, up to the line.
 */
.hfx-chat-embed { display: block; width: fit-content; max-width: 100%; text-decoration: none; }
.hfx-gc-line .hfx-chat-embed img { width: auto; height: 160px; object-fit: contain; }
/* Only the text column (from just left of the text), not under the avatar */
.hfx-gc-line.hfx-gc-mention {
  background:
    linear-gradient(var(--hfx-chat-mention-bar), var(--hfx-chat-mention-bar)) 44px 0 / 3px 100% no-repeat,
    linear-gradient(var(--hfx-chat-mention-bg), var(--hfx-chat-mention-bg)) 44px 0 /
      calc(100% - 44px) 100% no-repeat;
}
.hfx-gc-pending {
  margin: 4px 10px 0 50px;
  color: var(--hfx-chat-muted);
  font-style: italic;
  word-break: break-word;
}
/* Who's here: covers the messages */
.hfx-gc-online {
  position: absolute;
  inset: 0;
  overflow-y: auto;
  padding: 4px 0 8px;
  background: var(--hfx-chat-bg);
}
.hfx-gc-online-back {
  display: block;
  width: 100%;
  padding: 6px 12px;
  border: none;
  border-bottom: 1px solid var(--hfx-chat-border);
  background: none;
  color: var(--hfx-chat-strong);
  font: bold 12px Verdana, Arial, sans-serif;
  text-align: left;
  cursor: pointer;
}
.hfx-gc-rank {
  padding: 8px 12px 2px;
  color: var(--hfx-chat-muted);
  font-size: 11px;
}
.hfx-gc-user {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 4px 12px;
  border: none;
  background: none;
  color: var(--hfx-chat-text);
  text-align: left;
  cursor: pointer;
}
.hfx-gc-user:hover { background: rgba(var(--hfx-chat-tint), 0.06); }
.hfx-gc-user img { width: 24px; height: 24px; border-radius: 50%; object-fit: cover; flex: none; }

@media (prefers-reduced-motion: reduce) {
  .hfx-chat-dot { transition: none; }
  .hfx-chat-dot i { animation: none; opacity: 0.9; }
}
.hfx-chat-head:hover,
.hfx-chat-launcher:hover { filter: brightness(1.15); }
.hfx-chat-launcher { color: var(--hfx-chat-text); }
.hfx-chat-launcher svg { width: 24px; height: 24px; vertical-align: middle; }
.hfx-chat-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  box-sizing: border-box;
  border-radius: 9px;
  background: var(--hfx-chat-badge);
  color: var(--hfx-chat-on-badge);
  font-size: 11px;
  font-weight: bold;
  line-height: 18px;
  text-align: center;
}

/* Dragging an image over a chat window */
.hfx-chat-window.hfx-chat-dropping::after {
  content: "Drop image to upload";
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px dashed var(--hfx-chat-text);
  border-radius: 8px 8px 0 0;
  background: color-mix(in srgb, var(--hfx-chat-bg) 88%, transparent);
  color: var(--hfx-chat-strong);
  font-weight: bold;
  pointer-events: none;
}
.hfx-chat-window {
  position: relative;
  width: 320px;
  height: 440px;
  max-height: calc(100vh - 80px);
  display: flex;
  flex-direction: column;
  background: var(--hfx-chat-bg);
  border: 1px solid var(--hfx-chat-border);
  border-bottom: none;
  border-radius: 8px 8px 0 0;
  box-shadow: 0 0 12px rgba(0, 0, 0, 0.7);
  overflow: hidden;
}
.hfx-chat-window.hfx-chat-minimized { height: auto; }
.hfx-chat-window.hfx-chat-minimized > :not(.hfx-chat-header) { display: none; }
.hfx-chat-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 6px 6px 10px;
  background: var(--hfx-chat-header);
  --hfx-chat-muted: var(--hfx-chat-header-muted);
  border-bottom: 1px solid var(--hfx-chat-border);
  cursor: pointer;
  user-select: none;
}
.hfx-chat-header.hfx-chat-unread {
  /* Its text in the theme's color for text on the accent */
  --hfx-chat-strong: var(--hfx-chat-on-accent);
  --hfx-chat-text: var(--hfx-chat-on-accent);
  --hfx-chat-muted: color-mix(in srgb, var(--hfx-chat-on-accent) 75%, var(--hfx-chat-accent));
  background: var(--hfx-chat-accent);
}
.hfx-chat-header img {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  object-fit: cover;
  flex: none;
}
/* A DM window's avatar with the other person's status dot, ringed in the header's color */
.hfx-chat-header-avatar {
  position: relative;
  flex: none;
  display: flex;
}
.hfx-chat-header-avatar .hfx-chat-dot {
  --hfx-chat-dot-size: 10px;
  --hfx-chat-dot-ring: var(--hfx-chat-header);
  top: -2px;
  right: -2px;
  box-shadow: 0 0 0 2px var(--hfx-chat-dot-ring);
}
.hfx-chat-header.hfx-chat-unread .hfx-chat-dot { --hfx-chat-dot-ring: var(--hfx-chat-accent); }
.hfx-chat-header-avatar .hfx-chat-dot i { width: 2px; height: 2px; }
.hfx-chat-title {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.hfx-chat-title a {
  /* Only the name is a link, not the empty header beside it */
  align-self: flex-start;
  max-width: 100%;
  color: var(--hfx-chat-strong);
  font-weight: bold;
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hfx-chat-title a:hover { text-decoration: underline; }
.hfx-chat-status { color: var(--hfx-chat-muted); font-size: 11px; }
.hfx-chat-status:empty { display: none; }
.hfx-chat-action {
  flex: none;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--hfx-chat-text);
  font-size: 16px;
  line-height: 26px;
  text-align: center;
  text-decoration: none;
  cursor: pointer;
}
.hfx-chat-action:hover { background: rgba(var(--hfx-chat-tint), 0.1); color: var(--hfx-chat-strong); }
/* The Open in Convo link: over HF's own link colors */
#hfx-chat-dock a.hfx-chat-action { color: var(--hfx-chat-text); }
#hfx-chat-dock a.hfx-chat-action:hover { color: var(--hfx-chat-strong); }

.hfx-chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overscroll-behavior: contain;
}
/* Above the first message that came while you weren't looking */
.hfx-chat-unread-divider {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 4px 0;
  color: var(--hfx-chat-new-text);
  font-size: 10px;
  font-weight: bold;
  text-transform: uppercase;
}
.hfx-chat-unread-divider::before,
.hfx-chat-unread-divider::after {
  content: "";
  flex: 1;
  border-top: 1px solid var(--hfx-chat-new-line);
}
/* Shown when messages come while you're scrolled up; stays at the bottom of the view */
.hfx-chat-jump {
  position: sticky;
  bottom: 0;
  align-self: center;
  flex: none;
  padding: 3px 10px;
  border: 0;
  border-radius: 10px;
  background: var(--hfx-chat-accent);
  color: var(--hfx-chat-on-accent);
  font-size: 11px;
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
}
.hfx-chat-jump[hidden] { display: none; }
.hfx-chat-older {
  align-self: center;
  margin: 2px 0 8px;
  padding: 2px 10px;
  border: 1px solid var(--hfx-chat-border);
  border-radius: 10px;
  background: transparent;
  color: var(--hfx-chat-muted);
  font-size: 11px;
  cursor: pointer;
}
.hfx-chat-older:disabled { cursor: default; opacity: 0.7; }
.hfx-chat-notice {
  align-self: center;
  color: var(--hfx-chat-muted);
  font-size: 11px;
  padding: 4px 0;
  text-align: center;
}
/* A command's answer (/help, /stats…): only you see it, until dismissed */
.hfx-chat-notice.hfx-chat-reply {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0 8px 4px;
  padding: 6px 4px 6px 8px;
  max-height: 160px;
  overflow-y: auto;
  border-radius: 6px;
  background: var(--hfx-chat-popup);
  color: var(--hfx-chat-text);
  text-align: left;
}
.hfx-chat-notice.hfx-chat-reply[hidden] { display: none; }
.hfx-chat-reply-text {
  flex: 1;
  min-width: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.hfx-chat-reply-close {
  flex: none;
  padding: 0 4px;
  border: 0;
  background: none;
  color: var(--hfx-chat-muted);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
}
.hfx-chat-reply-close:hover { color: var(--hfx-chat-text); }
/* HF links shown by their label (mentions, threads): the name in its group style */
#hfx-chat-dock a.hfx-chat-preview { text-decoration: none; }
#hfx-chat-dock .hfx-chat-preview strong {
  font-size: inherit !important;
  line-height: inherit !important;
  letter-spacing: normal !important;
}
/* A DM send that wasn't confirmed: its text, then the reason with Retry and Discard */
.hfx-gc-pending.hfx-chat-failed { color: var(--hfx-chat-error); font-style: normal; }
.hfx-chat-msg-error {
  margin: 2px 10px 0 50px;
  color: var(--hfx-chat-error);
  font-size: 11px;
}
.hfx-chat-msg-error button {
  margin-left: 6px;
  padding: 0;
  border: none;
  background: none;
  color: var(--hfx-chat-text);
  font-size: 11px;
  text-decoration: underline;
  cursor: pointer;
}
.hfx-chat-typing {
  padding: 0 12px 4px;
  color: var(--hfx-chat-muted);
  font-size: 11px;
  font-style: italic;
}
.hfx-chat-typing:empty { display: none; }
.hfx-chat-compose {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  border-top: 1px solid var(--hfx-chat-border);
  padding: 6px;
}
/* The + before the input: pick an image to upload */
.hfx-chat-attach,
.hfx-chat-emoji {
  flex: none;
  width: 32px;
  height: 32px;
  padding: 7px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--hfx-chat-text);
  cursor: pointer;
}
.hfx-chat-attach svg,
.hfx-chat-emoji svg { display: block; width: 18px; height: 18px; }
.hfx-chat-attach:hover,
.hfx-chat-emoji:hover { background: rgba(var(--hfx-chat-tint), 0.1); color: var(--hfx-chat-strong); }
.hfx-chat-attach:focus-visible,
.hfx-chat-emoji:focus-visible { outline: 1px solid var(--hfx-chat-outline); }
.hfx-chat-emoji[aria-expanded="true"] { background: rgba(var(--hfx-chat-tint), 0.1); color: var(--hfx-chat-strong); }
/* Emoji, just above the compose box on the right */
.hfx-chat-emoji-panel {
  position: absolute;
  bottom: 100%;
  right: 6px;
  z-index: 3;
  width: 252px;
  max-height: 220px;
  overflow-y: auto;
  padding: 4px 6px 6px;
  box-sizing: border-box;
  border: 1px solid var(--hfx-chat-border);
  border-radius: 6px;
  background: var(--hfx-chat-popup);
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.5);
}
.hfx-chat-emoji-panel[hidden] { display: none; }
.hfx-chat-emoji-label {
  padding: 4px 2px 2px;
  color: var(--hfx-chat-muted);
  font-size: 10px;
  font-weight: bold;
  text-transform: uppercase;
}
.hfx-chat-emoji-grid { display: grid; grid-template-columns: repeat(8, 1fr); }
.hfx-chat-emoji-option {
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: none;
  font-size: 18px;
  line-height: 28px;
  cursor: pointer;
}
.hfx-chat-emoji-option:hover,
.hfx-chat-emoji-option:focus-visible { background: rgba(var(--hfx-chat-tint), 0.12); outline: none; }
/*
 * One 16px line between 7px paddings and the border fills the 32px box, so the
 * text sits in the middle. HF styles every textarea (custom_v4.css sets
 * line-height 1.4; the profile page's a_p_4.css forces padding, font size and
 * background with !important), so these are !important to keep it centred.
 */
.hfx-chat-compose textarea {
  flex: 1;
  height: 32px;
  max-height: 110px;
  min-height: 32px;
  box-sizing: border-box;
  margin: 0;
  padding: 7px 10px !important;
  border: 1px solid var(--hfx-chat-input-border);
  border-radius: 16px !important;
  background: var(--hfx-chat-input) !important;
  color: var(--hfx-chat-input-text) !important;
  font: 13px/16px Arial, sans-serif !important;
  resize: none;
  outline: none;
}
.hfx-chat-compose textarea:focus { border-color: var(--hfx-chat-outline); }
/* Members offered while typing an @mention, just above the compose box */
.hfx-chat-compose { position: relative; }
.hfx-gc-mentions {
  position: absolute;
  bottom: 100%;
  left: 6px;
  right: 6px;
  z-index: 2;
  max-height: 200px;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 4px 0;
  border: 1px solid var(--hfx-chat-border);
  border-radius: 6px;
  background: var(--hfx-chat-popup);
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.5);
}
.hfx-gc-mentions .hfx-gc-user { box-sizing: border-box; }
/* Every scrolling area: thin, in HF's scrollbar colors */
#hfx-chat-dock .hfx-chat-messages,
#hfx-chat-dock .hfx-chat-list-rows,
#hfx-chat-dock .hfx-gc-online,
#hfx-chat-dock .hfx-gc-mentions,
#hfx-chat-dock .hfx-chat-emoji-panel,
#hfx-chat-dock .hfx-chat-compose textarea {
  scrollbar-width: thin;
  /* A theme's own colors, if it has them */
  scrollbar-color: var(--hfx-chat-theme-scroll-thumb, var(--hfx-chat-scroll-thumb))
    var(--hfx-chat-theme-scroll-track, var(--hfx-chat-scroll-track));
}
.hfx-gc-mentions .hfx-gc-mention-active { background: rgba(var(--hfx-chat-tint), 0.12); }
/* Commands offered after typing / at the start of a message */
.hfx-gc-command {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 4px 12px;
  color: var(--hfx-chat-text);
  cursor: pointer;
}
.hfx-gc-command:hover { background: rgba(var(--hfx-chat-tint), 0.06); }
.hfx-gc-command-usage { font-weight: bold; }
.hfx-gc-command-about { color: var(--hfx-chat-muted); font-size: 11px; }
${themeCss()}
/* Chat images open in the image viewer */
.hfx-gc-line img.hfx-chat-upload,
.hfx-gc-line .hfx-chat-embed img { cursor: zoom-in; }
/* The image viewer: a chat image as large as fits, over the whole page */
.hfx-image-viewer {
  position: fixed;
  inset: 0;
  z-index: 100001;
  display: flex;
  flex-direction: column;
  background: rgba(0, 0, 0, 0.88);
  color: #e6e6e6;
  font: 13px Verdana, Arial, sans-serif;
}
.hfx-image-viewer-bar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  background: rgba(24, 24, 24, 0.92);
  border-bottom: 1px solid #3c3c3c;
}
.hfx-image-viewer-caption {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: bold;
}
.hfx-image-viewer-actions { display: flex; align-items: center; gap: 8px; }
.hfx-image-viewer-button {
  display: inline-flex;
  align-items: center;
  height: 30px;
  padding: 0 14px;
  border: 1px solid #4a4a4a;
  border-radius: 15px;
  background: #2d2d2d;
  color: #e6e6e6 !important;
  font: inherit;
  text-decoration: none !important;
  cursor: pointer;
}
.hfx-image-viewer-button:hover,
.hfx-image-viewer-button:focus-visible { background: #3a3a3a; }
.hfx-image-viewer-close { justify-content: center; width: 30px; padding: 0; font-size: 20px; line-height: 1; }
/* Centred while it fits; scrolls from the top left at actual size */
.hfx-image-viewer-stage {
  flex: 1;
  min-height: 0;
  display: flex;
  padding: 16px;
  overflow: auto;
  overscroll-behavior: contain;
}
.hfx-image-viewer-img {
  margin: auto;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 6px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.6);
}
.hfx-image-viewer-zoomable .hfx-image-viewer-img { cursor: zoom-in; }
.hfx-image-viewer-actual .hfx-image-viewer-img { max-width: none; max-height: none; cursor: zoom-out; }
`;
