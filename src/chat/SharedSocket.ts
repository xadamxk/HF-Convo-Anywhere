import { Logger } from "../core/Logger";
import {
  ConvoSocket,
  CreateConvoSocket,
  SocketIOClient,
} from "./SocketIOClient";
import {
  ChannelLike,
  LeaderInfo,
  LockManagerLike,
  TabLeader,
  TabMessage,
} from "./tabLeader";

/**
 * One Convo socket shared by every HF tab (see #3). Each tab's client gets a
 * SharedSocket, which works like its own socket:
 *
 * - The leading tab (see TabLeader) owns the real socket. It fires the
 *   socket's events in its own tab and passes them on to the other tabs, and
 *   runs their emits and acked emits, sending the acks back.
 * - The other tabs fire the events passed on, and send their emits to it.
 *
 * A tab that joins late is told whether the socket is connected and given
 * the connection's convo_ready, so its client starts as usual. Only the
 * first convo_join of a connection reaches the server; the rest get its ack.
 * When the leader changes, tabs see a disconnect and then a connect, as if
 * the socket reconnected.
 */

/** A real socket the leader can own: a ConvoSocket that reports every event. */
export interface RelaySocket extends ConvoSocket {
  onAny(handler: (event: string, ...args: any[]) => void): this;
}

/**
 * Fired with convo_loadmessages' data whenever any tab loads a chat: the
 * server scopes typing notices to the socket's last loaded chat.
 */
export const LOADED_PARTY_EVENT = "hfca:loaded_party";

// Message types, beside TabLeader's own
const EVENT = "event";
const REQUEST = "request";
const RESPONSE = "response";
const HELLO = "hello";
const STATE = "state";
const REPLAY = "replay";

/**
 * What a tab that joins late missed, like the global room's recent messages,
 * which the server only sends on the first convo_join. Every tab records the
 * events it sees, so whichever tab leads next still has them.
 */
export interface ReplayCache {
  record(event: string, args: unknown[]): void;
  /** Events to fire in a tab whose convo_join was answered from the first one. */
  replay(): [string, unknown[]][];
}

const DEFAULT_ACK_TIMEOUT = 20000;
/** How much longer than the ack's own timeout a follower waits for the leader's answer. */
const REPLY_GRACE = 2000;

type Handler = (...args: any[]) => void;

interface Pending {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface SharedSocketOptions {
  /** The lock and channel name, e.g. `hfca-socket:convo:<uid>`. */
  name: string;
  locks: LockManagerLike;
  createChannel: (name: string) => ChannelLike;
  /** Opens the real socket, when this tab leads. */
  createSocket: () => RelaySocket;
  /** What to replay to tabs that join late, beyond convo_ready. */
  replay?: ReplayCache;
  tabId?: string;
  now?: () => number;
}

export class SharedSocket implements ConvoSocket {
  readonly leader: TabLeader;
  private readonly createSocket: () => RelaySocket;
  private readonly cache: ReplayCache | null;
  private readonly handlers = new Map<string, Set<Handler>>();
  private readonly pending = new Map<number, Pending>();
  private real: RelaySocket | null = null;
  /** Whether this tab's handlers were told it's connected. */
  private told = false;
  private wanted = false;
  /** The current connection's convo_ready, for tabs that join late. */
  private ready: unknown[] | null = null;
  /** The current connection's convo_join (leader only). */
  private joined: Promise<unknown> | null = null;
  /** The leader this follower last synced with (`tabId:epoch`). */
  private following: string | null = null;
  private nextId = 0;

  constructor(options: SharedSocketOptions) {
    this.createSocket = options.createSocket;
    this.cache = options.replay ?? null;
    this.leader = new TabLeader({
      name: options.name,
      locks: options.locks,
      createChannel: options.createChannel,
      tabId: options.tabId,
      now: options.now,
    });
    this.leader.on("role", (role) => {
      if (role === "leader") this.lead();
      else if (role === "follower") this.follow();
    });
    this.leader.on("leader", (info) => this.onLeader(info));
    this.leader.on("message", (message) => this.onMessage(message));
  }

  get connected(): boolean {
    return this.told;
  }

  on(event: string, handler: Handler): this {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
    return this;
  }

  off(event: string, handler: Handler): this {
    this.handlers.get(event)?.delete(handler);
    return this;
  }

  connect(): void {
    if (this.wanted) return;
    this.wanted = true;
    this.leader.join();
  }

  disconnect(): void {
    if (!this.wanted) return;
    this.wanted = false;
    this.dropReal();
    this.leader.leave();
    this.following = null;
    this.ready = null;
    this.failPending();
    this.tell(false, "io client disconnect");
  }

  emit(event: string, ...args: unknown[]): boolean {
    if (this.leader.isLeader) {
      return this.real?.connected ? this.real.emit(event, ...args) : false;
    }
    const to = this.leader.leader?.tabId;
    if (!this.told || !to) return false;
    this.leader.post({ type: REQUEST, kind: "emit", to, name: event, args });
    return true;
  }

