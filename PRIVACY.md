# Privacy Policy

_Last updated: October 31, 2026_

HF Convo Anywhere is a browser extension that shows Hack Forums' Convo chat (your direct messages, group chats and the global chat) on every Hack Forums page. This policy explains what data it handles and where that data goes.

**In short: the extension only talks to Hack Forums. The developer receives no data at all.**

## What the extension handles

To work, the extension reads and sends the same data as Hack Forums' own Convo page (convo.php):

- **Your Hack Forums session.** It reads your username, user ID and Hack Forums' post key from the page you have open, and uses your existing Hack Forums login to connect to Convo. It never sees or stores your password.
- **Your messages.** It loads your conversations, group chats and global chat messages from Hack Forums, and sends the messages, images and commands you choose to send back to Hack Forums.
- **Your group list.** It reads your group chats from convo.php once and keeps the list (group IDs and names) so it doesn't have to read it again.

## Where data goes

- **Only to Hack Forums** (`hackforums.net`), over the same connections Hack Forums' own Convo uses (`/convo.php` and its `/convo-ws` connection).
- **Nowhere else.** The extension has no analytics, tracking, ads or servers of its own, and sends nothing to the developer or any third party.
- **Images in messages.** When a message contains an image link (for example a GIF), your browser loads that image from the site it is hosted on, just as it does on convo.php. Convo's own "/embed hide" setting is respected.

## What is stored on your device

All of this stays in your browser and is never uploaded:

- **Extension storage** (`chrome.storage.local`): your settings, which chat windows are open or minimized, group chat activity, and the cached group list.
- **Hack Forums' site storage:** unsent drafts (only for the current tab, in session storage) and your recently used emoji (in local storage).
- **Convo's own settings cookie** (`convoStorage`), which the extension reads and updates the same way convo.php does, so settings like `/embed hide` apply in both places.

You can clear the saved chat windows and group list from the extension's settings page. Removing the extension deletes its extension storage.

## Your data is not sold or shared

The developer does not collect, sell, transfer or share any user data, does not use it for advertising or credit decisions, and does not use it for any purpose other than the extension's single purpose: showing Hack Forums' Convo chat on Hack Forums pages.

## Changes and contact

If this policy changes, the updated version will be published in this repository with a new date. Questions can be asked by opening an issue at <https://github.com/xadamxk/HF-Convo-Anywhere/issues>.

HF Convo Anywhere is not affiliated with or endorsed by Hack Forums.
