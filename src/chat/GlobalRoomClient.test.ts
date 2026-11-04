import { FakeBroadcastBus } from "../test-utils/FakeBroadcastBus";
import { FakeLocks } from "../test-utils/FakeLocks";
import { FakeRelaySocket } from "../test-utils/FakeRelaySocket";
import { commandRequest } from "./commands";
import {
  GlobalRoomClient,
  parseRoomMessage,
  rankOf,
  RoomReplay,
} from "./GlobalRoomClient";
import { SharedSocket } from "./SharedSocket";
import type { ConvoSocket } from "./SocketIOClient";

const ME = { uid: 10, username: "Me", avatar: "", usergroup: 2, group: 2 };
const NOVA = {
  uid: 20,
  username: "Nova",
  avatar: "",
  usergroup: 28,
  group: 46,
};

/** Stand-in for SocketIOClient: records emits, lets tests fire server events. */
class FakeSocket {
  connected = false;
  handlers = new Map<string, ((...args: any[]) => void)[]>();
  emitted: [string, unknown][] = [];
  acked: [string, unknown][] = [];
  ackReplies: Record<string, (data: any) => any> = {
    convo_join: () => ({ ok: true, ready: true }),
    convo_newmessage: () => ({ ok: true, accepted: true }),
  };
  on(event: string, handler: (...args: any[]) => void) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
    return this;
  }
  off(event: string, handler: unknown) {
    this.handlers.set(
      event,
      (this.handlers.get(event) ?? []).filter((h) => h !== handler)
    );
    return this;
  }
  connect = jest.fn(() => {
    this.connected = true;
  });
  disconnect = jest.fn(() => {
    this.connected = false;
  });
  emit(event: string, data?: unknown) {
    this.emitted.push([event, data]);
    return true;
  }
  emitWithAck(event: string, data: unknown) {
    this.acked.push([event, data]);
    const reply = this.ackReplies[event];
    return reply
      ? Promise.resolve().then(() => reply(data))
      : new Promise(() => {});
  }
  fire(event: string, ...args: unknown[]) {
    (this.handlers.get(event) ?? []).forEach((handler) => handler(...args));
  }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const roomMessage = (overrides: Record<string, unknown> = {}) => ({
  uid: NOVA.uid,
  mid: 100,
  party_id: -1,
  message: "hello room",
  dateline: 1000,
  bootId: "boot-1",
  users: { [NOVA.uid]: NOVA },
  ...overrides,
});

describe("parseRoomMessage", () => {
  it("keys messages by boot and mid", () => {
    expect(parseRoomMessage(roomMessage())).toMatchObject({
      key: "boot-1:100",
      mid: 100,
      uid: NOVA.uid,
      text: "hello room",
    });
  });

  it("keeps an image link convo.php would embed", () => {
    const gif = "https://static.klipy.com/ii/a/b.gif";
    const users = (usergroup: number) => ({
      [NOVA.uid]: { ...NOVA, usergroup },
    });
    expect(
      parseRoomMessage(
        roomMessage({ message: `GIF: ${gif}`, users: users(28) })
      )?.embed
    ).toBe(gif);
    expect(
      parseRoomMessage(roomMessage({ message: `GIF: ${gif}`, users: users(2) }))
        ?.embed
    ).toBeUndefined();
  });

  it("only accepts global room messages", () => {
    expect(parseRoomMessage(roomMessage({ party_id: 5 }))).toBeNull();
    expect(parseRoomMessage(roomMessage({ is_group: true }))).toBeNull();
    expect(parseRoomMessage(roomMessage({ mid: 0 }))).toBeNull();
  });
});

describe("rankOf", () => {
  it("follows HF's online-list ranks", () => {
    expect(rankOf({ usergroup: 4 })).toBe(1);
    expect(rankOf({ usergroup: 3, level: 2 })).toBe(2);
    expect(rankOf({ usergroup: 2, level: 1 })).toBe(3);
    expect(rankOf({ usergroup: 28 })).toBe(4);
    expect(rankOf({ usergroup: 9 })).toBe(5);
    expect(rankOf({ usergroup: 2 })).toBe(6);
    expect(rankOf({ usergroup: 99 })).toBe(6);
  });
});

