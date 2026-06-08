import type { GameStatePublic, PrivateState, Resource, ResourceCount } from "@catan/shared";
import { RESOURCES } from "@catan/shared";
import { sendAction } from "../../net/socket.js";
import { RESOURCE_EMOJI, PLAYER_FILL } from "../../game/theme.js";

function resList(c: ResourceCount): string {
  const parts = RESOURCES.filter((r) => c[r] > 0).map((r) => `${c[r]} ${RESOURCE_EMOJI[r]}`);
  return parts.length ? parts.join(" ") : "nothing";
}

function canAfford(me: PrivateState | null, c: ResourceCount): boolean {
  if (!me) return false;
  return RESOURCES.every((r) => me.resources[r] >= c[r]);
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

  // Proposer view: see who accepted and confirm a partner.
  if (trade.proposer === myId) {
    return (
      <div className="trade-panel">
        <div className="trade-head">Your offer</div>
        <div className="trade-terms">
          Give {resList(trade.give)} → Get {resList(trade.receive)}
        </div>
        <div className="trade-responses">
          {game.players
            .filter((p) => p.id !== myId)
            .map((p) => {
              const resp = trade.responses[p.id];
              return (
                <div key={p.id} className="trade-resp">
                  <span className="dot" style={{ background: PLAYER_FILL[p.color] }} />
                  {p.name}: <em>{resp}</em>
                  {resp === "accept" && (
                    <button
                      className="primary tiny"
                      onClick={() => sendAction({ type: "acceptTradeWith", playerId: p.id })}
                    >
                      Trade
                    </button>
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
    const myResp = trade.responses[myId];
    const iCanFulfill = canAfford(me, trade.receive);
    return (
      <div className="trade-panel">
        <div className="trade-head">{proposer?.name} offers a trade</div>
        <div className="trade-terms">
          They give {resList(trade.give)} → you give {resList(trade.receive)}
        </div>
        {myResp === "pending" ? (
          <div className="modal-actions">
            <button
              className="primary"
              disabled={!iCanFulfill}
              onClick={() => sendAction({ type: "respondTrade", accept: true })}
            >
              {iCanFulfill ? "Accept" : "Can't afford"}
            </button>
            <button className="ghost" onClick={() => sendAction({ type: "respondTrade", accept: false })}>
              Decline
            </button>
          </div>
        ) : (
          <div className="muted">You {myResp}ed.</div>
        )}
      </div>
    );
  }

  return null;
}

export type { Resource };
