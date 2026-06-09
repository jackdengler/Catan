import { useState } from "react";
import type { GameStatePublic, PendingTrade, PrivateState, Resource, ResourceCount } from "@catan/shared";
import { RESOURCES } from "@catan/shared";
import { sendAction } from "../../net/socket.js";
import { RESOURCE_EMOJI, PLAYER_FILL } from "../../game/theme.js";

function resList(c?: ResourceCount): string {
  if (!c) return "nothing";
  const parts = RESOURCES.filter((r) => c[r] > 0).map((r) => `${c[r]} ${RESOURCE_EMOJI[r]}`);
  return parts.length ? parts.join(" ") : "nothing";
}

function canAfford(me: PrivateState | null, c?: ResourceCount): boolean {
  if (!me || !c) return false;
  return RESOURCES.every((r) => me.resources[r] >= c[r]);
}

const zero = (): Record<Resource, number> => ({ wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 });

// Is there an embargo (either direction) between two players?
function embargoed(game: GameStatePublic, a: string, b: string): boolean {
  const pa = game.players.find((p) => p.id === a);
  const pb = game.players.find((p) => p.id === b);
  return !!(pa?.embargoes.includes(b) || pb?.embargoes.includes(a));
}

export function TradePanels({
  game,
  me,
  myId,
}: {
  game: GameStatePublic;
  me: PrivateState | null;
  myId: string;
}) {
  const trade = game.pendingTrade;
  if (!trade) return null;
  const proposer = game.players.find((p) => p.id === trade.proposer);

  // Proposer view: see who accepted / countered and confirm a partner.
  if (trade.proposer === myId) {
    return (
      <div className="trade-panel">
        <div className="trade-head">Your offer</div>
        <div className="trade-terms">
          You give {resList(trade.give)} → get {resList(trade.receive)}
        </div>
        <div className="trade-responses">
          {game.players
            .filter((p) => p.id !== myId)
            .map((p) => {
              const resp = trade.responses[p.id];
              if (!resp) return null;
              return (
                <div key={p.id} className="trade-resp">
                  <span className="dot" style={{ background: PLAYER_FILL[p.color] }} />
                  <span className="tr-name">{p.name}</span>
                  {resp.status === "pending" && <em>thinking…</em>}
                  {resp.status === "reject" && (
                    <em>{embargoed(game, myId, p.id) ? "🚫 embargoed" : "declined"}</em>
                  )}
                  {resp.status === "accept" && (
                    <>
                      <em>accepted</em>
                      <button className="primary tiny" onClick={() => sendAction({ type: "acceptTradeWith", playerId: p.id })}>
                        Trade
                      </button>
                    </>
                  )}
                  {resp.status === "counter" && (
                    <>
                      <span className="tr-counter">
                        you give {resList(resp.give)} → get {resList(resp.receive)}
                      </span>
                      <button className="primary tiny" onClick={() => sendAction({ type: "acceptTradeWith", playerId: p.id })}>
                        Accept
                      </button>
                    </>
                  )}
                </div>
              );
            })}
        </div>
        <button className="link" onClick={() => sendAction({ type: "cancelTrade" })}>
          Cancel offer
        </button>
      </div>
    );
  }

  // Responder view.
  if (myId in trade.responses) {
    return <ResponderPanel trade={trade} proposerName={proposer?.name} me={me} myId={myId} />;
  }
  return null;
}

function ResponderPanel({
  trade,
  proposerName,
  me,
  myId,
}: {
  trade: PendingTrade;
  proposerName?: string;
  me: PrivateState | null;
  myId: string;
}) {
  const [countering, setCountering] = useState(false);
  const [give, setGive] = useState<Record<Resource, number>>(zero());
  const [want, setWant] = useState<Record<Resource, number>>(zero());
  const myResp = trade.responses[myId];
  const iCanFulfill = canAfford(me, trade.receive);

  if (myResp && myResp.status !== "pending") {
    const word =
      myResp.status === "counter" ? "countered" : myResp.status === "accept" ? "accepted" : "declined";
    return (
      <div className="trade-panel">
        <div className="trade-head">{proposerName} offered a trade</div>
        <div className="muted">You {word}.</div>
      </div>
    );
  }

  return (
    <div className="trade-panel">
      <div className="trade-head">{proposerName} offers a trade</div>
      <div className="trade-terms">
        You get {resList(trade.give)} → you give {resList(trade.receive)}
      </div>
      {countering ? (
        <div className="counter-form">
          <p className="muted small">You give</p>
          <Stepper state={give} set={setGive} cap={me?.resources} />
          <p className="muted small">You want</p>
          <Stepper state={want} set={setWant} />
          <div className="modal-actions">
            <button
              className="primary"
              onClick={() => {
                sendAction({ type: "counterTrade", give, receive: want });
                setCountering(false);
              }}
            >
              Send counter
            </button>
            <button className="link" onClick={() => setCountering(false)}>
              Back
            </button>
          </div>
        </div>
      ) : (
        <div className="modal-actions">
          <button
            className="primary"
            disabled={!iCanFulfill}
            onClick={() => sendAction({ type: "respondTrade", accept: true })}
          >
            {iCanFulfill ? "Accept" : "Can't afford"}
          </button>
          <button className="ghost" onClick={() => setCountering(true)}>
            Counter
          </button>
          <button className="link" onClick={() => sendAction({ type: "respondTrade", accept: false })}>
            Decline
          </button>
        </div>
      )}
    </div>
  );
}

function Stepper({
  state,
  set,
  cap,
}: {
  state: Record<Resource, number>;
  set: (v: Record<Resource, number>) => void;
  cap?: Record<Resource, number>;
}) {
  const adj = (r: Resource, d: number) =>
    set({ ...state, [r]: Math.max(0, Math.min(cap ? cap[r] : 9, state[r] + d)) });
  return (
    <div className="res-steppers">
      {RESOURCES.map((r) => (
        <div key={r} className="stepper">
          <span>{RESOURCE_EMOJI[r]}</span>
          <button onClick={() => adj(r, -1)}>−</button>
          <span className="stepper-val">{state[r]}</span>
          <button onClick={() => adj(r, +1)}>+</button>
        </div>
      ))}
    </div>
  );
}

export type { Resource };
