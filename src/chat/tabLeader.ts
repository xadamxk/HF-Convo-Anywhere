import { Logger } from "../core/Logger";

/**
 * Picks one tab to lead among the HF tabs that want something (e.g. the
 * Convo socket), so only that tab does it (see #3).
 *
 * - The leader is whichever tab holds a Web Lock named `name`. The others
 *   wait in the browser's queue for it, in order, and the browser releases it
 *   when the leader's tab closes, reloads or navigates away.
 * - Tabs talk over a BroadcastChannel of the same name. A new leader
 *   announces itself with an epoch, so a stale leader's messages can be told
 *   apart; a tab that joins asks who leads.
 * - steal() takes the lead from another tab at once (the active tab taking
 *   over); resign() hands it to the next tab in line.
 */

export const TAB_PROTOCOL_VERSION = 1;

export interface LockManagerLike {
  request(
    name: string,
    options: { signal?: AbortSignal; steal?: boolean },
    callback: (lock: unknown) => Promise<unknown>
  ): Promise<unknown>;
}

export interface ChannelLike {
  onmessage: ((event: { data: unknown }) => void) | null;
  postMessage(message: unknown): void;
  close(): void;
}

export type LeaderRole = "idle" | "follower" | "leader";

/** Who leads: a tab, and the epoch it took the lead in (higher is newer). */
export interface LeaderInfo {
  tabId: string;
  epoch: number;
}

/** A message between tabs. `epoch` is set when the sender led when it sent it. */
export interface TabMessage {
  v: number;
  type: string;
  from: string;
  epoch?: number;
  [key: string]: unknown;
}

export interface TabLeaderEvents {
  /** This tab's role changed. */
  role: (role: LeaderRole) => void;
  /** The leader changed: another tab, this one, or null (it left). */
  leader: (leader: LeaderInfo | null) => void;
  /** A message from another tab, other than the election's own. */
  message: (message: TabMessage) => void;
}

export interface TabLeaderOptions {
  /** The lock and channel name, e.g. `hfca-socket:convo:<uid>`. */
  name: string;
  locks: LockManagerLike;
  createChannel: (name: string) => ChannelLike;
  tabId?: string;
  now?: () => number;
}

// The election's own message types; anything else is passed on
const WHO = "who";
const LEADER = "leader";
const BYE = "bye";

const isNewer = (a: LeaderInfo, b: LeaderInfo) =>
  a.epoch > b.epoch || (a.epoch === b.epoch && a.tabId > b.tabId);

