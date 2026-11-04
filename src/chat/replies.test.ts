import {
  createReplyQuote,
  findReplyTarget,
  ReplyBar,
  replyRequestId,
  replyTarget,
  withoutLeadingMention,
} from "./replies";

const ORIGIN = "https://hackforums.net";
const V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("replyRequestId / replyTarget", () => {
  it("round-trips the replied-to mid in a valid v4 UUID", () => {
    for (const mid of [1, 16693, 123456789, 2 ** 48 - 1]) {
      const id = replyRequestId(mid);
      expect(id).toMatch(V4);
      expect(replyTarget(id)).toBe(mid);
    }
  });

  it("is random per send", () => {
    expect(replyRequestId(5)).not.toBe(replyRequestId(5));
    expect(replyRequestId(5, () => "0123456789ab")).toBe(
      "01234567-89ab-4e9c-a7f1-000000000005"
    );
  });

  it("rejects mids it can't carry", () => {
    for (const mid of [0, -1, 1.5, 2 ** 48, NaN])
      expect(() => replyRequestId(mid)).toThrow(RangeError);
  });

  it("treats ordinary requestIds as no reply", () => {
    expect(replyTarget(undefined)).toBeNull();
    expect(replyTarget("3eaa86ad-e16a-4997-ba2a-ff4ea8f9f98f")).toBeNull();
    expect(replyTarget("01234567-89ab-4e9c-a7f1-000000000000")).toBeNull();
    expect(replyTarget("garbage")).toBeNull();
  });
});

describe("findReplyTarget", () => {
  const messages = [
    { mid: 10, requestId: "a" },
    { mid: 11, requestId: replyRequestId(10) },
    { mid: 12, requestId: replyRequestId(13) },
    { mid: 13, requestId: replyRequestId(99) },
  ];

  it("finds an earlier loaded message", () => {
    expect(findReplyTarget(messages[1], messages)).toBe(messages[0]);
  });

  it("ignores later or missing targets, and usable() rejects", () => {
    expect(findReplyTarget(messages[2], messages)).toBeUndefined();
    expect(findReplyTarget(messages[3], messages)).toBeUndefined();
    expect(findReplyTarget(messages[0], messages)).toBeUndefined();
    expect(findReplyTarget(messages[1], messages, () => false)).toBeUndefined();
  });
});

describe("withoutLeadingMention", () => {
  const nova = { uid: 20, username: "Nova" };

  it("drops a leading profile link (how HF sends @name@)", () => {
    expect(
      withoutLeadingMention(
        `${ORIGIN}/member.php?action=profile&uid=20 hey there`,
        nova,
        ORIGIN
      )
    ).toBe("hey there");
    expect(
      withoutLeadingMention(
        `https://www.hackforums.net/member.php?uid=20&action=profile: yes`,
        nova,
        ORIGIN
      )
    ).toBe("yes");
  });

  it("drops a leading @name@", () => {
    expect(withoutLeadingMention("@nova@ hi", nova, ORIGIN)).toBe("hi");
  });

  it("keeps other text as sent", () => {
    for (const text of [
      "hi @Nova@",
      `${ORIGIN}/member.php?action=profile&uid=21 hi`,
      `${ORIGIN}/showthread.php?tid=20 hi`,
      // Nothing but the mention
      "@Nova@",
    ])
      expect(withoutLeadingMention(text, nova, ORIGIN)).toBe(text);
  });
});

describe("createReplyQuote", () => {
  it("shows @name: and a one-line preview, and jumps on click", () => {
    const onClick = jest.fn();
    const quote = createReplyQuote(
      { uid: 20, text: "Hey   User B\nhow are you" },
      { uid: 20, username: "Nova", avatar: "", lastActive: 0, group: 46 },
      ORIGIN,
      onClick
    );
    expect(quote.textContent).toBe("@Nova:Hey User B how are you");
    expect(quote.querySelector(".group46")?.textContent).toBe("Nova");
    quote.click();
    expect(onClick).toHaveBeenCalled();
  });

  it("names images", () => {
    const quote = createReplyQuote(
      {
        uid: 3,
        text: "",
        image: { type: "png", data: "", width: 1, height: 1 },
      },
      undefined,
      ORIGIN,
      () => undefined
    );
    expect(quote.textContent).toBe("@User 3:[Image]");
  });
});

describe("ReplyBar", () => {
  it("shows the pending reply until cleared", () => {
    const bar = new ReplyBar();
    expect(bar.root.hidden).toBe(true);
    bar.set({ mid: 7, uid: 20 });
    expect(bar.root.hidden).toBe(false);
    expect(bar.root.textContent).toContain("Replying to User 20");
    expect(bar.current?.mid).toBe(7);
    bar.root.querySelector("button")!.click();
    expect(bar.current).toBeNull();
    expect(bar.root.hidden).toBe(true);
  });
});
