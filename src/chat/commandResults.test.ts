import {
  CommandResults,
  parseCommandResult,
  renderCommandResult,
  RESULT_EVENTS,
  showCommandResult,
} from "./commandResults";

describe("parseCommandResult", () => {
  it("reads the three result events", () => {
    expect(RESULT_EVENTS).toEqual([
      "convo_flip_result",
      "convo_jackpot_result",
      "convo_coin_result",
    ]);
    expect(
      parseCommandResult("convo_flip_result", {
        mid: "12",
        win: 1,
        outcome: "Heads",
        balance: "99.5",
      })
    ).toEqual({
      mid: 12,
      result: { kind: "flip", win: true, outcome: "Heads", balance: 99.5 },
    });
    expect(
      parseCommandResult("convo_jackpot_result", {
        mid: 3,
        success: true,
        bytesWon: 1200,
        balance: 1300,
        pot: 25,
      })?.result
    ).toEqual({ kind: "jackpot", won: 1200, balance: 1300, pot: 25 });
    expect(
      parseCommandResult("convo_coin_result", {
        mid: 4,
        name: "Bitcoin",
        price: 65000.12,
        daychange: 2.5,
      })?.result
    ).toEqual({
      kind: "price",
      name: "Bitcoin",
      price: "65000.12",
      change: 2.5,
    });
  });

  it("names jackpot errors as jackpot.js does", () => {
    const error = (message: string) =>
      parseCommandResult("convo_jackpot_result", {
        mid: 1,
        success: false,
        message,
      })?.result;
    expect(error("already_playing")).toEqual({
      kind: "jackpot-error",
      error: "Already Playing",
    });
    expect(error("max_plays_exceeded")).toMatchObject({
      error: "Max Plays: 100",
    });
    expect(error("something_new")).toMatchObject({ error: "Unknown Error" });
  });

  it("ignores other events and results without a message id", () => {
    expect(parseCommandResult("convo_error", { mid: 1 })).toBeNull();
    expect(parseCommandResult("convo_flip_result", { win: true })).toBeNull();
    expect(parseCommandResult("convo_flip_result", null)).toBeNull();
  });
});

describe("CommandResults", () => {
  it("keeps the newest results up to its limit", () => {
    const results = new CommandResults(2);
    const flip = {
      kind: "flip" as const,
      win: true,
      outcome: "Heads",
      balance: 1,
    };
    results.set(1, flip);
    results.set(2, flip);
    results.set(3, flip);
    expect(results.get(1)).toBeUndefined();
    expect(results.get(3)).toBe(flip);
    results.clear();
    expect(results.get(3)).toBeUndefined();
  });
});

describe("renderCommandResult", () => {
  it("shows a flip's outcome and balance, marked won or lost", () => {
    const card = renderCommandResult({
      kind: "flip",
      win: false,
      outcome: "tails",
      balance: 1234.9,
    });
    expect(card.className).toBe("hfx-chat-result hfx-chat-result-loss");
    expect(card.textContent).toBe("Result:TailsLost · Balance:β1,234");
  });

  it("shows jackpot winnings only when there are some", () => {
    const won = renderCommandResult({
      kind: "jackpot",
      won: 50,
      balance: 75,
      pot: 0,
    });
    expect(won.textContent).toContain("Won:+50");
    expect(won.classList).toContain("hfx-chat-result-win");
    const lost = renderCommandResult({
      kind: "jackpot",
      won: 0,
      balance: 75,
      pot: 900,
    });
    expect(lost.textContent).toBe("Balance:β75Pot:β900");
  });

  it("shows a price with its 24h change", () => {
    const card = renderCommandResult({
      kind: "price",
      name: "<b>Bitcoin</b>",
      price: "65000",
      change: 1.006,
    });
    // Names are text, never markup
    expect(card.querySelector("b")).toBeNull();
    expect(card.textContent).toBe(
      "<b>Bitcoin</b>USD Value:$6500024h Change:+1.01%"
    );
  });

  it("replaces a line's earlier result", () => {
    const line = document.createElement("div");
    showCommandResult(line, {
      kind: "jackpot-error",
      error: "Already Playing",
    });
    showCommandResult(line, { kind: "jackpot", won: 0, balance: 1, pot: 2 });
    expect(line.querySelectorAll(".hfx-chat-result")).toHaveLength(1);
    expect(line.textContent).toBe("Balance:β1Pot:β2");
  });
});