const randomId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export class TabLeader {
  readonly tabId: string;
  role: LeaderRole = "idle";
  /** The leader as far as this tab knows, maybe this tab. */
  leader: LeaderInfo | null = null;

  private readonly name: string;
  private readonly locks: LockManagerLike;
  private readonly createChannel: (name: string) => ChannelLike;
  private readonly now: () => number;
  private readonly listeners = new Map<string, Set<(...args: any[]) => void>>();
  private channel: ChannelLike | null = null;
  /** Takes this tab's waiting lock request out of the queue. */
  private queued: AbortController | null = null;
  /** Lets go of the lock this tab holds. */
  private release: (() => void) | null = null;
  /** Bumped by each lock request and by leave(), so stale outcomes are ignored. */
  private attempt = 0;
  /** The epoch this tab took the lead in, while it leads. */
  private ownEpoch = 0;
  /** The newest epoch seen, kept when a leader leaves. */
  private lastEpoch = 0;

  constructor(options: TabLeaderOptions) {
    this.name = options.name;
    this.locks = options.locks;
    this.createChannel = options.createChannel;
    this.tabId = options.tabId ?? randomId();
    this.now = options.now ?? (() => Date.now());
  }

  on<K extends keyof TabLeaderEvents>(
    event: K,
    listener: TabLeaderEvents[K]
  ): this {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener);
    return this;
  }

  off<K extends keyof TabLeaderEvents>(
    event: K,
    listener: TabLeaderEvents[K]
  ): this {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  get isLeader(): boolean {
    return this.role === "leader";
  }

  /** Start wanting the lead: follow until this tab's turn comes. */
  join(): void {
    if (this.role !== "idle") return;
    this.channel = this.createChannel(this.name);
    this.channel.onmessage = (event) => this.onMessage(event.data);
    this.setRole("follower");
    this.post({ type: WHO });
    this.contend(false);
  }

  /** Stop wanting the lead, letting go of it if this tab has it. */
  leave(): void {
    if (this.role === "idle") return;
    this.attempt++;
    this.queued?.abort();
    this.queued = null;
    if (this.role === "leader") {
      this.letGo();
      this.post({ type: BYE });
    }
    this.channel?.close();
    this.channel = null;
    this.leader = null;
    this.setRole("idle");
  }

  /** Take the lead now, from whichever tab has it. */
  steal(): void {
    if (this.role !== "follower") return;
    this.queued?.abort();
    this.queued = null;
    this.contend(true);
  }

  /** Hand the lead to the next tab in line, and queue behind the others. */
  resign(): void {
    if (this.role !== "leader") return;
    this.letGo();
    this.post({ type: BYE });
    this.leader = null;
    this.setRole("follower");
    this.fire("leader", null);
    this.contend(false);
  }

  /**
   * Send a message to the other tabs. It carries this tab's epoch while it
   * leads, so receivers can check it with isFromLeader().
   */
  post(message: { type: string; [key: string]: unknown }): void {
    if (!this.channel) return;
    const stamped: TabMessage = {
      ...message,
      v: TAB_PROTOCOL_VERSION,
      from: this.tabId,
    };
    if (this.isLeader) stamped.epoch = this.ownEpoch;
    try {
      this.channel.postMessage(stamped);
    } catch (error) {
      Logger.error(`Couldn't message other tabs (${this.name})`, error);
    }
  }

  /** Whether a message came from the current leader, in its current epoch. */
  isFromLeader(message: TabMessage): boolean {
    return (
      this.leader !== null &&
      message.from === this.leader.tabId &&
      message.epoch === this.leader.epoch
    );
  }

  /** Ask for the lock: wait in line, or (`steal`) take it now. */
  private contend(steal: boolean): void {
    const attempt = ++this.attempt;
    const controller = steal ? null : new AbortController();
    this.queued = controller;
    // A steal can't be aborted, but it's granted at once
    const options = controller
      ? { signal: controller.signal }
      : { steal: true };
    this.locks
      .request(this.name, options, (lock) => {
        // Granted after this tab moved on: let it go at once
        if (attempt !== this.attempt || !lock) return Promise.resolve();
        this.queued = null;
        return new Promise<void>((resolve) => {
          this.release = resolve;
          this.becomeLeader();
        });
      })
      .catch((error) => {
        if (attempt !== this.attempt) return;
        // The lock was stolen by another tab: follow, and get back in line
        if (this.role === "leader") {
          this.release = null;
          if (this.leader?.tabId === this.tabId) this.leader = null;
          this.setRole("follower");
          this.contend(false);
          return;
        }
        Logger.error(`Couldn't request the ${this.name} lock`, error);
      });
  }

  private becomeLeader(): void {
    // Epochs come from the clock, so a tab that never heard the last leader
    // still announces a newer one
    const epoch = Math.max(this.now(), this.lastEpoch + 1);
    this.ownEpoch = this.lastEpoch = epoch;
    this.leader = { tabId: this.tabId, epoch };
    this.setRole("leader");
    this.post({ type: LEADER });
    this.fire("leader", this.leader);
  }

  private letGo(): void {
    this.release?.();
    this.release = null;
  }

  private onMessage(data: unknown): void {
    const message = data as TabMessage;
    if (
      !message ||
      typeof message !== "object" ||
      message.v !== TAB_PROTOCOL_VERSION ||
      typeof message.type !== "string" ||
      typeof message.from !== "string" ||
      message.from === this.tabId
    ) {
      return;
    }
    switch (message.type) {
      case WHO:
        if (this.isLeader) this.post({ type: LEADER });
        return;
      case LEADER: {
        if (typeof message.epoch !== "number") return;
        const info = { tabId: message.from, epoch: message.epoch };
        if (this.leader && !isNewer(info, this.leader)) return;
        // A leader that already left (bye) can't come back with its old epoch
        if (!this.leader && info.epoch < this.lastEpoch) return;
        this.lastEpoch = Math.max(this.lastEpoch, info.epoch);
        this.leader = info;
        this.fire("leader", info);
        return;
      }
      case BYE:
        if (this.leader?.tabId !== message.from || this.isLeader) return;
        this.leader = null;
        this.fire("leader", null);
        return;
      default:
        this.fire("message", message);
    }
  }

  private setRole(role: LeaderRole): void {
    if (role === this.role) return;
    this.role = role;
    this.fire("role", role);
  }

  private fire(event: keyof TabLeaderEvents, ...args: unknown[]): void {
    for (const listener of Array.from(this.listeners.get(event) ?? [])) {
      try {
        listener(...args);
      } catch (error) {
        Logger.error(`Tab leader ${event} listener failed`, error);
      }
    }
  }
}
