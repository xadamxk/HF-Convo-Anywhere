import { ChatDock, DEFAULT_DOCK_STATE, DockState } from "./chat/ChatDock";
import { ConvoClient } from "./chat/ConvoClient";
import { interceptConvoLinks, pageUserHint } from "./chat/convoLinks";
import { fetchGroupList, GroupInfo } from "./chat/groupList";
import { GlobalChatWindow } from "./chat/GlobalChatWindow";
import { MessageSound } from "./chat/sound";
import { CHAT_DOCK_CSS } from "./chat/styles";
import { Logger } from "./core/Logger";
import { addCssToPage, getCurrentUser, getUserPostKey } from "./core/Page";
import {
  ConvoSettings,
  DOCK_STATE_KEY,
  getStorageItem,
  GROUP_LIST_KEY,
  loadSettings,
  setStorageItem,
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
    const client = new ConvoClient({ postKey });
    const sound = settings.sound ? new MessageSound() : undefined;
    const dock = new ChatDock({
      client,
      maxBubbles: Number(settings.maxBubbles) || 5,
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
