import { FakeActivity } from "../test-utils/FakeActivity";
import { FakeBroadcastBus } from "../test-utils/FakeBroadcastBus";
import { FakeLocks } from "../test-utils/FakeLocks";
import { FakeRelaySocket } from "../test-utils/FakeRelaySocket";
import { ConvoClient } from "./ConvoClient";
import { LOADED_PARTY_EVENT, ReplayCache, SharedSocket } from "./SharedSocket";

/** Keeps every message, and replays them as one bulk. */
class TestReplay implements ReplayCache {
  readonly recorded: string[] = [];
  private readonly messages: unknown[] = [];
  record(event: string, args: unknown[]): void {
    this.recorded.push(event);
    if (event === "convo_receivemessage") this.messages.push(args[0]);
    if (event === "convo_receivemessage_bulk")
      this.messages.push(...(args[0] as unknown[]));
  }
  replay(): [string, unknown[]][] {
    return this.messages.length
      ? [["convo_receivemessage_bulk", [this.messages.slice()]]]
      : [];
  }
}

const NAME = "hfca-socket:convo:1";

const flush = async () => {
  for (let i = 0; i < 8; i++)
    await new Promise((resolve) =>
      jest.requireActual("timers").setImmediate(resolve)
    );
};

describe("SharedSocket", () => {
  let locks: FakeLocks;
  let bus: FakeBroadcastBus;
  let sockets: FakeRelaySocket[];
  let clock: number;

  beforeEach(() => {
    locks = new FakeLocks();
    bus = new FakeBroadcastBus();
    sockets = [];
    clock = 1000;
  });

  const shared = (tabId: string, replay?: ReplayCache) =>
    new SharedSocket({
      name: NAME,
      locks,
      createChannel: bus.create,
      tabId,
      replay,
      now: () => clock,
      createSocket: () => {
        const socket = new FakeRelaySocket();
        sockets.push(socket);
        return socket;
      },
    });

  /** A tab's shared socket, recording what its handlers hear. */
  const tab = (tabId: string, replay?: ReplayCache) => {
    const socket = shared(tabId, replay);
    const heard: [string, ...unknown[]][] = [];
    for (const event of [
      "connect",
      "disconnect",
      "convo_ready",
      "convo_receivemessage",
      "convo_receivemessage_bulk",
      "reconnect_failed",
      "convo_auth_expired",
      LOADED_PARTY_EVENT,
    ]) {
      socket.on(event, (...args: unknown[]) => heard.push([event, ...args]));
    }
    return { socket, heard };
  };

  /** Tabs a, b, c joined, with a leading and its socket connected and ready. */
  const threeTabs = async () => {
    const tabs = ["a", "b", "c"].map((id) => tab(id));
    tabs.forEach((t) => t.socket.connect());
    await flush();
    sockets[0].open();
    sockets[0].fire("convo_ready", { user: { uid: 1 } });
    await flush();
    return tabs;
  };

  it("opens one real socket for all tabs, in the leading tab", async () => {
    const [a, b, c] = await threeTabs();

    expect(sockets).toHaveLength(1);
    expect(sockets[0].connects).toBe(1);
    expect(a.socket.leader.isLeader).toBe(true);
    for (const t of [a, b, c]) {
      expect(t.socket.connected).toBe(true);
      expect(t.heard).toEqual([
        ["connect"],
        ["convo_ready", { user: { uid: 1 } }],
      ]);
    }
  });

  it("passes the socket's events to every tab, in order", async () => {
    const [a, b, c] = await threeTabs();
    for (let mid = 1; mid <= 3; mid++)
      sockets[0].fire("convo_receivemessage", { mid });
    await flush();

    for (const t of [a, b, c]) {
      expect(
        t.heard.filter(([event]) => event === "convo_receivemessage")
      ).toEqual([
        ["convo_receivemessage", { mid: 1 }],
        ["convo_receivemessage", { mid: 2 }],
        ["convo_receivemessage", { mid: 3 }],
      ]);
    }
  });

  it("leaves server ack callbacks out of what other tabs get", async () => {
    const [a, b] = await threeTabs();
    const ack = jest.fn();
    sockets[0].fire("convo_receivemessage", { mid: 1 }, ack);
    await flush();

    expect(a.heard.at(-1)).toEqual(["convo_receivemessage", { mid: 1 }, ack]);
    expect(b.heard.at(-1)).toEqual(["convo_receivemessage", { mid: 1 }]);
  });

  it("runs a follower's acked emit on the real socket and returns the ack", async () => {
    const [, b] = await threeTabs();
    sockets[0].ackReplies.mark_read = (party) => ({ ok: true, party });

    const result = await b.socket.emitWithAck("mark_read", 42);

    expect(result).toEqual({ ok: true, party: 42 });
    expect(sockets[0].acked).toEqual([["mark_read", 42]]);
  });

  it("runs a follower's emit on the real socket", async () => {
    const [, b] = await threeTabs();
    expect(b.socket.emit("type_notice_start", true)).toBe(true);
    await flush();

    expect(sockets[0].emitted).toEqual([["type_notice_start", true]]);
  });

  it("sends image bytes from a follower", async () => {
    const [, b] = await threeTabs();
    sockets[0].ackReplies.convo_imageupload = (data) => ({
      ok: true,
      size: data.imageData.byteLength,
    });

    const result = await b.socket.emitWithAck("convo_imageupload", {
      partyID: 5,
      imageData: new Uint8Array([1, 2, 3]).buffer,
    });

    expect(result).toEqual({ ok: true, size: 3 });
  });

  it("brings a tab that joins late up to date", async () => {
    await threeTabs();
    const d = tab("d");
    d.socket.connect();
    await flush();

    expect(d.socket.connected).toBe(true);
    expect(d.heard).toEqual([
      ["connect"],
      ["convo_ready", { user: { uid: 1 } }],
    ]);
  });

  it("joins the server once per connection, answering every tab's convo_join", async () => {
    const [a, b, c] = await threeTabs();
    sockets[0].ackReplies.convo_join = () => ({ ok: true, n: 1 });

    const results = await Promise.all(
      [a, b, c].map((t) =>
        t.socket.emitWithAck("convo_join", { publicRoom: false })
      )
    );

    expect(results).toEqual([
      { ok: true, n: 1 },
      { ok: true, n: 1 },
      { ok: true, n: 1 },
    ]);
    expect(
      sockets[0].acked.filter(([event]) => event === "convo_join")
    ).toHaveLength(1);

    // A new connection joins again
    sockets[0].disconnect();
    sockets[0].open();
    await a.socket.emitWithAck("convo_join", { publicRoom: false });
    expect(
      sockets[0].acked.filter(([event]) => event === "convo_join")
    ).toHaveLength(2);
  });

  it("tries convo_join again after it fails", async () => {
    const [a, b] = await threeTabs();
    sockets[0].ackReplies.convo_join = () => {
      throw new Error("Timed out waiting for a reply.");
    };
    await expect(a.socket.emitWithAck("convo_join", {})).rejects.toThrow(
      "Timed out"
    );
    sockets[0].ackReplies.convo_join = () => ({ ok: true });
    await expect(b.socket.emitWithAck("convo_join", {})).resolves.toEqual({
      ok: true,
    });
  });

  it("refuses emits while the shared socket isn't connected", async () => {
    const [a, b] = ["a", "b"].map((id) => tab(id));
    a.socket.connect();
    b.socket.connect();
    await flush();

    expect(b.socket.connected).toBe(false);
    expect(b.socket.emit("type_notice_start", true)).toBe(false);
    await expect(b.socket.emitWithAck("mark_read", 1)).rejects.toThrow(
      "Not connected."
    );
    await expect(a.socket.emitWithAck("mark_read", 1)).rejects.toThrow(
      "Not connected."
    );
  });

  it("says a follower's request wasn't sent when the leader's socket refuses it", async () => {
    const [, b] = await threeTabs();
    sockets[0].emitWithAck = () => Promise.reject(new Error("Not connected."));
    await expect(b.socket.emitWithAck("mark_read", 1)).rejects.toThrow(
      "Not connected."
    );
  });

  it("passes on other failures, which may have reached the server", async () => {
    const [, b] = await threeTabs();
    sockets[0].emitWithAck = () =>
      Promise.reject(new Error("Timed out waiting for a reply."));
    await expect(b.socket.emitWithAck("convo_newmessage", {})).rejects.toThrow(
      "Timed out waiting for a reply."
    );
  });

  it("hands the socket to the next tab when the leader leaves", async () => {
    const [a, b, c] = await threeTabs();
    clock = 2000;
    a.socket.disconnect();
    await flush();

    expect(sockets[0].connected).toBe(false);
    expect(sockets).toHaveLength(2);
    expect(b.socket.leader.isLeader).toBe(true);
    // c sees the socket drop, then come back with the new leader's connection
    expect(c.socket.connected).toBe(false);
    sockets[1].open();
    sockets[1].fire("convo_ready", { user: { uid: 1 } });
    await flush();
    expect(c.socket.connected).toBe(true);
    expect(c.heard.map(([event]) => event)).toEqual([
      "connect",
      "convo_ready",
      "disconnect",
      "connect",
      "convo_ready",
    ]);
    expect(a.heard.at(-1)).toEqual(["disconnect", "io client disconnect"]);
  });

  it("fails a follower's request when the leader goes away before answering", async () => {
    const [a, b] = await threeTabs();
    delete sockets[0].ackReplies.convo_newmessage; // never acked
    const pending = b.socket.emitWithAck("convo_newmessage", { message: "hi" });
    await flush();
    a.socket.disconnect();

    // Not "Not connected.": it may have reached the server
    await expect(pending).rejects.toThrow("Disconnected.");
  });

  it("moves the socket to a tab that steals the lead", async () => {
    const [a, , c] = await threeTabs();
    clock = 3000;
    c.socket.leader.steal();
    await flush();

    expect(c.socket.leader.isLeader).toBe(true);
    expect(sockets[0].connected).toBe(false);
    expect(sockets).toHaveLength(2);
    expect(a.socket.connected).toBe(false);

    sockets[1].open();
    await flush();
    expect(a.socket.connected).toBe(true);
    // a's old socket is gone: its events no longer reach anyone
    sockets[0].fire("convo_receivemessage", { mid: 9 });
    await flush();
    expect(a.heard.some(([, data]) => (data as any)?.mid === 9)).toBe(false);
  });

  it("renews an expired ticket in the leader only", async () => {
    const [a, b] = await threeTabs();
    sockets[0].fire("convo_auth_expired");
    await flush();

    expect(sockets[0].disconnects).toBe(1);
    expect(sockets[0].connects).toBe(2);
    for (const t of [a, b]) {
      expect(t.heard.some(([event]) => event === "convo_auth_expired")).toBe(
        false
      );
      expect(t.heard.at(-1)).toEqual(["disconnect", "io client disconnect"]);
    }
  });

  it("tells every tab which chat any tab loaded", async () => {
    const [a, b, c] = await threeTabs();
    sockets[0].ackReplies.convo_loadmessages = () => ({ ok: true });
    await b.socket.emitWithAck("convo_loadmessages", {
      party: 7,
      is_group: false,
    });
    await flush();

    for (const t of [a, b, c]) {
      expect(t.heard.at(-1)).toEqual([
        LOADED_PARTY_EVENT,
        { party: 7, is_group: false },
      ]);
    }
  });

  it("passes on the end of the connection", async () => {
    const [, b] = await threeTabs();
    sockets[0].fire("reconnect_failed");
    await flush();
    expect(b.heard.at(-1)).toEqual(["reconnect_failed"]);
  });

  describe("replay", () => {
    /** a leads and has joined; a room message came; b joins late. */
    const lateJoin = async () => {
      const a = tab("a", new TestReplay());
      a.socket.connect();
      await flush();
      sockets[0].ackReplies.convo_join = () => ({ ok: true });
      sockets[0].open();
      sockets[0].fire("convo_ready", { user: { uid: 1 } });
      await a.socket.emitWithAck("convo_join", { publicRoom: true });
      sockets[0].fire("convo_receivemessage", { mid: 1 });
      const replay = new TestReplay();
      const b = tab("b", replay);
      b.socket.connect();
      await flush();
      return { a, b, replay };
    };

    it("gives a tab whose join comes later what the first join brought, before its ack", async () => {
      const { b } = await lateJoin();
      const order: string[] = [];
      b.socket.on("convo_receivemessage_bulk", () => order.push("replay"));

      await b.socket.emitWithAck("convo_join", { publicRoom: true });
      order.push("ack");

      expect(order).toEqual(["replay", "ack"]);
      expect(b.heard.at(-1)).toEqual([
        "convo_receivemessage_bulk",
        [{ mid: 1 }],
      ]);
      expect(sockets[0].acked.filter(([e]) => e === "convo_join")).toHaveLength(
        1
      );
    });

    it("doesn't replay to the first join, which the server answers itself", async () => {
      const { a } = await lateJoin();
      expect(
        a.heard.some(([event]) => event === "convo_receivemessage_bulk")
      ).toBe(false);
    });

    it("replays in the leader's own tab when its client joins second", async () => {
      const a = tab("a", new TestReplay());
      const b = tab("b", new TestReplay());
      a.socket.connect();
      b.socket.connect();
      await flush();
      sockets[0].ackReplies.convo_join = () => ({ ok: true });
      sockets[0].open();
      sockets[0].fire("convo_receivemessage", { mid: 4 });
      await flush();
      await b.socket.emitWithAck("convo_join", {});
      await a.socket.emitWithAck("convo_join", {});

      expect(a.heard.at(-1)).toEqual([
        "convo_receivemessage_bulk",
        [{ mid: 4 }],
      ]);
    });

    it("keeps what a follower is replayed and passed, so it can lead next", async () => {
      const { b, replay } = await lateJoin();
      // b's cache starts with what its catch-up gave it
      expect(replay.recorded).toEqual(["convo_ready"]);

      await b.socket.emitWithAck("convo_join", {});
      sockets[0].fire("convo_receivemessage", { mid: 2 });
      await flush();

      expect(replay.recorded).toEqual([
        "convo_ready",
        "convo_receivemessage_bulk",
        "convo_receivemessage",
      ]);
    });

    it("passes the replay on to a tab that leads next", async () => {
      const { a, b } = await lateJoin();
      await b.socket.emitWithAck("convo_join", {});
      const c = tab("c", new TestReplay());
      c.socket.connect();
      await flush();
      clock = 2000;
      a.socket.disconnect();
      await flush();

      // b leads now, with a's history; c joins through b
      expect(b.socket.leader.isLeader).toBe(true);
      sockets[1].ackReplies.convo_join = () => ({ ok: true });
      sockets[1].open();
      await b.socket.emitWithAck("convo_join", {});
      await c.socket.emitWithAck("convo_join", {});
      expect(c.heard.at(-1)).toEqual([
        "convo_receivemessage_bulk",
        [{ mid: 1 }],
      ]);
    });
  });

  describe("handing over to the active tab", () => {
    beforeEach(() => {
      jest.useFakeTimers({
        doNotFake: ["queueMicrotask", "setImmediate", "nextTick"],
      });
    });
    afterEach(() => jest.useRealTimers());

    const advance = async (ms: number) => {
      for (let left = ms; left > 0; left -= 500) {
        jest.advanceTimersByTime(Math.min(500, left));
        await flush();
      }
    };

    it("finishes a follower's send first, refusing new work meanwhile", async () => {
      const make = (tabId: string, activity: FakeActivity) =>
        new SharedSocket({
          name: NAME,
          locks,
          createChannel: bus.create,
          tabId,
          activity,
          createSocket: () => {
            const socket = new FakeRelaySocket();
            sockets.push(socket);
            return socket;
          },
        });
      const a = make("a", new FakeActivity(false));
      const b = make("b", new FakeActivity(false));
      const cActivity = new FakeActivity(false);
      const c = make("c", cActivity);
      [a, b, c].forEach((t) => t.connect());
      await flush();
      sockets[0].open();
      await flush();

      // b's send is still waiting for the server's ack
      let ack!: (value: unknown) => void;
      sockets[0].ackReplies.convo_newmessage = () =>
        new Promise((resolve) => (ack = resolve));
      const send = b.emitWithAck("convo_newmessage", { message: "hi" });
      await flush();

      // The user switches to c
      cActivity.set(true);
      await advance(2000);
      expect(a.leader.handingOff).toBe(true);
      expect(c.leader.isLeader).toBe(false);
      await expect(b.emitWithAck("mark_read", 1)).rejects.toThrow(
        "Not connected."
      );

      ack({ ok: true });
      await expect(send).resolves.toEqual({ ok: true });
      await advance(500);
      expect(c.leader.isLeader).toBe(true);
      expect(sockets[0].connected).toBe(false);
      expect(sockets).toHaveLength(2);
      [a, b, c].forEach((t) => t.disconnect());
    });
  });

  it("disconnects a follower like a socket", async () => {
    const [, b] = await threeTabs();
    delete sockets[0].ackReplies.convo_newmessage; // never acked
    const pending = b.socket.emitWithAck("convo_newmessage", {});
    b.socket.disconnect();

    await expect(pending).rejects.toThrow("Disconnected.");
    expect(b.socket.connected).toBe(false);
    expect(b.heard.at(-1)).toEqual(["disconnect", "io client disconnect"]);
    expect(sockets).toHaveLength(1);
  });
});

