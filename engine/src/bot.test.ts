import { describe, expect, it } from "vitest";
import { createGame } from "./state.js";
import { applyAction } from "./actions.js";
import { computeBotStep } from "./bot.js";

describe("bot", () => {
  function botGame() {
    return createGame("BOTS", [
      { id: "a", name: "A", color: "red", isHost: false, connected: true, isBot: true },
      { id: "b", name: "B", color: "blue", isHost: false, connected: true, isBot: true },
      { id: "c", name: "C", color: "white", isHost: false, connected: true, isBot: true },
    ]);
  }

  it("drives an all-bot game to a winner without stalling", () => {
    const game = botGame();
    let steps = 0;
    while (game.phase !== "ended" && steps < 100000) {
      const step = computeBotStep(game);
      if (!step) break; // would only happen if no bot owes an action
      const res = applyAction(game, step.playerId, step.action);
      if (!res.ok) applyAction(game, step.playerId, { type: "endTurn" });
      steps++;
    }
    expect(game.phase).toBe("ended");
    expect(game.winner).toBeTruthy();
    // Sanity: the winner actually has the points.
    const winner = game.players.find((p) => p.id === game.winner)!;
    const vp =
      Object.values(game.buildings).filter((b) => b.owner === winner.id && b.type === "city").length * 2 +
      Object.values(game.buildings).filter((b) => b.owner === winner.id && b.type === "settlement").length +
      (game.longestRoadHolder === winner.id ? 2 : 0) +
      (game.largestArmyHolder === winner.id ? 2 : 0) +
      winner.devCards.filter((c) => c.type === "victory").length;
    expect(vp).toBeGreaterThanOrEqual(10);
  });

  it("completes setup before the main game", () => {
    const game = botGame();
    let steps = 0;
    while (game.setup !== null && steps < 1000) {
      const step = computeBotStep(game)!;
      applyAction(game, step.playerId, step.action);
      steps++;
    }
    expect(game.setup).toBeNull();
    expect(game.phase).toBe("roll");
    // Every bot placed 2 settlements + 2 roads.
    for (const p of game.players) {
      const settlements = Object.values(game.buildings).filter((b) => b.owner === p.id).length;
      const roads = Object.values(game.roads).filter((o) => o === p.id).length;
      expect(settlements).toBe(2);
      expect(roads).toBe(2);
    }
  });
});
