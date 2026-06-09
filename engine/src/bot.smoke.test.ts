import { describe, expect, it } from "vitest";
import { createGame } from "./state.js";
import { applyAction } from "./actions.js";
import { computeBotStep } from "./bot.js";

// A heavier smoke test than bot.test.ts: run many full all-bot games across 2,
// 3 and 4 players and assert every game ends cleanly with a legitimate winner —
// no stalls, and (critically) no bot ever emits an action the engine rejects.
// This catches rule regressions before they ship.

const COLORS = ["red", "blue", "white", "orange"] as const;

function botGame(n: number) {
  const players = Array.from({ length: n }, (_, i) => ({
    id: `bot${i}`,
    name: `Bot ${i + 1}`,
    color: COLORS[i],
    isHost: false,
    connected: true,
    isBot: true,
  }));
  return createGame(`SMK${n}`, players);
}

function playOut(n: number) {
  const game = botGame(n);
  let steps = 0;
  let illegal = 0;
  while (game.phase !== "ended" && steps < 200000) {
    const step = computeBotStep(game);
    if (!step) throw new Error(`stalled: no bot owed an action (phase ${game.phase})`);
    const res = applyAction(game, step.playerId, step.action);
    if (!res.ok) {
      illegal++;
      // Defensively end the turn so a single bad move can't wedge the test, but
      // the assertion below still fails the build if it ever happens.
      applyAction(game, step.playerId, { type: "endTurn" });
    }
    steps++;
  }
  return { game, steps, illegal };
}

describe("bot smoke test", () => {
  for (const n of [2, 3, 4]) {
    it(`drives ${n}-player all-bot games to a clean finish (x8)`, () => {
      for (let g = 0; g < 8; g++) {
        const { game, illegal } = playOut(n);
        expect(illegal, `game ${g}: bot made an illegal move`).toBe(0);
        expect(game.phase).toBe("ended");
        const winner = game.players.find((p) => p.id === game.winner)!;
        expect(winner).toBeTruthy();
        const cities = Object.values(game.buildings).filter(
          (b) => b.owner === winner.id && b.type === "city"
        ).length;
        const settlements = Object.values(game.buildings).filter(
          (b) => b.owner === winner.id && b.type === "settlement"
        ).length;
        const vp =
          cities * 2 +
          settlements +
          (game.longestRoadHolder === winner.id ? 2 : 0) +
          (game.largestArmyHolder === winner.id ? 2 : 0) +
          winner.devCards.filter((c) => c.type === "victory").length;
        expect(vp).toBeGreaterThanOrEqual(game.options.targetVictoryPoints);
      }
    });
  }
});