describe("GlobalRoomClient", () => {
  let socket: FakeSocket;
  let client: GlobalRoomClient;

  const ready = async (bootId = "boot-1") => {
    client.connect();
    socket.fire("convo_ready", { user: ME, level: 0, bootId });
    await flush();
  };

  beforeEach(() => {
    socket = new FakeSocket();
    let uuid = 0;
    client = new GlobalRoomClient({
      postKey: "abc",
      origin: "https://hackforums.net",
      randomUUID: () => `req-${++uuid}`,
      createSocket: () => socket as unknown as ConvoSocket,
    });
  });

  it("adds command results to room messages, before or after they arrive", async () => {
    await ready();
    const onResult = jest.fn();
    client.on("result", onResult);
    socket.fire("convo_receivemessage", roomMessage({ message: "/flip 5" }));
    socket.fire("convo_flip_result", {
      mid: 100,
      win: false,
      outcome: "Tails",
      balance: 95,
    });
    expect(onResult.mock.calls[0][0]).toMatchObject({
      key: "boot-1:100",
      result: { kind: "flip", win: false, outcome: "Tails", balance: 95 },
    });

    socket.fire("convo_jackpot_result", {
      mid: 101,
      success: true,
      bytesWon: 0,
      balance: 70,
      pot: 5000,
    });
    socket.fire(
      "convo_receivemessage",
      roomMessage({ mid: 101, message: "/jackpot play" })
    );
    expect(client.messages[1].result).toEqual({
      kind: "jackpot",
      won: 0,
      balance: 70,
      pot: 5000,
    });
  });

  it("forgets results when the room restarts", async () => {
    await ready();
    socket.fire("convo_flip_result", {
      mid: 100,
      win: true,
      outcome: "Heads",
      balance: 1,
    });
    socket.fire("convo_ready", { user: ME, bootId: "boot-2" });
    await flush();
    socket.fire("convo_receivemessage", roomMessage({ bootId: "boot-2" }));
    expect(client.messages[0].result).toBeUndefined();
  });

  it("joins the public room on ready", async () => {
    const statuses: string[] = [];
    client.on("status", (status) => statuses.push(status));
    await ready();
    expect(socket.acked[0]).toEqual(["convo_join", { publicRoom: true }]);
    expect(statuses).toEqual(["connecting", "ready"]);
  });

  it("adds messages once, with their senders", async () => {
    await ready();
    const onMessages = jest.fn();
    client.on("messages", onMessages);
    socket.fire("convo_receivemessage_bulk", [
      roomMessage(),
      roomMessage({ mid: 101 }),
    ]);
    socket.fire("convo_receivemessage", roomMessage({ mid: 101 }));
    socket.fire("convo_receivemessage", roomMessage({ party_id: 7, mid: 102 }));

    expect(client.messages.map((m) => m.mid)).toEqual([100, 101]);
    expect(onMessages).toHaveBeenCalledTimes(1);
    expect(client.users.get(NOVA.uid)).toMatchObject({
      username: "Nova",
      group: 46,
    });
  });

  it("drops Stanley's notices only when asked to", async () => {
    const stanley = (mid: number) =>
      roomMessage({
        uid: 1337,
        mid,
        trustedHtml: true,
        message: "🔔 <a href='showthread.php?tid=1'>New thread</a>",
      });
    await ready();
    socket.fire("convo_receivemessage_bulk", [stanley(1), roomMessage()]);
    expect(client.messages.map((m) => m.uid)).toEqual([1337, NOVA.uid]);

    socket = new FakeSocket();
    client = new GlobalRoomClient({
      postKey: "abc",
      origin: "https://hackforums.net",
      createSocket: () => socket as unknown as ConvoSocket,
      hideHelpbot: true,
    });
    const onMessages = jest.fn();
    client.on("messages", onMessages);
    await ready();
    socket.fire("convo_receivemessage_bulk", [stanley(1), roomMessage()]);
    socket.fire("convo_receivemessage", stanley(2));
    expect(client.messages.map((m) => m.uid)).toEqual([NOVA.uid]);
    expect(onMessages).toHaveBeenCalledTimes(1);
  });

  it("shows Stanley's messages that have no id, such as rain results, even with Stanley hidden", async () => {
    socket = new FakeSocket();
    client = new GlobalRoomClient({
      postKey: "abc",
      origin: "https://hackforums.net",
      createSocket: () => socket as unknown as ConvoSocket,
      hideHelpbot: true,
    });
    await ready();
    socket.fire("convo_receivemessage", roomMessage({ mid: 40 }));
    const rain = {
      uid: 1337,
      message: "<strong>Me</strong> has rained 10 Bytes each on: Nova",
      party_id: -1,
      users: { 1337: { uid: 1337, username: "Stanley", avatar: "" } },
      trustedHtml: true,
    };
    socket.fire("convo_receivemessage", rain);
    socket.fire("convo_receivemessage", rain);
    expect(client.messages.map((m) => [m.uid, m.mid])).toEqual([
      [NOVA.uid, 40],
      [1337, 40],
      [1337, 40],
    ]);
    expect(new Set(client.messages.map((m) => m.key)).size).toBe(3);
    expect(client.messages[1]).toMatchObject({ html: true });
  });

  it("starts over when the server restarts", async () => {
    await ready("boot-1");
    socket.fire("convo_receivemessage_bulk", [roomMessage()]);
    const onMessages = jest.fn();
    client.on("messages", onMessages);

    socket.fire("convo_ready", { user: ME, bootId: "boot-2" });
    await flush();
    expect(client.messages).toEqual([]);
    expect(onMessages).toHaveBeenCalledWith([], true);
    // The same mid in the new boot is a new message
    socket.fire("convo_receivemessage", roomMessage({ bootId: "boot-2" }));
    expect(client.messages).toHaveLength(1);
  });

  it("sorts the online list by rank, then name", async () => {
    await ready();
    socket.fire("convo_group_count", {
      count: 3,
      users: {
        1: { uid: 1, username: "zed", usergroup: 2 },
        2: { uid: 2, username: "Amy", usergroup: 2 },
        3: { uid: 3, username: "Boss", usergroup: 4 },
      },
    });
    expect(client.onlineCount).toBe(3);
    expect(client.online.map((u) => `${u.rank}:${u.username}`)).toEqual([
      "1:Boss",
      "6:Amy",
      "6:zed",
    ]);
  });

  it("sends to party -1, including commands the server runs", async () => {
    await ready();
    await client.send("  hi all  ", "req-x");
    await client.send("/flip 1000", "req-y");
    expect(socket.acked).toEqual(
      expect.arrayContaining([
        [
          "convo_newmessage",
          { partyID: -1, message: "hi all", requestId: "req-x" },
        ],
        [
          "convo_newmessage",
          { partyID: -1, message: "/flip 1000", requestId: "req-y" },
        ],
      ])
    );
  });

  it("keeps the moderator level the room sends", async () => {
    await ready();
    expect(client.groupLevel).toBe(0);
    socket.fire("convo_group_level", "2");
    expect(client.groupLevel).toBe(2);
  });

  it("rains with a requestId, one pending send at a time", async () => {
    await ready();
    let ack: (value: unknown) => void = () => undefined;
    socket.ackReplies.convo_rain = () =>
      new Promise((resolve) => (ack = resolve));
    const rain = client.command(
      commandRequest({ kind: "rain", players: 5, bytes: 10 }, -1)
    );
    await flush();
    expect(socket.acked).toContainEqual([
      "convo_rain",
      { players: 5, myps: 10, requestId: "req-1" },
    ]);
    // A message can't go while the rain is pending
    await expect(client.send("hi")).rejects.toMatchObject({
      failure: "not-sent",
    });
    ack({ ok: true });
    await rain;
    expect(client.isSending).toBe(false);
  });

  it("answers /stats with Stanley's reply", async () => {
    await ready();
    const stats = {
      uid: 1337,
      message: "Bytes Balance: 1.00",
      party_id: -1,
      trustedHtml: true,
    };
    socket.ackReplies.convo_checkstats = () => {
      socket.fire("convo_receivemessage", stats);
      return { ok: true };
    };
    await expect(
      client.command(commandRequest({ kind: "stats" }, -1))
    ).resolves.toEqual(stats);
    // It shows in the room too, as on convo.php
    expect(client.messages.map((m) => m.text)).toEqual(["Bytes Balance: 1.00"]);
  });

  it("doesn't send commands while disconnected", async () => {
    await expect(
      client.command(commandRequest({ kind: "stats" }, -1))
    ).rejects.toMatchObject({ failure: "not-sent" });
    expect(socket.acked).toEqual([]);
  });

  it("refuses to send while disconnected", async () => {
    await expect(client.send("hi")).rejects.toThrow("disconnected");
  });

  it("uploads images to party -1", async () => {
    await ready();
    const image = new ArrayBuffer(4);
    socket.ackReplies.convo_imageupload = () => ({ ok: true });
    await client.sendImage(image, "req-img");
    expect(socket.acked).toContainEqual([
      "convo_imageupload",
      { partyID: -1, imageData: image, requestId: "req-img" },
    ]);
  });

  it("says whether a failed send was never sent, refused or unconfirmed", async () => {
    await expect(client.send("hi")).rejects.toMatchObject({
      failure: "not-sent",
    });
    await ready();
    socket.ackReplies.convo_newmessage = () => ({
      ok: false,
      error: "Slow down.",
    });
    await expect(client.send("hi")).rejects.toMatchObject({
      message: "Slow down.",
      failure: "refused",
    });
  });

  it("reports an unconfirmed send", async () => {
    await ready();
    socket.ackReplies.convo_newmessage = () => {
      throw new Error("Timed out waiting for a reply.");
    };
    await expect(client.send("hi")).rejects.toThrow("Delivery is unconfirmed");
    expect(client.isSending).toBe(false);
  });

  it("tracks who's typing, ignoring ourselves", async () => {
    await ready();
    socket.fire("type_notice_add", { uid: NOVA.uid, username: "Nova" });
    socket.fire("type_notice_add", { uid: ME.uid, username: "Me" });
    expect(Array.from(client.typing.values())).toEqual(["Nova"]);
    // Their message ends it
    socket.fire("convo_receivemessage", roomMessage());
    expect(client.typing.size).toBe(0);
  });

  it("sends typing notices only on changes", async () => {
    await ready();
    client.setTyping(true);
    client.setTyping(true);
    client.setTyping(false);
    expect(socket.emitted).toEqual([
      ["type_notice_start", true],
      ["type_notice_stop", true],
    ]);
  });

  it("leaves the room by disconnecting", async () => {
    await ready();
    socket.fire("type_notice_add", { uid: NOVA.uid, username: "Nova" });
    client.disconnect();
    expect(socket.disconnect).toHaveBeenCalled();
    expect(client.typing.size).toBe(0);
  });
});

