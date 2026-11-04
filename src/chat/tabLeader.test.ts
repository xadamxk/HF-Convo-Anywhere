import { FakeActivity } from "../test-utils/FakeActivity";
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
      { type: "leader", visible: true, v: 1, from: "a", epoch: 1000 },
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

  describe("following the user", () => {
    const joined: TabLeader[] = [];
    beforeEach(() => {
      jest.useFakeTimers({
        doNotFake: ["queueMicrotask", "setImmediate", "nextTick"],
      });
    });
    afterEach(() => {
      joined.splice(0).forEach((leader) => leader.leave());
      jest.useRealTimers();
    });

    const activeTab = (
      tabId: string,
      activity: FakeActivity,
      whenIdle?: () => Promise<void>
    ) => {
      const leader = new TabLeader({
        name: NAME,
        locks,
        createChannel: bus.create,
        tabId,
        activity,
        whenIdle,
        random: () => 0,
      });
      joined.push(leader);
      return leader;
    };

    /** a leads while hidden; b follows, hidden. */
    const hiddenLeader = async (whenIdle?: () => Promise<void>) => {
      const aActivity = new FakeActivity(false);
      const bActivity = new FakeActivity(false);
      const a = activeTab("a", aActivity, whenIdle);
      a.join();
      await flush();
      const b = activeTab("b", bActivity);
      b.join();
      await flush();
      return { a, b, aActivity, bActivity };
    };

    /** Move time on a second at a time, delivering messages as it goes. */
    const advance = async (ms: number) => {
      for (let left = ms; left > 0; left -= 1000) {
        jest.advanceTimersByTime(Math.min(1000, left));
        await flush();
      }
    };

    it("hands the lead to the tab the user looks at, once they've stayed", async () => {
      const { a, b, bActivity } = await hiddenLeader();
      bActivity.set(true);
      await advance(1000);
      expect(b.isLeader).toBe(false);

      await advance(600);
      expect(bus.ofType(NAME, "handoff-request")).toHaveLength(1);
      expect(b.isLeader).toBe(true);
      expect(a.role).toBe("follower");
      expect(a.leader?.tabId).toBe("b");
    });

    it("ignores a quick look at another tab", async () => {
      const { b, bActivity } = await hiddenLeader();
      bActivity.set(true);
      await advance(800);
      bActivity.set(false);
      await advance(5000);

      expect(b.isLeader).toBe(false);
      expect(bus.ofType(NAME, "handoff-request")).toHaveLength(0);
    });

    it("keeps the lead in a visible tab", async () => {
      const { a, b, aActivity, bActivity } = await hiddenLeader();
      aActivity.set(true, false); // visible, e.g. a window beside this one
      await flush();
      bActivity.set(true);
      await advance(10000);

      expect(a.isLeader).toBe(true);
      expect(b.isLeader).toBe(false);
    });

    it("asks as soon as the leader is hidden if the user is already here", async () => {
      const aActivity = new FakeActivity(true);
      const a = activeTab("a", aActivity);
      a.join();
      await flush();
      const bActivity = new FakeActivity(true);
      const b = activeTab("b", bActivity);
      b.join();
      await advance(2000);
      expect(a.isLeader).toBe(true);

      aActivity.set(false);
      await flush();
      expect(b.isLeader).toBe(true);
    });

    it("finishes the leader's work in flight before handing over", async () => {
      let finish!: () => void;
      const idle = new Promise<void>((resolve) => (finish = resolve));
      const { a, b, bActivity } = await hiddenLeader(() => idle);
      bActivity.set(true);
      await advance(1600);

      expect(a.isLeader).toBe(true);
      expect(a.handingOff).toBe(true);
      finish();
      await flush();
      expect(b.isLeader).toBe(true);
      expect(a.handingOff).toBe(false);
    });

    it("hands over anyway when the work takes too long", async () => {
      const { b, bActivity } = await hiddenLeader(() => new Promise(() => {}));
      bActivity.set(true);
      await advance(1600);
      expect(b.isLeader).toBe(false);
      await advance(5000);
      expect(b.isLeader).toBe(true);
    });

    it("takes the lead when a hidden leader doesn't answer", async () => {
      const { a, b, bActivity } = await hiddenLeader();
      // a stops answering (frozen), but holds the lock
      (a as any).onHandoffRequest = () => undefined;
      bActivity.set(true);
      await advance(1600);
      expect(b.isLeader).toBe(false);

      await advance(6000);
      expect(b.isLeader).toBe(true);
    });

    it("lets the active tab take over when the leader's page goes, not the next in line", async () => {
      const a = activeTab("a", new FakeActivity(false));
      const b = activeTab("b", new FakeActivity(false));
      const c = activeTab("c", new FakeActivity(true));
      [a, b, c].forEach((t) => t.join());
      await flush();
      // c is visible and focused, but a hasn't been hidden... until it goes
      a.leave();
      await flush();

      expect(c.isLeader).toBe(true);
      expect(b.isLeader).toBe(false);
    });

    it("takes over from a leader that went quiet: soon when visible, much later when hidden", async () => {
      const { a, b, bActivity } = await hiddenLeader();
      // a is frozen: no more heartbeats, lock still held
      const frozen = a as any;
      clearInterval(frozen.heartbeatTimer);
      frozen.post = () => undefined;

      await advance(60000);
      expect(b.isLeader).toBe(false); // hidden: browsers slow its timers too

      bActivity.set(true, false); // visible, not focused: no handover asked
      await advance(4000);
      expect(b.isLeader).toBe(true);
    });

    it("waits five minutes before a hidden tab takes over a quiet leader", async () => {
      const { a, b } = await hiddenLeader();
      const frozen = a as any;
      clearInterval(frozen.heartbeatTimer);
      frozen.post = () => undefined;

      await advance(4 * 60000);
      expect(b.isLeader).toBe(false);
      await advance(62000);
      expect(b.isLeader).toBe(true);
    });

    it("hears a busy hidden leader's heartbeat and leaves it be", async () => {
      const { a, b } = await hiddenLeader();
      await advance(10 * 60000);
      expect(a.isLeader).toBe(true);
      expect(b.isLeader).toBe(false);
    });
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
