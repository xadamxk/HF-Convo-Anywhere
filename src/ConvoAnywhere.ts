import { ChatDock, DEFAULT_DOCK_STATE, DockState } from "./chat/ChatDock";
import { ConvoClient, convoSocketUrl } from "./chat/ConvoClient";
import { sharedSocketFactory } from "./chat/SharedSocket";
import { interceptConvoLinks, pageUserHint } from "./chat/convoLinks";
import { fetchGroupList, GroupInfo } from "./chat/groupList";
import { GlobalChatWindow } from "./chat/GlobalChatWindow";
import { RoomReplay } from "./chat/GlobalRoomClient";
import { MessageSound } from "./chat/sound";
import { CHAT_DOCK_CSS } from "./chat/styles";
import { Logger } from "./core/Logger";
import { addCssToPage, getCurrentUser, getUserPostKey } from "./core/Page";
import {
  ConvoSettings,
  DEFAULT_SETTINGS,
  DOCK_STATE_KEY,
  getStorageItem,
  GROUP_LIST_KEY,
  loadSettings,
  setStorageItem,
  watchTheme,
} from "./settings";

export interface GroupListCache {
  groups: GroupInfo[];
}

/**
 * Convo Anywhere: a Messenger-style dock for Convo DMs, group chats and the
 * global chat on every HF page except convo.php, where HF's own client is open.
 */
export class ConvoAnywhere {
  /** The cached group list's pending additions, in order. */
  private groupListWrites: Promise<void> = Promise.resolve();

  /** Read the settings and stored chat state, then show the dock. */
  async start(): Promise<void> {
    if (!this.shouldRun()) return;
    const [settings, dockState, groupList] = await Promise.all([
      loadSettings(),
      getStorageItem<DockState>(DOCK_STATE_KEY),
      getStorageItem<GroupListCache | null>(GROUP_LIST_KEY),
    ]);
    this.run(settings, dockState, groupList);
  }

  /**
   * Whether to show the dock here: not on convo.php, not in frames, once per
   * page, and only when logged in.
   */
  private shouldRun(): boolean {
    if (location.pathname.toLowerCase() === "/convo.php") return false;
    if (window.top !== window) return false;
    if (document.getElementById("hfx-chat-dock")) return false;
    return Boolean(getUserPostKey() && getCurrentUser());
  }

  run(
    settings: ConvoSettings,
    dockState: DockState | undefined,
    groupList: GroupListCache | null | undefined
  ): void {
    const postKey = getUserPostKey();
    if (!postKey || !this.shouldRun()) return;

    addCssToPage(CHAT_DOCK_CSS);
    // One DM socket and one global room socket for all HF tabs (#3); each
    // falls back to one per tab. Only tabs with the global window open want
    // the room's, so the user leaves the room when the last one closes it.
    // The extension's version is in the names: after an update, tabs still
    // running the old version (until they reload) don't share with new ones.
    const uid = getCurrentUser()?.uid;
    const share = settings.sharedConnection !== false && Boolean(uid);
    const socketUrl = convoSocketUrl(location.origin);
    const version = chrome.runtime?.getManifest?.()?.version ?? "dev";
    const createSocket = share
      ? sharedSocketFactory(`hfca-socket:${version}:convo:${uid}`, socketUrl)
      : undefined;
    const createGlobalSocket = share
      ? sharedSocketFactory(
          `hfca-socket:${version}:global:${uid}`,
          socketUrl,
          () => new RoomReplay()
        )
      : undefined;
    const client = new ConvoClient({ postKey, createSocket });
    const sound = settings.sound ? new MessageSound() : undefined;
    const dock = new ChatDock({
      client,
      maxBubbles: Number(settings.maxBubbles) || DEFAULT_SETTINGS.maxBubbles,
      typingIndicators: settings.typingIndicators !== false,
      sound,
      groups:
        settings.groupChats !== false
          ? {
              list: () => this.groupList(groupList),
              // HFX names unlisted groups from its Who's Online Sorting group
              // map; there's no such map here, so they keep the name their
              // messages carry
              mapNames: async () => ({}),
              addToList: (group) => {
                this.addToGroupList(group);
              },
              removeFromList: (gid) => {
                this.removeFromGroupList(gid);
              },
              sound: settings.groupSound === "all" ? "all" : "mentions",
            }
          : undefined,
      createGlobal:
        settings.globalChat !== false
          ? ({ minimized, onClose, onChange, openChat }) =>
              new GlobalChatWindow({
                postKey,
                createSocket: createGlobalSocket,
                minimized,
                openChat,
                typingIndicators: settings.typingIndicators !== false,
                sound,
                hideHelpbot: settings.hideStanley === true,
                onClose,
                onChange,
              })
          : undefined,
      side: settings.side === "left" ? "left" : "right",
      layout: settings.layout === "list" ? "list" : "bubbles",
      theme: settings.theme,
      state: dockState ?? DEFAULT_DOCK_STATE,
      saveState: (state) => {
        setStorageItem(DOCK_STATE_KEY, state).catch((error) =>
          Logger.error(`Couldn't save chat state: ${error?.message}`, error)
        );
      },
      onEnded: (reason) => {
        client.disconnect();
        Logger.error(
          `Convo chat stopped (${reason ?? "unknown reason"}); the dock is hidden until the next page load.`
        );
      },
    });
    dock.mount();
    client.connect();
    // A theme picked on the settings page shows here at once
    watchTheme((theme) => dock.setTheme(theme));
    if (settings.convoLinks !== false) {
      const origin = location.origin;
      interceptConvoLinks(
        (uid) => dock.openChatWithUser(uid, pageUserHint(uid, origin)),
        origin
      );
    }
    // Close the sockets when leaving the page, and reconnect if the browser
    // brings it back from its back/forward cache
    window.addEventListener("pagehide", () => dock.suspend());
    window.addEventListener("pageshow", (event) => {
      if (event.persisted) dock.resume();
    });
    this.watchForOrphaning(() => {
      // Its settings and chat state can't be saved any more, and it would
      // keep holding the shared sockets from the extension's new tabs
      dock.suspend();
      dock.destroy();
      Logger.warn(
        "Convo Anywhere was updated or reloaded; reload this page to use the new version."
      );
    });
  }

