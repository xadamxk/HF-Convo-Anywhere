import { ConvoAnywhere } from "./ConvoAnywhere";
import { GROUP_LIST_KEY } from "./settings";

// The private group list addition
type Testable = {
  addToGroupList(group: { gid: number; name: string }): Promise<void>;
  removeFromGroupList(gid: number): Promise<void>;
};

const stored = () =>
  (chrome.storage.local as unknown as { items: Record<string, unknown> }).items;

describe("ConvoAnywhere group list", () => {
  let feature: Testable;

  beforeEach(async () => {
    feature = new ConvoAnywhere() as unknown as Testable;
    await chrome.storage.local.set({
      [GROUP_LIST_KEY]: { groups: [{ gid: 1, name: "One" }] },
    });
  });

  it("keeps every group when several are added at once", async () => {
    const add = (group: { gid: number; name: string }) =>
      feature.addToGroupList(group);
    await Promise.all([
      add({ gid: 2, name: "Two" }),
      add({ gid: 3, name: "Three" }),
      add({ gid: 2, name: "Two" }),
    ]);
    expect(stored()[GROUP_LIST_KEY]).toEqual({
      groups: [
        { gid: 1, name: "One" },
        { gid: 2, name: "Two" },
        { gid: 3, name: "Three" },
      ],
    });
  });

  it("removes a group the user left", async () => {
    await Promise.all([
      feature.addToGroupList({ gid: 2, name: "Two" }),
      feature.removeFromGroupList(1),
    ]);
    expect(stored()[GROUP_LIST_KEY]).toEqual({
      groups: [{ gid: 2, name: "Two" }],
    });
  });
});

describe("ConvoAnywhere orphan watch", () => {
  const runtime = chrome.runtime as { id?: string };
  const watch = (onOrphaned: () => void) =>
    (
      new ConvoAnywhere() as unknown as {
        watchForOrphaning(onOrphaned: () => void): void;
      }
    ).watchForOrphaning(onOrphaned);

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    delete runtime.id;
    jest.useRealTimers();
  });

  it("notices once the extension is reloaded or updated, and only once", () => {
    runtime.id = "ext";
    const onOrphaned = jest.fn();
    watch(onOrphaned);
    jest.advanceTimersByTime(20000);
    expect(onOrphaned).not.toHaveBeenCalled();

    delete runtime.id;
    jest.advanceTimersByTime(5000);
    jest.advanceTimersByTime(20000);
    expect(onOrphaned).toHaveBeenCalledTimes(1);
  });

  it("doesn't watch outside an extension", () => {
    const onOrphaned = jest.fn();
    watch(onOrphaned);
    jest.advanceTimersByTime(20000);
    expect(onOrphaned).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe("ConvoAnywhere.start", () => {
  afterEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    window.history.replaceState(null, "", "/");
  });

  it("does nothing when logged out", async () => {
    await new ConvoAnywhere().start();
    expect(chrome.storage.local.get).not.toHaveBeenCalledWith("settings");
    expect(document.getElementById("hfx-chat-dock")).toBeNull();
  });

  it("does nothing on convo.php, where HF's own client is open", async () => {
    document.head.innerHTML = `<script>var my_post_key = "abc123";</script>`;
    document.body.innerHTML = `<div class="welcome"><a href="member.php?action=profile&uid=5">Me</a></div>`;
    window.history.replaceState(null, "", "/convo.php");
    (chrome.storage.local.get as jest.Mock).mockClear();
    await new ConvoAnywhere().start();
    expect(chrome.storage.local.get).not.toHaveBeenCalled();
    expect(document.getElementById("hfx-chat-dock")).toBeNull();
  });
});
