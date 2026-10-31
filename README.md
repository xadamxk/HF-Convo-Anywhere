# HF Convo Anywhere

A Manifest V3 browser extension that lets you chat in Hack Forums' Convo from any page: a Messenger-style dock with your DMs, group chats and the global chat, typing indicators, commands, mentions, emoji, image attachments and message sounds. It is hidden on `convo.php`, where HF's own client is open.

It is a standalone copy of HFX's "Convo Anywhere" feature (`src/features/convo` in [HFX2.0](https://github.com/xadamxk/HFX2.0)). Here it always runs while the extension is installed.

## Development

```bash
npm install
npm run build      # production build to dist/
npm run dev        # development build, rebuilds on change
npm run typecheck
npm test
npm run lint
```

Load `dist/` as an unpacked extension (`chrome://extensions`, Developer mode, "Load unpacked").

## Layout

- `src/content.ts`: content script entry, starts `ConvoAnywhere` on `https://hackforums.net/*`.
- `src/ConvoAnywhere.ts`: wires settings and storage into the chat dock (ported from HFX's `ChatBubbles` feature).
- `src/chat/`, `src/common/`: the chat code, copied from HFX with its tests.
- `src/core/`: the few HFX helpers the chat code needs (DOM building, logging, page fetching, page info).
- `src/settings.ts`: every setting's definition, defaults and storage (`chrome.storage.local`).
- `src/options/`: the settings page (`options_ui`). Settings save as they change and apply on the next HF page load.
- `scripts/make-icons.js`: draws the placeholder icons (`npm run icons`).

The toolbar button has no popup or click action yet.