  /**
   * Call `onOrphaned` once the extension is reloaded, updated or removed:
   * this page's script keeps running, but cut off from the extension.
   */
  private watchForOrphaning(onOrphaned: () => void): void {
    // Not running as an extension (tests): nothing to watch
    if (!chrome.runtime?.id) return;
    const timer = setInterval(() => {
      if (chrome.runtime?.id) return;
      clearInterval(timer);
      onOrphaned();
    }, 5000);
  }

  /**
   * The user's groups: the cached list, or (only when there's none) the
   * Comrades list read once from convo.php and cached until cleared.
   */
  private async groupList(
    cached: GroupListCache | null | undefined
  ): Promise<GroupInfo[]> {
    if (cached && Array.isArray(cached.groups)) return cached.groups;
    const groups = await fetchGroupList();
    await this.saveGroupList(groups.map(({ gid, name }) => ({ gid, name })));
    return groups;
  }

  /** Add a group found through a message to the cached list. */
  private addToGroupList(group: GroupInfo): Promise<void> {
    return this.changeGroupList((groups) =>
      groups.some((existing) => existing.gid === group.gid)
        ? null
        : [...groups, { gid: group.gid, name: group.name }]
    );
  }

  /** Drop a group the user left (/leave) from the cached list. */
  private removeFromGroupList(gid: number): Promise<void> {
    return this.changeGroupList((groups) =>
      groups.some((group) => group.gid === gid)
        ? groups.filter((group) => group.gid !== gid)
        : null
    );
  }

  /**
   * Change the cached group list (`change` returns null for no change).
   * Changes run one at a time: each reads the list and writes it back, so
   * overlapping ones would undo each other.
   */
  private changeGroupList(
    change: (groups: GroupInfo[]) => GroupInfo[] | null
  ): Promise<void> {
    this.groupListWrites = this.groupListWrites
      .then(async () => {
        const cached = await getStorageItem<GroupListCache | null>(
          GROUP_LIST_KEY
        );
        const groups = change(cached?.groups ?? []);
        if (groups) await this.saveGroupList(groups);
      })
      .catch((error) =>
        Logger.error(`Couldn't update the group list: ${error?.message}`, error)
      );
    return this.groupListWrites;
  }

  private saveGroupList(groups: GroupInfo[]): Promise<void> {
    return setStorageItem(GROUP_LIST_KEY, { groups }).catch((error) =>
      Logger.error(`Couldn't save group list: ${error?.message}`, error)
    );
  }
}
