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
 * - The active tab leads when it can: a tab the user is looking at (visible
 *   and focused for a moment) asks a hidden leader to hand over, and the
 *   leader lets it steal the lock once its work in flight is done. A visible
 *   leader keeps the lead.
 * - The leader sends a heartbeat. When it says goodbye (its page is going),
 *   an active tab takes over at once; when it goes quiet (a frozen or hung
 *   tab), a visible tab takes over soon, a hidden one much later, since
 *   browsers slow hidden tabs' timers.
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

/** Whether the user is looking at this tab. */
export interface TabActivity {
  isVisible(): boolean;
  isFocused(): boolean;
  /** Call `listener` when either changes. Returns an unsubscribe. */
  subscribe(listener: () => void): () => void;
}

/** This page's visibility and focus. */
export const pageActivity: TabActivity = {
  isVisible: () => document.visibilityState === "visible",
  isFocused: () => document.hasFocus(),
  subscribe(listener) {
    document.addEventListener("visibilitychange", listener);
    window.addEventListener("focus", listener);
    window.addEventListener("blur", listener);
    return () => {
      document.removeEventListener("visibilitychange", listener);
      window.removeEventListener("focus", listener);
      window.removeEventListener("blur", listener);
    };
  },
};

/** Timings, in milliseconds. */
export interface LeaderTiming {
  /** How often the leader says it's alive (and whether it's visible). */
  heartbeat: number;
  /** How long a tab is active before it asks a hidden leader for the lead. */
  activateDelay: number;
  /** How long a leader waits for its work in flight before handing over. */
  handoffWait: number;
  /** How long an active tab waits for a handover before taking the lead anyway. */
  handoffTimeout: number;
  /** A visible tab takes the lead after this long without hearing the leader. */
  staleVisible: number;
  /** A hidden tab does after this long (its timers may be slowed to once a minute). */
  staleHidden: number;
}

export const DEFAULT_TIMING: LeaderTiming = {
  heartbeat: 5000,
  activateDelay: 1500,
  handoffWait: 5000,
  handoffTimeout: 6000,
  staleVisible: 15000,
  staleHidden: 5 * 60000,
};

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
  /** Whether the user is looking at this tab; without it, it never asks for the lead. */
  activity?: TabActivity | null;
  /** Resolves when the leader's work in flight is done, before it hands over. */
  whenIdle?: () => Promise<void>;
  timing?: Partial<LeaderTiming>;
  tabId?: string;
  now?: () => number;
  random?: () => number;
}

