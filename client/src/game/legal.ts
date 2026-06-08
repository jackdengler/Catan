import type { BoardLayout, GameStatePublic, Vertex, Edge } from "@catan/shared";

// Client-side mirrors of the server placement rules, used only to highlight
// legal spots. The server remains authoritative and re-validates everything.

export function vertexMap(board: BoardLayout): Map<string, Vertex> {
  return new Map(board.vertices.map((v) => [v.id, v]));
}

export function edgeMap(board: BoardLayout): Map<string, Edge> {
  return new Map(board.edges.map((e) => [e.id, e]));
}

export function legalSettlements(
  state: GameStatePublic,
  playerId: string,
  requireRoad: boolean
): Set<string> {
  const vmap = vertexMap(state.board);
  const out = new Set<string>();
  for (const v of state.board.vertices) {
    if (state.buildings[v.id]) continue;
    if (v.adjacent.some((a) => state.buildings[a])) continue;
    if (requireRoad && !v.edges.some((e) => state.roads[e] === playerId)) continue;
    out.add(v.id);
    void vmap;
  }
  return out;
}

export function legalCities(state: GameStatePublic, playerId: string): Set<string> {
  const out = new Set<string>();
  for (const [vid, b] of Object.entries(state.buildings)) {
    if (b.owner === playerId && b.type === "settlement") out.add(vid);
  }
  return out;
}

export function legalRoads(
  state: GameStatePublic,
  playerId: string,
  setupAnchor?: string | null
): Set<string> {
  const vmap = vertexMap(state.board);
  const out = new Set<string>();
  for (const e of state.board.edges) {
    if (state.roads[e.id]) continue;
    if (setupAnchor) {
      if (e.v1 === setupAnchor || e.v2 === setupAnchor) out.add(e.id);
      continue;
    }
    let connected = false;
    for (const vid of [e.v1, e.v2]) {
      const building = state.buildings[vid];
      if (building && building.owner === playerId) {
        connected = true;
        break;
      }
      if (building && building.owner !== playerId) continue; // blocked through opponent
      const vtx = vmap.get(vid)!;
      if (vtx.edges.some((inc) => inc !== e.id && state.roads[inc] === playerId)) {
        connected = true;
        break;
      }
    }
    if (connected) out.add(e.id);
  }
  return out;
}

// Robber may move to any hex other than its current one.
export function legalRobberHexes(state: GameStatePublic): Set<string> {
  const out = new Set<string>();
  for (const h of state.board.hexes) {
    if (h.id !== state.robberHex) out.add(h.id);
  }
  return out;
}