describe("RoomReplay", () => {
  const bulk = (replay: RoomReplay) =>
    replay
      .replay()
      .find(([event]) => event === "convo_receivemessage_bulk")?.[1][0] as
      Record<string, unknown>[] | undefined;

  it("replays the newest level, online list and messages, as history", () => {
    const replay = new RoomReplay();
    replay.record("convo_ready", [{ user: ME, bootId: "boot-1" }]);
    replay.record("convo_group_level", [0]);
    replay.record("convo_group_level", [2]);
    replay.record("convo_group_count", [{ count: 1, users: {} }]);
    replay.record("convo_receivemessage_bulk", [[roomMessage({ mid: 1 })]]);
    replay.record("convo_receivemessage", [roomMessage({ mid: 2 })]);

    const events = replay.replay();
    expect(events.map(([event]) => event)).toEqual([
      "convo_group_level",
      "convo_group_count",
      "convo_receivemessage_bulk",
    ]);
    expect(events[0][1]).toEqual([2]);
    expect(bulk(replay)?.map((m) => [m.mid, m.noSound])).toEqual([
      [1, true],
      [2, true],
    ]);
  });

  it("keeps each message once, though every join's latest 20 repeat", () => {
    const replay = new RoomReplay();
    replay.record("convo_ready", [{ bootId: "boot-1" }]);
    const page = [roomMessage({ mid: 1 }), roomMessage({ mid: 2 })];
    replay.record("convo_receivemessage_bulk", [page]);
    replay.record("convo_receivemessage_bulk", [page]);
    expect(bulk(replay)?.map((m) => m.mid)).toEqual([1, 2]);
  });

  it("keeps Stanley's id-less notices", () => {
    const replay = new RoomReplay();
    replay.record("convo_receivemessage", [roomMessage({ mid: 0, uid: 1337 })]);
    replay.record("convo_receivemessage", [roomMessage({ mid: 0, uid: 1337 })]);
    expect(bulk(replay)).toHaveLength(2);
  });

  it("keeps the newest 300 messages", () => {
    const replay = new RoomReplay();
    replay.record("convo_ready", [{ bootId: "boot-1" }]);
    for (let mid = 1; mid <= 700; mid++)
      replay.record("convo_receivemessage", [roomMessage({ mid })]);
    const kept = bulk(replay)!;
    expect(kept).toHaveLength(300);
    expect(kept[0].mid).toBe(401);
    expect(kept[299].mid).toBe(700);
    // Repeats of kept messages are still recognized after trimming
    replay.record("convo_receivemessage", [roomMessage({ mid: 700 })]);
    expect(bulk(replay)).toHaveLength(300);
  });

  it("forgets the messages when the room restarts", () => {
    const replay = new RoomReplay();
    replay.record("convo_ready", [{ bootId: "boot-1" }]);
    replay.record("convo_receivemessage", [roomMessage({ mid: 5 })]);
    replay.record("convo_ready", [{ bootId: "boot-1" }]);
    expect(bulk(replay)).toHaveLength(1);
    replay.record("convo_ready", [{ bootId: "boot-2" }]);
    expect(bulk(replay)).toBeUndefined();
  });

  it("ignores anything but room messages", () => {
    const replay = new RoomReplay();
    replay.record("convo_receivemessage", [roomMessage({ party_id: 5 })]);
    replay.record("convo_receivemessage", [null]);
    replay.record("convo_receivemessage_bulk", ["nope"]);
    replay.record("type_notice_add", [{ uid: 1 }]);
    expect(replay.replay()).toEqual([]);
  });
});

