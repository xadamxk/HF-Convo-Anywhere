import { FakeBroadcastBus } from "../test-utils/FakeBroadcastBus";
import { FakeLocks } from "../test-utils/FakeLocks";
import { LeaderInfo, LeaderRole, TabLeader, TabMessage } from "./tabLeader";

const NAME = "hfca-socket:convo:1";

/** Let queued lock grants and channel messages run. */
const flush = async () => {
  for (let i = 0; i < 5; i++)
    await new Promise((resolve) =>
      jest.requireActual("timers").setImmediate(resolve)
    );
};

describe("TabLeader", () => {
  let locks: FakeLocks;
  let bus: FakeBroadcastBus;
  let clock: number;

  beforeEach(() => {
    locks = new FakeLocks();
    bus = new FakeBroadcastBus();
    clock = 1000;
  });

  const tab = (tabId: string) => {
    const leader = new TabLeader({
      name: NAME,
      locks,
      createChannel: bus.create,
      tabId,
      now: () => clock,
    });
    const roles: LeaderRole[] = [];
    const leaders: (LeaderInfo | null)[] = [];
    const messages: TabMessage[] = [];
    leader.on("role", (role) => roles.push(role));
    leader.on("leader", (info) => leaders.push(info));
    leader.on("message", (message) => messages.push(message));
    return { leader, roles, leaders, messages };
  };

  const leadersOf = (...tabs: { leader: TabLeader }[]) =>
    tabs.filter((t) => t.leader.isLeader).map((t) => t.leader.tabId);

  it("leads when it's the only tab", async () => {
    const a = tab("a");
    a.leader.join();
    expect(a.leader.role).toBe("follower");
    await flush();

    expect(a.roles).toEqual(["follower", "leader"]);
    expect(a.leader.leader).toEqual({ tabId: "a", epoch: 1000 });
    expect(bus.ofType(NAME, "leader")).toEqual([
      { type: "leader", v: 1, from: "a", epoch: 1000 },
    ]);
  });

  it("picks one leader among many tabs, and they all know it", async () => {
    const tabs = ["a", "b", "c"].map(tab);
    tabs.forEach((t) => t.leader.join());
    await flush();

    expect(leadersOf(...tabs)).toEqual(["a"]);
    for (const t of tabs) {
      expect(t.leader.leader).toEqual({ tabId: "a", epoch: 1000 });
    }
    expect(tabs[1].leader.role).toBe("follower");
    expect(locks.waiting(NAME)).toBe(2);
  });

  it("tells a tab that joins later who leads", async () => {
    const a = tab("a");
    a.leader.join();
    await flush();
    const b = tab("b");
    b.leader.join();
    await flush();

    expect(b.leader.leader).toEqual({ tabId: "a", epoch: 1000 });
    expect(b.leaders).toEqual([{ tabId: "a", epoch: 1000 }]);
  });

  it("hands the lead to the next tab in line when the leader leaves", async () => {
    const [a, b, c] = ["a", "b", "c"].map(tab);
    [a, b, c].forEach((t) => t.leader.join());
    await flush();

    clock = 2000;
    a.leader.leave();
    expect(a.leader.role).toBe("idle");
    await flush();

    expect(leadersOf(a, b, c)).toEqual(["b"]);
    expect(c.leader.leader).toEqual({ tabId: "b", epoch: 2000 });
    // c heard a's bye before b's announcement
    expect(c.leaders).toEqual([
      { tabId: "a", epoch: 1000 },
      null,
      { tabId: "b", epoch: 2000 },
    ]);
  });

  it("takes a tab that leaves while waiting out of line", async () => {
    const [a, b, c] = ["a", "b", "c"].map(tab);
    [a, b, c].forEach((t) => t.leader.join());
    await flush();

    b.leader.leave();
    a.leader.leave();
    await flush();

    expect(leadersOf(a, b, c)).toEqual(["c"]);
    expect(b.roles).toEqual(["follower", "idle"]);
  });

  it("leads with a newer epoch than the last leader even if the clock disagrees", async () => {
    const [a, b] = ["a", "b"].map(tab);
    [a, b].forEach((t) => t.leader.join());
    await flush();

    clock = 500;
    a.leader.leave();
    await flush();

    expect(b.leader.leader).toEqual({ tabId: "b", epoch: 1001 });
  });

  it("lets a follower steal the lead; the old leader follows and waits again", async () => {
    const [a, b, c] = ["a", "b", "c"].map(tab);
    [a, b, c].forEach((t) => t.leader.join());
    await flush();

    clock = 3000;
    c.leader.steal();
    await flush();

    expect(leadersOf(a, b, c)).toEqual(["c"]);
    expect(a.roles).toEqual(["follower", "leader", "follower"]);
    for (const t of [a, b, c]) {
      expect(t.leader.leader).toEqual({ tabId: "c", epoch: 3000 });
    }
    // a is back in line, behind b
    c.leader.leave();
    await flush();
    expect(leadersOf(a, b, c)).toEqual(["b"]);
  });

  it("ignores a stale leader's announcement", async () => {
    const [a, b] = ["a", "b"].map(tab);
    [a, b].forEach((t) => t.leader.join());
    await flush();
    clock = 3000;
    b.leader.steal();
    await flush();

    // A late "leader" from a's old epoch
    bus
      .create(NAME)
      .postMessage({ v: 1, type: "leader", from: "a", epoch: 1000 });
    await flush();

    expect(b.leader.leader).toEqual({ tabId: "b", epoch: 3000 });
    expect(a.leader.leader).toEqual({ tabId: "b", epoch: 3000 });
  });

  it("resigns to the next tab in line and queues behind it", async () => {
    const [a, b, c] = ["a", "b", "c"].map(tab);
    [a, b, c].forEach((t) => t.leader.join());
    await flush();

    clock = 4000;
    a.leader.resign();
    expect(a.leader.role).toBe("follower");
    await flush();
    expect(leadersOf(a, b, c)).toEqual(["b"]);

    clock = 5000;
    b.leader.resign();
    await flush();
    expect(leadersOf(a, b, c)).toEqual(["c"]);

    clock = 6000;
    c.leader.resign();
    await flush();
    expect(leadersOf(a, b, c)).toEqual(["a"]);
    expect(b.leader.leader).toEqual({ tabId: "a", epoch: 6000 });
  });

  it("passes other messages on, stamped with the leader's epoch", async () => {
    const [a, b] = ["a", "b"].map(tab);
    [a, b].forEach((t) => t.leader.join());
    await flush();

    a.leader.post({ type: "event", name: "convo_ready" });
    b.leader.post({ type: "request", id: 1 });
    await flush();

    expect(b.messages).toEqual([
      { type: "event", name: "convo_ready", v: 1, from: "a", epoch: 1000 },
    ]);
    expect(b.leader.isFromLeader(b.messages[0])).toBe(true);
    expect(a.messages).toEqual([{ type: "request", id: 1, v: 1, from: "b" }]);
    expect(a.leader.isFromLeader(a.messages[0])).toBe(false);
  });

  it("stops stamping its epoch once another tab steals the lead", async () => {
    const [a, b] = ["a", "b"].map(tab);
    [a, b].forEach((t) => t.leader.join());
    await flush();

    clock = 2000;
    b.leader.steal();
    await flush();
    a.leader.post({ type: "event", name: "late" });
    await flush();

    expect(b.messages[0]).not.toHaveProperty("epoch");
    expect(b.leader.isFromLeader(b.messages[0])).toBe(false);
  });

  it("ignores its own messages, other versions and junk", async () => {
    const a = tab("a");
    a.leader.join();
    await flush();
    const other = bus.create(NAME);
    other.postMessage({ v: 2, type: "event", from: "x" });
    other.postMessage({ v: 1, type: "event", from: "a" });
    other.postMessage("junk");
    other.postMessage(null);
    other.postMessage({ v: 1, type: 5, from: "x" });
    await flush();

    expect(a.messages).toEqual([]);
  });

  it("can join again after leaving", async () => {
    const [a, b] = ["a", "b"].map(tab);
    a.leader.join();
    await flush();
    a.leader.leave();
    b.leader.join();
    await flush();
    a.leader.join();
    await flush();

    expect(leadersOf(a, b)).toEqual(["b"]);
    expect(a.leader.leader?.tabId).toBe("b");
    expect(locks.waiting(NAME)).toBe(1);
  });

  it("doesn't post after leaving", async () => {
    const a = tab("a");
    a.leader.join();
    await flush();
    a.leader.leave();
    const before = bus.posted.length;
    a.leader.post({ type: "event" });
    expect(bus.posted.length).toBe(before);
  });
});