describe("ConvoClient over a SharedSocket", () => {
  it("works in every tab over one real socket", async () => {
    const locks = new FakeLocks();
    const bus = new FakeBroadcastBus();
    const sockets: FakeRelaySocket[] = [];
    const client = (tabId: string) =>
      new ConvoClient({
        postKey: "key",
        origin: "https://hackforums.net",
        randomUUID: () => `${tabId}-request`,
        createSocket: () =>
          new SharedSocket({
            name: NAME,
            locks,
            createChannel: bus.create,
            tabId,
            createSocket: () => {
              const socket = new FakeRelaySocket();
              sockets.push(socket);
              return socket;
            },
          }),
      });
    const [a, b] = [client("a"), client("b")];
    a.connect();
    b.connect();
    await flush();
    const real = sockets[0];
    real.open();
    real.fire("convo_ready", {
      user: { uid: 1, username: "me", avatar: "" },
    });
    await flush();

    expect(sockets).toHaveLength(1);
    expect(a.status).toBe("ready");
    expect(b.status).toBe("ready");
    expect(real.acked.filter(([event]) => event === "convo_join")).toHaveLength(
      1
    );

    real.fire("convo_loaded_more_inbox", {
      users: { 2: { uid: 2, username: "pal", avatar: "" } },
      messages: {
        1: {
          party_id: 9,
          party_data: { party: "1,2" },
          from_uid: 2,
          message: "hey",
          mid: 100,
          dateline: 50,
          unread: 1,
        },
      },
    });
    await flush();
    expect(a.getConversations().map((c) => c.partyId)).toEqual([9]);
    expect(b.getConversations().map((c) => c.partyId)).toEqual([9]);

    await b.send(9, "hello from b");
    expect(real.acked.at(-1)).toEqual([
      "convo_newmessage",
      { partyID: 9, message: "hello from b", requestId: "b-request" },
    ]);
  });
});