// The election's own message types; anything else is passed on
const WHO = "who";
const LEADER = "leader";
const BYE = "bye";
const HEARTBEAT = "heartbeat";
const HANDOFF_REQUEST = "handoff-request";
const HANDOFF = "handoff";

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
  /** True while this tab is handing the lead to another (it refuses new work). */
  handingOff = false;

  private readonly name: string;
  private readonly locks: LockManagerLike;
  private readonly createChannel: (name: string) => ChannelLike;
  private readonly activity: TabActivity | null;
  private readonly whenIdle: () => Promise<void>;
  private readonly timing: LeaderTiming;
  private readonly now: () => number;
  private readonly random: () => number;
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
  /** When this tab last heard the leader, and whether it said it was visible. */
  private lastHeard = 0;
  private leaderVisible = true;
  private unsubscribe: (() => void) | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;
  private activeTimer: ReturnType<typeof setTimeout> | null = null;
  private claimTimer: ReturnType<typeof setTimeout> | null = null;
  private handoffTimer: ReturnType<typeof setTimeout> | null = null;
  /** A hidden tab's extra wait before taking over a quiet leader, so they don't all at once. */
  private staleJitter = 0;

  constructor(options: TabLeaderOptions) {
    this.name = options.name;
    this.locks = options.locks;
    this.createChannel = options.createChannel;
    this.activity = options.activity ?? null;
    this.whenIdle = options.whenIdle ?? (() => Promise.resolve());
    this.timing = { ...DEFAULT_TIMING, ...options.timing };
    this.tabId = options.tabId ?? randomId();
    this.now = options.now ?? (() => Date.now());
    this.random = options.random ?? Math.random;
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
    this.lastHeard = this.now();
    this.staleJitter = Math.round(this.random() * 30000);
    this.setRole("follower");
    this.post({ type: WHO });
    this.contend(false);
    if (this.activity) {
      this.unsubscribe = this.activity.subscribe(() => this.onActivity());
      this.watchdogTimer = setInterval(() => this.checkLeader(), 2000);
      this.onActivity();
    }
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
    this.stopTimers();
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.channel?.close();
    this.channel = null;
    this.leader = null;
    this.setRole("idle");
  }

  /** Take the lead now, from whichever tab has it. */
  steal(): void {
    if (this.role !== "follower") return;
    this.clearClaim();
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
          this.stopLeading();
          if (this.leader?.tabId === this.tabId) this.leader = null;
          this.lastHeard = this.now();
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
    this.clearClaim();
    this.clearActive();
    this.setRole("leader");
    this.announce();
    this.fire("leader", this.leader);
    if (this.activity) {
      this.heartbeatTimer = setInterval(
        () => this.post({ type: HEARTBEAT, visible: this.visible() }),
        this.timing.heartbeat
      );
    }
  }

  private announce(): void {
    this.post({ type: LEADER, visible: this.visible() });
  }

  private stopLeading(): void {
    this.handingOff = false;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    if (this.handoffTimer) clearTimeout(this.handoffTimer);
    this.handoffTimer = null;
  }

  private letGo(): void {
    this.release?.();
    this.release = null;
    this.stopLeading();
  }

  private stopTimers(): void {
    this.stopLeading();
    this.clearActive();
    this.clearClaim();
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);
    this.watchdogTimer = null;
  }

  // --- The user looking at this tab ---

  private visible(): boolean {
    return this.activity ? this.activity.isVisible() : true;
  }

  private active(): boolean {
    return (
      this.activity !== null &&
      this.activity.isVisible() &&
      this.activity.isFocused()
    );
  }

  private onActivity(): void {
    if (this.isLeader) {
      // Let the others know at once, so an active tab can ask for the lead
      this.post({ type: HEARTBEAT, visible: this.visible() });
      return;
    }
    if (!this.active()) {
      this.clearActive();
      return;
    }
    if (this.activeTimer) return;
    this.activeTimer = setTimeout(() => {
      this.activeTimer = null;
      this.claim();
    }, this.timing.activateDelay);
  }

  /** This tab has been active a while: ask a hidden leader for the lead. */
  private claim(): void {
    if (this.role !== "follower" || !this.active()) return;
    if (!this.leader || this.leaderVisible || this.claimTimer) return;
    this.post({ type: HANDOFF_REQUEST });
    // A leader that doesn't answer (busy, frozen) is passed over
    this.claimTimer = setTimeout(() => {
      this.claimTimer = null;
      if (this.role === "follower" && this.active() && !this.leaderVisible)
        this.steal();
    }, this.timing.handoffTimeout);
  }

  private clearActive(): void {
    if (this.activeTimer) clearTimeout(this.activeTimer);
    this.activeTimer = null;
  }

  private clearClaim(): void {
    if (this.claimTimer) clearTimeout(this.claimTimer);
    this.claimTimer = null;
  }

  /** Another tab asked for the lead: hand over once work in flight is done. */
  private async onHandoffRequest(from: string): Promise<void> {
    if (!this.isLeader || this.handingOff || this.visible()) return;
    const epoch = this.ownEpoch;
    this.handingOff = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      this.whenIdle().catch(() => undefined),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, this.timing.handoffWait);
      }),
    ]);
    clearTimeout(timer);
    if (!this.isLeader || this.ownEpoch !== epoch) return;
    this.post({ type: HANDOFF, to: from });
    // If it doesn't take the lead after all, carry on
    this.handoffTimer = setTimeout(() => {
      this.handoffTimer = null;
      if (this.isLeader && this.ownEpoch === epoch) this.handingOff = false;
    }, this.timing.handoffTimeout);
  }

  /** A follower's check that the leader is still there. */
  private checkLeader(): void {
    if (this.role !== "follower" || !this.leader) return;
    const quiet = this.now() - this.lastHeard;
    const limit = this.visible()
      ? this.timing.staleVisible
      : this.timing.staleHidden + this.staleJitter;
    if (quiet > limit) {
      Logger.warn(
        `No word from the ${this.name} leader in ${Math.round(quiet / 1000)}s; taking over`
      );
      this.steal();
    }
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
    if (this.isFromLeader(message)) this.lastHeard = this.now();
    switch (message.type) {
      case WHO:
        if (this.isLeader) this.announce();
        return;
      case LEADER: {
        if (typeof message.epoch !== "number") return;
        const info = { tabId: message.from, epoch: message.epoch };
        if (this.leader && !isNewer(info, this.leader)) return;
        // A leader that already left (bye) can't come back with its old epoch
        if (!this.leader && info.epoch < this.lastEpoch) return;
        this.lastEpoch = Math.max(this.lastEpoch, info.epoch);
        this.leader = info;
        this.lastHeard = this.now();
        this.leaderVisible = message.visible !== false;
        this.clearClaim();
        this.fire("leader", info);
        // A hidden leader took over while this tab is active: ask for it
        if (!this.leaderVisible && this.active() && !this.activeTimer)
          this.claim();
        return;
      }
      case HEARTBEAT:
        if (!this.isFromLeader(message)) return;
        this.leaderVisible = message.visible !== false;
        if (!this.leaderVisible && this.active() && !this.activeTimer)
          this.claim();
        return;
      case BYE:
        if (this.leader?.tabId !== message.from || this.isLeader) return;
        this.leader = null;
        this.fire("leader", null);
        // Its page is going: the tab the user is looking at takes over now,
        // rather than whichever is next in line
        if (this.active()) this.steal();
        return;
      case HANDOFF_REQUEST:
        void this.onHandoffRequest(message.from);
        return;
      case HANDOFF:
        if (message.to === this.tabId && this.isFromLeader(message))
          this.steal();
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
