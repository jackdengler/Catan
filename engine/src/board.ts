import {
  TERRAIN_BAG,
  type BoardLayout,
  type Port,
  type PortType,
} from "@catan/shared";
import { buildGeometry, geometryToLayout, type Geometry } from "./coords.js";

// Canonical Catan number-token sequence (the official chit order A–R). Placed
// along a spiral over the land hexes; combined with the desert-position check
// below this keeps the red 6/8 hexes apart, as in the real game.
const CANONICAL_TOKENS = [5, 2, 6, 3, 8, 10, 9, 12, 11, 4, 8, 10, 9, 4, 5, 6, 3, 11];

// Fixed port layout (4 generic 3:1 + one 2:1 of each resource), placed at the
// same evenly-spaced perimeter positions every game.
const CANONICAL_PORTS: PortType[] = [
  "any", "wheat", "any", "ore", "any", "sheep", "any", "brick", "wood",
];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Two hexes are neighbours if they share an edge (exactly two shared corners).
function hexNeighbours(geo: Geometry): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const e of geo.edges.values()) {
    if (e.hexes.length === 2) {
      const [a, b] = e.hexes;
      (map.get(a) ?? map.set(a, []).get(a)!).push(b);
      (map.get(b) ?? map.set(b, []).get(b)!).push(a);
    }
  }
  return map;
}

// Order the 19 hexes outer-ring-first, clockwise from the top — a spiral the
// canonical token sequence is laid along.
function spiralOrder(geo: Geometry): string[] {
  const cx = geo.width / 2;
  const cy = geo.height / 2;
  const ringOf = (q: number, r: number) =>
    Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r));
  const angle = (h: { x: number; y: number }) => Math.atan2(h.x - cx, -(h.y - cy));

  const rings: Record<number, typeof geo.hexes> = { 0: [], 1: [], 2: [] };
  for (const h of geo.hexes) rings[ringOf(h.q, h.r)].push(h);
  const cw = (arr: typeof geo.hexes) =>
    [...arr].sort((a, b) => angle(a) - angle(b)).map((h) => h.id);
  return [...cw(rings[2]), ...cw(rings[1]), ...cw(rings[0])];
}

function canonicalPorts(geo: Geometry): Port[] {
  const center = { x: geo.width / 2, y: geo.height / 2 };
  const perimeter = [...geo.edges.values()].filter((e) => e.hexes.length === 1);
  const withAngle = perimeter
    .map((edge) => {
      const mx = (edge.x1 + edge.x2) / 2;
      const my = (edge.y1 + edge.y2) / 2;
      return { edge, angle: Math.atan2(my - center.y, mx - center.x), mx, my };
    })
    .sort((a, b) => a.angle - b.angle);

  const ports: Port[] = [];
  for (let i = 0; i < CANONICAL_PORTS.length; i++) {
    const idx = Math.floor((i * withAngle.length) / CANONICAL_PORTS.length);
    const { edge, angle, mx, my } = withAngle[idx];
    ports.push({
      id: `port-${i}`,
      edgeId: edge.id,
      vertices: [edge.v1, edge.v2],
      type: CANONICAL_PORTS[i],
      x: mx,
      y: my,
      angle: (angle * 180) / Math.PI,
    });
  }
  return ports;
}

function noAdjacentReds(geo: Geometry, neighbours: Map<string, string[]>): boolean {
  const isRed = (n: number | null) => n === 6 || n === 8;
  const byId = new Map(geo.hexes.map((h) => [h.id, h]));
  for (const h of geo.hexes) {
    if (!isRed(h.numberToken)) continue;
    for (const nId of neighbours.get(h.id) ?? []) {
      if (isRed(byId.get(nId)?.numberToken ?? null)) return false;
    }
  }
  return true;
}

export interface GeneratedBoard {
  layout: BoardLayout;
  robberHex: string;
}

// Canonical generation: random terrain, official token spiral, fixed ports.
// The desert (and thus token placement) is re-rolled until no two red hexes
// are adjacent.
export function generateBoard(): GeneratedBoard {
  const geo = buildGeometry();
  const order = spiralOrder(geo);
  const byId = new Map(geo.hexes.map((h) => [h.id, h]));
  const neighbours = hexNeighbours(geo);

  let robberHex = "";
  for (let attempt = 0; attempt < 200; attempt++) {
    const terrains = shuffle(TERRAIN_BAG);
    geo.hexes.forEach((h, i) => {
      h.terrain = terrains[i];
      h.numberToken = null;
    });

    let ti = 0;
    robberHex = "";
    for (const id of order) {
      const h = byId.get(id)!;
      if (h.terrain === "desert") {
        robberHex = h.id;
        continue;
      }
      h.numberToken = CANONICAL_TOKENS[ti++];
    }
    if (noAdjacentReds(geo, neighbours)) break;
  }

  return { layout: geometryToLayout(geo, canonicalPorts(geo)), robberHex };
}