describe("GlobalRoomClient over a SharedSocket", () => {
  const settle = async () => {
    for (let i = 0; i < 8; i++)
      await new Promise((resolve) =>
        jest.requireActual("timers").setImmediate(resolve)
      );
  };

  it("shares one room socket, catching up a tab that opens the room later", async () => {
    const locks = new FakeLocks();
    const bus = new FakeBroadcastBus();
    const sockets: FakeRelaySocket[] = [];
    const client = (tabId: string) =>
      new GlobalRoomClient({
        postKey: "abc",
        origin: "https://hackforums.net",
        randomUUID: () => `${tabId}-req`,
        createSocket: () =>
          new SharedSocket({
            name: "hfca-socket:global:10",
            locks,
            createChannel: bus.create,
            tabId,
            replay: new RoomReplay(),
            createSocket: () => {
              const socket = new FakeRelaySocket();
              sockets.push(socket);
              return socket;
            },
          }),
      });

    // Tab a opens the room; the server answers its join with the room
    const a = client("a");
    a.connect();
    await settle();
    const real = sockets[0];
    real.open();
    real.fire("convo_ready", { user: ME, bootId: "boot-1" });
    await settle();
    real.fire("convo_group_count", { count: 2, users: { 10: ME, 20: NOVA } });
    real.fire("convo_receivemessage_bulk", [
      roomMessage({ mid: 1 }),
      roomMessage({ mid: 2 }),
    ]);
    real.fire("convo_receivemessage", roomMessage({ mid: 3 }));
    await settle();
    expect(a.status).toBe("ready");
    expect(a.messages.map((m) => m.mid)).toEqual([1, 2, 3]);

    // Tab b opens it later: no new socket or join, and it gets all of it
    const b = client("b");
    b.connect();
    await settle();
    expect(sockets).toHaveLength(1);
    expect(real.acked.filter(([e]) => e === "convo_join")).toHaveLength(1);
    expect(b.status).toBe("ready");
    expect(b.messages.map((m) => m.mid)).toEqual([1, 2, 3]);
    expect(b.messages.every((m) => m.quiet)).toBe(true);
    expect(b.onlineCount).toBe(2);

    // Live messages reach both; b can send
    real.fire("convo_receivemessage", roomMessage({ mid: 4 }));
    await settle();
    expect(b.messages.at(-1)?.mid).toBe(4);
    expect(b.messages.at(-1)?.quiet).toBeUndefined();
    await b.send("hi all");
    expect(real.acked.at(-1)).toEqual([
      "convo_newmessage",
      { partyID: -1, message: "hi all", requestId: "b-req" },
    ]);

    // a closes the room: b takes the socket over, with its history
    a.disconnect();
    await settle();
    expect(real.connected).toBe(false);
    expect(sockets).toHaveLength(2);
    sockets[1].open();
    sockets[1].fire("convo_ready", { user: ME, bootId: "boot-1" });
    await settle();
    expect(b.status).toBe("ready");
    expect(b.messages.map((m) => m.mid)).toEqual([1, 2, 3, 4]);
  });
});