  emitWithAck<T = any>(
    event: string,
    data: unknown,
    timeoutMs = DEFAULT_ACK_TIMEOUT
  ): Promise<T> {
    if (this.leader.isLeader) return this.leaderAck(event, data, timeoutMs);
    const to = this.leader.leader?.tabId;
    if (!this.told || !to) return Promise.reject(new Error("Not connected."));
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Timed out waiting for a reply."));
      }, timeoutMs + REPLY_GRACE);
      this.pending.set(id, { resolve, reject, timer });
      this.leader.post({
        type: REQUEST,
        kind: "ack",
        id,
        to,
        name: event,
        data,
        timeout: timeoutMs,
      });
    });
  }

  // --- Leading ---

  /** This tab took the lead: open the real socket. */
  private lead(): void {
    // Anything sent through the last leader is lost with it
    this.failPending();
    this.tell(false, "transport close");
    this.ready = null;
    this.joined = null;
    this.following = null;
    const real = this.createSocket();
    this.real = real;
    real.onAny((event, ...args) => {
      if (this.real === real) this.onRealEvent(real, event, args);
    });
    real.connect();
  }

  /** This tab follows (again): close the real socket if it had one. */
  private follow(): void {
    if (!this.real) return;
    this.dropReal();
    this.tell(false, "transport close");
  }

  private dropReal(): void {
    const real = this.real;
    this.real = null;
    this.joined = null;
    real?.disconnect();
  }

  private onRealEvent(real: RelaySocket, event: string, args: any[]): void {
    // The leader gets a new ticket itself; every tab's client reacting to
    // this would leave and rejoin the shared socket
    if (event === "convo_auth_expired") {
      real.disconnect();
      real.connect();
      return;
    }
    // Server acks can't go to other tabs; this tab's handlers still get them
    const cloneable = args.filter((arg) => typeof arg !== "function");
    this.cache?.record(event, cloneable);
    switch (event) {
      case "connect":
        this.ready = null;
        this.joined = null;
        this.tell(true);
        break;
      case "disconnect":
        this.ready = null;
        this.joined = null;
        this.tell(false, args[0]);
        break;
      case "convo_ready":
        this.ready = cloneable;
        this.fire(event, ...args);
        break;
      default:
        this.fire(event, ...args);
    }
    this.relay(event, cloneable);
  }

  private relay(name: string, args: unknown[]): void {
    this.leader.post({ type: EVENT, name, args });
  }

  /**
   * Run an acked emit on the real socket, for this tab or (`from`) another.
   */
  private leaderAck<T>(
    event: string,
    data: unknown,
    timeoutMs: number,
    from?: string
  ): Promise<T> {
    const real = this.real;
    if (!real?.connected) return Promise.reject(new Error("Not connected."));
    if (event === "convo_join") {
      // Each tab's client joins after convo_ready; the server only needs it
      // once, and only answers the first with what it sends on joining
      if (!this.joined) {
        const joined = real.emitWithAck(event, data, timeoutMs);
        this.joined = joined;
        joined.catch(() => {
          if (this.joined === joined) this.joined = null;
        });
        return joined as Promise<T>;
      }
      // Replay what the first join brought before answering, so the tab has
      // it once its client is ready
      return this.joined.then((result) => {
        this.sendReplay(from);
        return result as T;
      });
    }
    const result = real.emitWithAck<T>(event, data, timeoutMs);
    if (event === "convo_loadmessages") {
      this.fire(LOADED_PARTY_EVENT, data);
      this.relay(LOADED_PARTY_EVENT, [data]);
    }
    return result;
  }

  /** Fire the replay cache's events in a tab that joined late: another (`to`), or this one. */
  private sendReplay(to?: string): void {
    const events = this.cache?.replay() ?? [];
    if (!events.length) return;
    if (to) {
      this.leader.post({ type: REPLAY, to, events });
      return;
    }
    for (const [name, args] of events) this.fire(name, ...args);
  }

  private onRequest(message: TabMessage): void {
    if (message.to !== this.leader.tabId || typeof message.name !== "string")
      return;
    const from = message.from;
    const id = message.id;
    if (message.kind === "emit") {
      if (this.leader.isLeader && this.real?.connected) {
        const args = Array.isArray(message.args) ? message.args : [];
        this.real.emit(message.name, ...args);
      }
      return;
    }
    if (message.kind !== "ack" || typeof id !== "number") return;
    const respond = (reply: Record<string, unknown>) =>
      this.leader.post({ type: RESPONSE, to: from, id, ...reply });
    if (!this.leader.isLeader) {
      respond({ error: { message: "Not connected.", forwarded: false } });
      return;
    }
    const timeout =
      typeof message.timeout === "number"
        ? message.timeout
        : DEFAULT_ACK_TIMEOUT;
    this.leaderAck(message.name, message.data, timeout, from).then(
      (result) => respond({ result }),
      (error) => {
        const text = String(error?.message || "Convo request failed.");
        respond({
          error: { message: text, forwarded: text !== "Not connected." },
        });
      }
    );
  }

  // --- Following ---

  private onLeader(info: LeaderInfo | null): void {
    if (this.leader.isLeader) return;
    const key = info ? `${info.tabId}:${info.epoch}` : null;
    if (key === this.following) return;
    // The leader left or changed: what was in flight with it is lost
    this.following = key;
    this.failPending();
    this.ready = null;
    this.tell(false, "transport close");
    if (info) this.leader.post({ type: HELLO });
  }

  private onMessage(message: TabMessage): void {
    switch (message.type) {
      case EVENT:
        if (!this.leader.isLeader && this.leader.isFromLeader(message))
          this.onRelayed(message);
        return;
      case REQUEST:
        this.onRequest(message);
        return;
      case RESPONSE:
        if (message.to === this.leader.tabId) this.onResponse(message);
        return;
      case HELLO:
        if (this.leader.isLeader) {
          const connected = Boolean(this.real?.connected);
          this.leader.post({
            type: STATE,
            to: message.from,
            connected,
            ready: connected ? this.ready : null,
          });
        }
        return;
      case STATE:
        if (
          message.to === this.leader.tabId &&
          this.leader.isFromLeader(message)
        )
          this.onState(message);
        return;
      case REPLAY:
        if (
          message.to === this.leader.tabId &&
          this.leader.isFromLeader(message) &&
          Array.isArray(message.events)
        )
          this.onReplay(message.events);
        return;
    }
  }

  private onReplay(events: unknown[]): void {
    for (const entry of events) {
      if (!Array.isArray(entry) || typeof entry[0] !== "string") continue;
      const [name, args] = entry as [string, unknown];
      const list = Array.isArray(args) ? args : [];
      // Kept too, in case this tab leads next
      this.cache?.record(name, list);
      this.fire(name, ...list);
    }
  }

  private onRelayed(message: TabMessage): void {
    if (typeof message.name !== "string") return;
    const args = Array.isArray(message.args) ? message.args : [];
    this.cache?.record(message.name, args);
    switch (message.name) {
      case "connect":
        this.ready = null;
        this.tell(true);
        return;
      case "disconnect":
        this.ready = null;
        this.tell(false, args[0]);
        return;
      case "convo_ready":
        this.ready = args;
        break;
    }
    this.fire(message.name, ...args);
  }

  /** The leader's answer to HELLO: catch up with the connection. */
  private onState(message: TabMessage): void {
    if (!message.connected) return;
    this.tell(true);
    // Unless it already came through, start this tab's client as convo_ready does
    if (!this.ready && Array.isArray(message.ready)) {
      this.ready = message.ready;
      this.cache?.record("convo_ready", message.ready);
      this.fire("convo_ready", ...message.ready);
    }
  }

  private onResponse(message: TabMessage): void {
    const pending =
      typeof message.id === "number" ? this.pending.get(message.id) : undefined;
    if (!pending) return;
    this.pending.delete(message.id as number);
    clearTimeout(pending.timer);
    const error = message.error as
      { message?: string; forwarded?: boolean } | undefined;
    if (!error) {
      pending.resolve(message.result);
      return;
    }
    // "Not connected." means it never reached the server (see sendWithAck)
    pending.reject(
      new Error(
        error.forwarded === false
          ? "Not connected."
          : error.message || "Convo request failed."
      )
    );
  }

  /** Fail requests waiting on a leader that's gone: they may or may not have gone through. */
  private failPending(): void {
    const pending = Array.from(this.pending.values());
    this.pending.clear();
    for (const { reject, timer } of pending) {
      clearTimeout(timer);
      reject(new Error("Disconnected."));
    }
  }

  // --- This tab's handlers ---

  private tell(connected: boolean, reason?: unknown): void {
    if (this.told === connected) return;
    this.told = connected;
    if (connected) this.fire("connect");
    else this.fire("disconnect", reason ?? "transport close");
  }

  private fire(event: string, ...args: unknown[]): void {
    for (const handler of Array.from(this.handlers.get(event) ?? [])) {
      try {
        handler(...args);
      } catch (error) {
        Logger.error(`Shared socket handler for ${event} failed`, error);
      }
    }
  }
}

/**
 * A createSocket for the Convo clients that shares one socket across tabs,
 * or undefined (each tab opens its own) where the browser lacks Web Locks
 * or BroadcastChannel.
 */
export function sharedSocketFactory(
  name: string,
  url: string,
  createReplay?: () => ReplayCache
): CreateConvoSocket | undefined {
  const locks = (navigator as any).locks as LockManagerLike | undefined;
  if (!locks || typeof BroadcastChannel !== "function") return undefined;
  return (auth) =>
    new SharedSocket({
      name,
      locks,
      createChannel: (channel) =>
        new BroadcastChannel(channel) as unknown as ChannelLike,
      createSocket: () => new SocketIOClient({ url, auth }),
      replay: createReplay?.(),
    });
}
