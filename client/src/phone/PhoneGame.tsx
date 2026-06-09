import { useEffect, useMemo, useRef, useState } from "react";
import type {
  DevCardType,
  GameStatePublic,
  LogEntry,
  PrivateState,
  Resource,
} from "@catan/shared";
import { RESOURCES } from "@catan/shared";
import { sendAction } from "../net/socket.js";
import { Board } from "../game/Board.js";
import { BuildCosts } from "../game/BuildCosts.js";
import { EventBanner } from "../game/EventBanner.js";
import { FinalStandings } from "../game/FinalStandings.js";
import { TurnTimer } from "../game/TurnTimer.js";
import { PLAYER_FILL, RESOURCE_EMOJI } from "../game/theme.js";
import {
  legalCities,
  legalRoads,
  legalRobberHexes,
  legalSettlements,
} from "../game/legal.js";
import { cueDiscard, cueSeven, cueTrade, cueYourTurn } from "../game/feedback.js";
import { DiscardPanel } from "./panels/DiscardPanel.js";
import { TradePanels } from "./panels/TradePanels.js";
import { DevMenu } from "./panels/DevMenu.js";

interface Props {
  game: GameStatePublic;
  me: PrivateState | null;
  myId: string;
}

type Selecting = "road" | "settlement" | "city" | null;

