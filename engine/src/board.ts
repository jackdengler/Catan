import {
  NUMBER_TOKENS,
  PORT_TYPES,
  TERRAIN_BAG,
  type BoardLayout,
  type Port,
} from "@catan/shared";
import { buildGeometry, geometryToLayout, type Geometry } from "./coords.js";

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

// Assign terrain + tokens. Retries a few times to avoid adjacent red (6/8) hexes
// for a nicer board, but always returns something.
function assignTerrainAndTokens(geo: Geometry): string {
  const neighbours = hexNeighbours(geo);

  for (let attempt = 0; attempt < 50; attempt++) {
    const terrains = shuffle(TERRAIN_BAG);
    geo.hexes.forEach((h, i) => {
      h.terrain = terrains[i];
      h.numberToken = null;
    });

    const tokens = shuffle(NUMBER_TOKENS);
    let ti = 0;
    let robberHex = "";
    for (const h of geo.hexes) {
      if (h.terrain === "desert") {
        robberHex = h.id;
        continue;
      }
      h.numberToken = tokens[ti++];
    }

    // Check no two red numbers (6 or 8) are adjacent.
    const isRed = (n: number | null) => n === 6 || n === 8;
    let ok = true;
    for (const h of geo.hexes) {
      if (!isRed(h.numberToken)) continue;
      for (const nId of neighbours.get(h.id) ?? []) {
        const nb = geo.hexes.find((x) => x.id === nId);
        if (nb && isRed(nb.numberToken)) {
          ok = false;
          break;
        }
      }
      if (!ok) break;
    }
    if (ok) return robberHex;
  }

  // Fallback: return whatever desert we have.
  const desert = geo.hexes.find((h) => h.terrain === "desert");
  return desert ? desert.id : geo.hexes[0].id;
}

function buildPorts(geo: Geometry): Port[] {
  const center = { x: geo.width / 2, y: geo.height / 2 };

  // Perimeter edges touch exactly one hex.
  const perimeter = [...geo.edges.values()].filter((e) => e.hexes.length === 1);

  // Order them clockwise around the board centre.
  const withAngle = perimeter.map((e) => {
    const mx = (e.x1 + e.x2) / 2;
    const my = (e.y1 + e.y2) / 2;
    return { edge: e, angle: Math.atan2(my - center.y, mx - center.x), mx, my };
  });
  withAngle.sort((a, b) => a.angle - b.angle);

  // Pick 9 evenly-spaced perimeter edges.
  const types = shuffle(PORT_TYPES);
  const ports: Port[] = [];
  const count = 9;
  for (let i = 0; i < count; i++) {
    const idx = Math.floor((i * withAngle.length) / count);
    const { edge, angle, mx, my } = withAngle[idx];
    ports.push({
      id: `port-${i}`,
      edgeId: edge.id,
      vertices: [edge.v1, edge.v2],
      type: types[i],
      x: mx,
      y: my,
      angle: (angle * 180) / Math.PI,
    });
  }
  return ports;
}

export interface GeneratedBoard {
  layout: BoardLayout;
  robberHex: string;
}

export function generateBoard(): GeneratedBoard {
  const geo = buildGeometry();
  const robberHex = assignTerrainAndTokens(geo);
  const ports = buildPorts(geo);
  return { layout: geometryToLayout(geo, ports), robberHex };
}