export function PhoneGame({ game, me, myId }: Props) {
  const current = game.players[game.currentPlayerIndex];
  const myTurn = current.id === myId;
  const mePublic = game.players.find((p) => p.id === myId);

  const [selecting, setSelecting] = useState<Selecting>(null);
  const [robberHex, setRobberHex] = useState<string | null>(null);
  const [showDev, setShowDev] = useState(false);
  const [showTrade, setShowTrade] = useState(false);

  // Animate the resources this player gains on each dice roll.
  const rollGain = useRollGain(game, me);

  // Haptic + sound cues for moments that need attention on a pocketed phone.
  useFeedback(game, myId, myTurn);

  // Track which swipe page is showing (for the dots indicator).
  const [page, setPage] = useState(0);
  const [endSeen, setEndSeen] = useState(false);
  const PAGES = ["Play", "Board", "Costs", "Log"];
  const winner = game.winner ? game.players.find((p) => p.id === game.winner) : null;

  // Reset transient UI when the turn or phase changes.
  useEffect(() => {
    setSelecting(null);
    setRobberHex(null);
    setShowDev(false);
    setShowTrade(false);
  }, [game.phase, game.currentPlayerIndex]);

  const discardNeeded = game.pendingDiscards[myId] ?? 0;

  // --- Placement config -----------------------------------------------------
  const placement = useMemo(() => {
    if (game.phase === "setup" && myTurn && game.setup) {
      if (game.setup.needs === "settlement") {
        return {
          title: "Place your settlement",
          selectable: "vertex" as const,
          highlight: legalSettlements(game, myId, false),
          onSelect: (id: string) => sendAction({ type: "placeSettlement", vertexId: id }),
          cancelable: false,
        };
      }
      return {
        title: "Place your road",
        selectable: "edge" as const,
        highlight: legalRoads(game, myId, game.setup.lastSettlement),
        onSelect: (id: string) => sendAction({ type: "placeRoad", edgeId: id }),
        cancelable: false,
      };
    }

    if (game.phase === "moveRobber" && myTurn && !robberHex) {
      return {
        title: "Move the robber",
        selectable: "hex" as const,
        highlight: legalRobberHexes(game),
        onSelect: (id: string) => setRobberHex(id),
        cancelable: false,
      };
    }

    if (myTurn && (game.phase === "main" || game.phase === "roll") && game.freeRoads > 0) {
      return {
        title: `Place a free road (${game.freeRoads} left)`,
        selectable: "edge" as const,
        highlight: legalRoads(game, myId),
        onSelect: (id: string) => sendAction({ type: "placeRoad", edgeId: id }),
        cancelable: false,
      };
    }

    if (myTurn && game.phase === "main" && selecting) {
      if (selecting === "road")
        return {
          title: "Build a road",
          selectable: "edge" as const,
          highlight: legalRoads(game, myId),
          onSelect: (id: string) => {
            sendAction({ type: "buildRoad", edgeId: id });
            setSelecting(null);
          },
          cancelable: true,
        };
      if (selecting === "settlement")
        return {
          title: "Build a settlement",
          selectable: "vertex" as const,
          highlight: legalSettlements(game, myId, true),
          onSelect: (id: string) => {
            sendAction({ type: "buildSettlement", vertexId: id });
            setSelecting(null);
          },
          cancelable: true,
        };
      return {
        title: "Upgrade to a city",
        selectable: "vertex" as const,
        highlight: legalCities(game, myId),
        onSelect: (id: string) => {
          sendAction({ type: "buildCity", vertexId: id });
          setSelecting(null);
        },
        cancelable: true,
      };
    }
    return null;
  }, [game, myId, myTurn, selecting, robberHex]);

  // --- Forced: discard ------------------------------------------------------
  if (discardNeeded > 0 && me) {
    return <DiscardPanel need={discardNeeded} resources={me.resources} />;
  }

  // --- Robber: choose steal target -----------------------------------------
  if (game.phase === "moveRobber" && myTurn && robberHex) {
    const hex = game.board.hexes.find((h) => h.id === robberHex)!;
    const victims = new Set<string>();
    for (const vid of hex.corners) {
      const b = game.buildings[vid];
      if (b && b.owner !== myId) victims.add(b.owner);
    }
    const targets = game.players.filter((p) => victims.has(p.id) && p.resourceTotal > 0);
    return (
      <div className="action-screen">
        <h3>Steal a card</h3>
        {targets.length === 0 ? (
          <>
            <p className="muted">No one to steal from here.</p>
            <button
              className="primary big"
              onClick={() => {
                sendAction({ type: "moveRobber", hexId: robberHex, stealFrom: null });
                setRobberHex(null);
              }}
            >
              Confirm robber move
            </button>
          </>
        ) : (
          <div className="target-list">
            <button
              className="primary big"
              onClick={() => {
                const t = targets[Math.floor(Math.random() * targets.length)];
                sendAction({ type: "moveRobber", hexId: robberHex, stealFrom: t.id });
                setRobberHex(null);
              }}
            >
              🎲 Steal from a random player
            </button>
            {targets.map((t) => (
              <button
                key={t.id}
                className="target"
                style={{ borderColor: PLAYER_FILL[t.color] }}
                onClick={() => {
                  sendAction({ type: "moveRobber", hexId: robberHex, stealFrom: t.id });
                  setRobberHex(null);
                }}
              >
                Steal from {t.name} ({t.resourceTotal} cards)
              </button>
            ))}
          </div>
        )}
        <button className="link" onClick={() => setRobberHex(null)}>
          ← pick a different hex
        </button>
      </div>
    );
  }

  // --- Board placement screen ----------------------------------------------
  if (placement) {
    return (
      <div className="action-screen board-screen">
        <h3>{placement.title}</h3>
        <div className="mini-board">
          <Board
            state={game}
            selectable={placement.selectable}
            highlight={placement.highlight}
            onSelect={placement.onSelect}
          />
        </div>
        {placement.highlight.size === 0 && <p className="muted">No legal spots available.</p>}
        {game.phase === "setup" && game.setup?.needs === "road" && myTurn && (
          <button className="link" onClick={() => sendAction({ type: "undoSetup" })}>
            ← Undo settlement
          </button>
        )}
        {placement.cancelable && (
          <button className="link" onClick={() => setSelecting(null)}>
            Cancel
          </button>
        )}
      </div>
    );
  }

  // --- Default: swipe between [play], [board], [log] -----------------------
  return (
    <>
      {rollGain && <RollGainToast gain={rollGain} />}
      <EventBanner log={game.log} />
      <div
        className="swipe"
        onScroll={(e) =>
          setPage(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))
        }
      >
        <section className="swipe-page">
          <PlayPanel
            game={game}
            me={me}
            myId={myId}
            current={current}
            myTurn={myTurn}
            setSelecting={setSelecting}
            setShowDev={setShowDev}
            setShowTrade={setShowTrade}
          />
        </section>
        <section className="swipe-page board-page">
          <div className="phone-board-view">
            <Board state={game} animate />
          </div>
          <div className="board-actions">
            <MiniHand me={me} />
            <TurnTimer endsAt={game.turnEndsAt} />
            {myTurn && game.phase === "roll" && (
              <button className="primary" onClick={() => sendAction({ type: "rollDice" })}>
                🎲 Roll
              </button>
            )}
            {myTurn && game.phase === "main" && (
              <button className="end" onClick={() => sendAction({ type: "endTurn" })}>
                End turn ⏭
              </button>
            )}
          </div>
          <LastActivity log={game.log} />
        </section>
        <section className="swipe-page costs-page">
          <BuildCosts />
        </section>
        <section className="swipe-page log-page">
          <div className="phone-log-head">Game log</div>
          <div className="log phone-log">
            {[...game.log].reverse().map((l) => (
              <div key={l.id} className={`log-line ${l.major ? "major" : ""}`}>
                {l.text}
              </div>
            ))}
          </div>
        </section>
      </div>
      <div className="swipe-dots">
        {PAGES.map((name, i) => (
          <span key={name} className={`swipe-dot ${i === page ? "on" : ""}`}>
            <i />
            {i === page && <em>{name}</em>}
          </span>
        ))}
      </div>

      {showDev && me && <DevMenu game={game} me={me} onClose={() => setShowDev(false)} />}
      {showTrade && me && (
        <TradeBuilder game={game} me={me} onClose={() => setShowTrade(false)} />
      )}

      {winner && !endSeen && (
        <div className="end-overlay">
          <div className="end-card">
            <div className="end-title">🏆 {winner.name} wins!</div>
            {winner.id === myId && <div className="end-sub">That's you — nice game.</div>}
            <FinalStandings game={game} />
            <button className="ghost big" onClick={() => setEndSeen(true)}>
              View board
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function LastActivity({ log }: { log: LogEntry[] }) {
  const recent = [...log].slice(-3).reverse();
  return (
    <div className="last-activity">
      {recent.map((l) => (
        <div key={l.id} className={`la-line ${l.major ? "major" : ""}`}>
          {l.text}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Play panel (hand + status + actions) — page 1 of the swipe view
// ---------------------------------------------------------------------------

function PlayPanel({
  game,
  me,
  myId,
  current,
  myTurn,
  setSelecting,
  setShowDev,
  setShowTrade,
}: {
  game: GameStatePublic;
  me: PrivateState | null;
  myId: string;
  current: GameStatePublic["players"][number];
  myTurn: boolean;
  setSelecting: (s: Selecting) => void;
  setShowDev: (b: boolean) => void;
  setShowTrade: (b: boolean) => void;
}) {
  return (
    <div className="phone-game">
      <Hand game={game} me={me} myId={myId} />

      <div className="status-line">
        {myTurn ? <strong>Your turn</strong> : <span>{current.name}'s turn</span>}
        <TurnTimer endsAt={game.turnEndsAt} />
        {game.dice && (
          <span className="dice-mini">
            🎲 {game.dice[0]}+{game.dice[1]} = {game.dice[0] + game.dice[1]}
          </span>
        )}
      </div>

      {/* Trade negotiation panels (visible to proposer + responders) */}
      <TradePanels game={game} me={me} myId={myId} />

      {/* Action bar */}
      {myTurn && game.phase === "roll" && (
        <div className="action-bar">
          <button className="primary big" onClick={() => sendAction({ type: "rollDice" })}>
            🎲 Roll dice
          </button>
          {canPlayAnyDev(game, me) && (
            <button className="ghost" onClick={() => setShowDev(true)}>
              Play dev card
            </button>
          )}
        </div>
      )}

      {myTurn && game.phase === "main" && (
        <div className="action-grid">
          <button onClick={() => setSelecting("road")} disabled={!affordable(me, "road")}>
            🛣️ Road
          </button>
          <button onClick={() => setSelecting("settlement")} disabled={!affordable(me, "settlement")}>
            🏠 Settlement
          </button>
          <button onClick={() => setSelecting("city")} disabled={!affordable(me, "city")}>
            🏙️ City
          </button>
          <button onClick={() => sendAction({ type: "buyDevCard" })} disabled={!affordable(me, "devCard")}>
            ✦ Buy dev
          </button>
          <button onClick={() => setShowDev(true)} disabled={!canPlayAnyDev(game, me)}>
            Play dev
          </button>
          <button onClick={() => setShowTrade(true)}>🔁 Trade</button>
          <button className="end" onClick={() => sendAction({ type: "endTurn" })}>
            End turn ⏭
          </button>
        </div>
      )}

      {!myTurn && game.phase !== "moveRobber" && (
        <p className="muted center">Waiting for {current.name}…</p>
      )}

      <MiniScores game={game} myId={myId} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hand
// ---------------------------------------------------------------------------

function Hand({ game, me, myId }: { game: GameStatePublic; me: PrivateState | null; myId: string }) {
  const mePublic = game.players.find((p) => p.id === myId);
  const vp = (mePublic?.victoryPoints ?? 0) + (me?.hiddenVictoryPoints ?? 0);
  return (
    <div className="hand">
      <div className="hand-head">
        <span className="me-name" style={{ color: PLAYER_FILL[mePublic?.color ?? "red"] }}>
          {mePublic?.name}
        </span>
        <span className="vp-badge">{vp} VP</span>
      </div>
      <div className="resources">
        {RESOURCES.map((r) => (
          <div key={r} className={`res-card res-${r}`}>
            <span className="res-emoji">{RESOURCE_EMOJI[r]}</span>
            <span className="res-count">{me?.resources[r] ?? 0}</span>
          </div>
        ))}
      </div>
      {me && me.devCards.length > 0 && (
        <div className="dev-row">
          {summarizeDev(me).map(([type, count]) => (
            <span key={type} className="dev-chip">
              {devLabel(type)} ×{count}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function MiniHand({ me }: { me: PrivateState | null }) {
  return (
    <div className="mini-hand">
      {RESOURCES.map((r) => (
        <span key={r} className="mini-hand-item">
          {RESOURCE_EMOJI[r]} {me?.resources[r] ?? 0}
        </span>
      ))}
    </div>
  );
}

function MiniScores({ game, myId }: { game: GameStatePublic; myId: string }) {
  const myEmbargoes = game.players.find((p) => p.id === myId)?.embargoes ?? [];
  return (
    <div className="mini-scores">
      {game.players.map((p) => {
        const embargoed = myEmbargoes.includes(p.id);
        return (
          <div key={p.id} className={`mini-score ${p.id === myId ? "self" : ""}`}>
            <span className="dot" style={{ background: PLAYER_FILL[p.color] }} />
            <span className="ms-name">{p.name}</span>
            {p.longestRoad && <span title="Longest Road">🛣️</span>}
            {p.largestArmy && <span title="Largest Army">⚔️</span>}
            <span className="ms-vp">{p.victoryPoints}</span>
            {p.id !== myId && (
              <button
                className={`embargo-btn ${embargoed ? "on" : ""}`}
                title={
                  embargoed
                    ? `Lift embargo on ${p.name}`
                    : `Embargo ${p.name} — auto-reject all trades with them`
                }
                onClick={() => sendAction({ type: "setEmbargo", playerId: p.id, on: !embargoed })}
              >
                🚫
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trade builder (propose)
// ---------------------------------------------------------------------------

// Best ratio (4/3/2) this player can trade a given resource at, from the ports
// their settlements/cities touch. Mirrors the engine's bestTradeRatio.
function portRatio(game: GameStatePublic, myId: string, giveRes: Resource): number {
  let ratio = 4;
  for (const port of game.board.ports) {
    const owns = port.vertices.some((v) => game.buildings[v]?.owner === myId);
    if (!owns) continue;
    if (port.type === "any") ratio = Math.min(ratio, 3);
    else if (port.type === giveRes) ratio = Math.min(ratio, 2);
  }
  return ratio;
}

function TradeBuilder({
  game,
  me,
  onClose,
}: {
  game: GameStatePublic;
  me: PrivateState;
  onClose: () => void;
}) {
  const myId = me.playerId;
  const [tab, setTab] = useState<"bank" | "players">("bank");
  const [give, setGive] = useState<Record<Resource, number>>(zero());
  const [receive, setReceive] = useState<Record<Resource, number>>(zero());
  const [bankGive, setBankGive] = useState<Resource | null>(null);

  const adjustGive = (r: Resource, d: number) =>
    setGive((s) => ({ ...s, [r]: Math.max(0, Math.min(me.resources[r], s[r] + d)) }));
  const adjustReceive = (r: Resource, d: number) =>
    setReceive((s) => ({ ...s, [r]: Math.max(0, Math.min(9, s[r] + d)) }));

  // The resources this player can actually bank/port trade right now: they must
  // hold at least the ratio for that resource. Only these are offered.
  const bankable = RESOURCES.map((r) => ({ r, ratio: portRatio(game, myId, r) })).filter(
    ({ r, ratio }) => me.resources[r] >= ratio
  );
  const proposeValid = RESOURCES.some((r) => give[r] > 0) && RESOURCES.some((r) => receive[r] > 0);

  return (
    <div className="modal">
      <div className="modal-card">
        <h3>Trade</h3>
        <div className="trade-tabs">
          <button className={tab === "bank" ? "on" : ""} onClick={() => setTab("bank")}>
            🏦 Bank / port
          </button>
          <button className={tab === "players" ? "on" : ""} onClick={() => setTab("players")}>
            🤝 Players
          </button>
        </div>

        {tab === "bank" ? (
          <div className="bank-trade">
            {bankable.length === 0 ? (
              <p className="muted small">
                You don't have enough of any resource to trade with the bank yet (need 4, or 3/2
                with a port).
              </p>
            ) : (
              <>
                <p className="muted small">Give</p>
                <div className="bank-give-row">
                  {bankable.map(({ r, ratio }) => (
                    <button
                      key={r}
                      className={`bank-give ${bankGive === r ? "on" : ""}`}
                      onClick={() => setBankGive(r)}
                    >
                      <span className="bg-emoji">{RESOURCE_EMOJI[r]}</span>
                      <span className="bg-ratio">{ratio}:1</span>
                    </button>
                  ))}
                </div>
                {bankGive && (
                  <>
                    <p className="muted small">
                      Give {portRatio(game, myId, bankGive)} {RESOURCE_EMOJI[bankGive]} → receive
                    </p>
                    <div className="bank-receive-row">
                      {RESOURCES.filter((r) => r !== bankGive).map((r) => (
                        <button
                          key={r}
                          className="bank-receive"
                          disabled={game.bank[r] < 1}
                          onClick={() => {
                            sendAction({ type: "bankTrade", give: bankGive, receive: r });
                            onClose();
                          }}
                        >
                          {RESOURCE_EMOJI[r]}
                          {game.bank[r] < 1 && <span className="bg-out">out</span>}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
            <button className="link" onClick={onClose}>
              Cancel
            </button>
          </div>
        ) : (
          <div>
            <p className="muted small">You give</p>
            <ResRow state={give} onAdjust={adjustGive} cap={me.resources} />
            <p className="muted small">You receive</p>
            <ResRow state={receive} onAdjust={adjustReceive} />
            <div className="modal-actions">
              <button
                className="primary"
                disabled={!proposeValid}
                onClick={() => {
                  sendAction({ type: "proposeTrade", give, receive });
                  onClose();
                }}
              >
                Offer to players
              </button>
              <button className="link" onClick={onClose}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ResRow({
  state,
  onAdjust,
  cap,
}: {
  state: Record<Resource, number>;
  onAdjust: (r: Resource, d: number) => void;
  cap?: Record<Resource, number>;
}) {
  return (
    <div className="res-steppers">
      {RESOURCES.map((r) => (
        <div key={r} className="stepper">
          <span>{RESOURCE_EMOJI[r]}</span>
          <button onClick={() => onAdjust(r, -1)} disabled={state[r] <= 0}>
            −
          </button>
          <span className="stepper-val">{state[r]}</span>
          <button onClick={() => onAdjust(r, +1)} disabled={cap ? state[r] >= cap[r] : false}>
            +
          </button>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Roll-gain animation: shows the resources this player collected on each roll.
// ---------------------------------------------------------------------------

function useRollGain(game: GameStatePublic, me: PrivateState | null) {
  const prevDice = useRef<string | null>(null);
  const prevRes = useRef<Record<Resource, number> | null>(null);
  const [gain, setGain] = useState<{ items: [Resource, number][]; id: number } | null>(null);

  useEffect(() => {
    if (!me) return;
    const diceStr = game.dice ? `${game.dice[0]}-${game.dice[1]}:${game.currentPlayerIndex}` : null;
    const prev = prevRes.current;
    // A roll just happened when the dice go from cleared (null) to a value.
    const rolled = prevDice.current === null && diceStr !== null;
    if (rolled && prev) {
      const items = RESOURCES.map(
        (r) => [r, me.resources[r] - (prev[r] ?? 0)] as [Resource, number]
      ).filter(([, n]) => n > 0);
      if (items.length) {
        const id = Date.now();
        setGain({ items, id });
        window.setTimeout(() => setGain((g) => (g && g.id === id ? null : g)), 2600);
      }
    }
    prevDice.current = diceStr;
    prevRes.current = { ...me.resources };
  }, [game.dice, game.currentPlayerIndex, me]);

  return gain;
}

// Fire haptic/sound cues on the transitions a player shouldn't miss: their turn
// starting, a 7 being rolled, a discard owed, or a trade offered to them.
function useFeedback(game: GameStatePublic, myId: string, myTurn: boolean) {
  const wasMyTurn = useRef(false);
  const prevDice = useRef<string | null>(null);
  const owedDiscard = useRef(false);
  const seenTrade = useRef<string | null>(null);

  useEffect(() => {
    // Your turn just began (roll phase, freshly active).
    const startedTurn = myTurn && !wasMyTurn.current && game.phase === "roll";
    wasMyTurn.current = myTurn;
    if (startedTurn) cueYourTurn();

    // A 7 was rolled (robber about to move).
    const diceStr = game.dice ? `${game.dice[0]}-${game.dice[1]}:${game.currentPlayerIndex}` : null;
    if (diceStr && diceStr !== prevDice.current && game.dice && game.dice[0] + game.dice[1] === 7) {
      cueSeven();
    }
    prevDice.current = diceStr;

    // You now owe a discard.
    const owe = (game.pendingDiscards[myId] ?? 0) > 0;
    if (owe && !owedDiscard.current) cueDiscard();
    owedDiscard.current = owe;

    // A trade is awaiting your response.
    const t = game.pendingTrade;
    const forMe = t && t.proposer !== myId && t.responses[myId]?.status === "pending";
    if (forMe && seenTrade.current !== t.id) {
      cueTrade();
      seenTrade.current = t.id;
    }
    if (!t) seenTrade.current = null;
  }, [game, myId, myTurn]);
}

function RollGainToast({ gain }: { gain: { items: [Resource, number][]; id: number } }) {
  return (
    <div className="roll-gain" key={gain.id}>
      <span className="roll-gain-label">You collected</span>
      <div className="roll-gain-items">
        {gain.items.map(([r, n]) => (
          <span key={r} className="roll-gain-item">
            {RESOURCE_EMOJI[r]} +{n}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function zero(): Record<Resource, number> {
  return { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
}

const COST_TABLE: Record<string, Partial<Record<Resource, number>>> = {
  road: { wood: 1, brick: 1 },
  settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1 },
  city: { wheat: 2, ore: 3 },
  devCard: { sheep: 1, wheat: 1, ore: 1 },
};

function affordable(me: PrivateState | null, what: keyof typeof COST_TABLE): boolean {
  if (!me) return false;
  const cost = COST_TABLE[what];
  return RESOURCES.every((r) => me.resources[r] >= (cost[r] ?? 0));
}

function summarizeDev(me: PrivateState): [DevCardType, number][] {
  const counts = new Map<DevCardType, number>();
  for (const c of me.devCards) counts.set(c.type, (counts.get(c.type) ?? 0) + 1);
  return [...counts.entries()];
}

function devLabel(type: DevCardType): string {
  switch (type) {
    case "knight":
      return "⚔️ Knight";
    case "victory":
      return "⭐ VP";
    case "roadBuilding":
      return "🛣️ Road Building";
    case "yearOfPlenty":
      return "🎁 Year of Plenty";
    case "monopoly":
      return "💰 Monopoly";
  }
}

export function playableCount(me: PrivateState, type: DevCardType): number {
  const total = me.devCards.filter((c) => c.type === type).length;
  const fresh = me.newDevCards.filter((t) => t === type).length;
  return Math.max(0, total - fresh);
}

function canPlayAnyDev(game: GameStatePublic, me: PrivateState | null): boolean {
  if (!me) return false;
  if (game.hasPlayedDevCard) return false;
  return (["knight", "roadBuilding", "yearOfPlenty", "monopoly"] as DevCardType[]).some(
    (t) => playableCount(me, t) > 0
  );
}

export { devLabel };
