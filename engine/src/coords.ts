import type { BoardLayout, Edge, Hex, Vertex } from "@catan/shared";

// Hex circumradius in logic units. Rendering scales via the SVG viewBox.
const SIZE = 60;

// Pointy-top hex pixel centre for axial coordinate (q, r).
function hexCenter(q: number, r: number): { x: number; y: number } {
  const x = SIZE * Math.sqrt(3) * (q + r / 2);
  const y = SIZE * (3 / 2) * r;
  return { x, y };
}

// The 6 corners of a pointy-top hex, going clockwise from the top.
function hexCorners(cx: number, cy: number): { x: number; y: number }[] {
  const corners: { x: number; y: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 90);
    corners.push({ x: cx + SIZE * Math.cos(angle), y: cy + SIZE * Math.sin(angle) });
  }
  return corners;
}

// Canonical key for a point. Distinct vertices are ~SIZE apart, so rounding to
// whole units safely dedupes shared corners without colliding distinct ones.
function ptKey(x: number, y: number): string {
  return `${Math.round(x)},${Math.round(y)}`;
}

function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

// The set of axial coords that form a standard radius-2 Catan board (19 hexes).
export function standardHexCoords(): { q: number; r: number }[] {
  const coords: { q: number; r: number }[] = [];
  const N = 2;
  for (let q = -N; q <= N; q++) {
    for (let r = -N; r <= N; r++) {
      const s = -q - r;
      if (Math.abs(s) <= N) coords.push({ q, r });
    }
  }
  return coords;
}

export interface Geometry {
  hexes: Hex[];
  vertices: Map<string, Vertex>;
  edges: Map<string, Edge>;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
}

// Build the full hex / vertex / edge graph from pure geometry. Terrain, number
// tokens and ports are filled in later by the board generator.
export function buildGeometry(): Geometry {
  const coords = standardHexCoords();

  const vertices = new Map<string, Vertex>();
  const edges = new Map<string, Edge>();
  const hexes: Hex[] = [];

  // First pass: collect raw geometry so we can normalise offsets afterwards.
  const rawHexes = coords.map(({ q, r }) => {
    const { x, y } = hexCenter(q, r);
    const corners = hexCorners(x, y);
    return { q, r, x, y, corners };
  });

  // Compute bounds for centring.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const h of rawHexes) {
    for (const c of h.corners) {
      minX = Math.min(minX, c.x);
      minY = Math.min(minY, c.y);
      maxX = Math.max(maxX, c.x);
      maxY = Math.max(maxY, c.y);
    }
  }
  const pad = 40;
  const offsetX = -minX + pad;
  const offsetY = -minY + pad;
  const width = maxX - minX + pad * 2;
  const height = maxY - minY + pad * 2;

  const ensureVertex = (x: number, y: number): Vertex => {
    const key = ptKey(x, y);
    let v = vertices.get(key);
    if (!v) {
      v = {
        id: key,
        x: x + offsetX,
        y: y + offsetY,
        hexes: [],
        edges: [],
        adjacent: [],
      };
      vertices.set(key, v);
    }
    return v;
  };

  for (const rh of rawHexes) {
    const cornerVerts = rh.corners.map((c) => ensureVertex(c.x, c.y));
    const hexId = `${rh.q},${rh.r}`;

    const hex: Hex = {
      id: hexId,
      q: rh.q,
      r: rh.r,
      x: rh.x + offsetX,
      y: rh.y + offsetY,
      terrain: "desert",
      numberToken: null,
      corners: cornerVerts.map((v) => v.id),
      edges: [],
    };

    for (const v of cornerVerts) {
      if (!v.hexes.includes(hexId)) v.hexes.push(hexId);
    }

    // 6 edges around the hex between consecutive corners.
    for (let i = 0; i < 6; i++) {
      const a = cornerVerts[i];
      const b = cornerVerts[(i + 1) % 6];
      const key = edgeKey(a.id, b.id);
      let e = edges.get(key);
      if (!e) {
        e = {
          id: key,
          v1: a.id,
          v2: b.id,
          x1: a.x,
          y1: a.y,
          x2: b.x,
          y2: b.y,
          hexes: [],
        };
        edges.set(key, e);
        if (!a.edges.includes(key)) a.edges.push(key);
        if (!b.edges.includes(key)) b.edges.push(key);
        if (!a.adjacent.includes(b.id)) a.adjacent.push(b.id);
        if (!b.adjacent.includes(a.id)) b.adjacent.push(a.id);
      }
      if (!e.hexes.includes(hexId)) e.hexes.push(hexId);
      hex.edges.push(key);
    }

    hexes.push(hex);
  }

  return { hexes, vertices, edges, width, height, offsetX, offsetY };
}

export function geometryToLayout(geo: Geometry, ports: BoardLayout["ports"]): BoardLayout {
  return {
    hexes: geo.hexes,
    vertices: [...geo.vertices.values()],
    edges: [...geo.edges.values()],
    ports,
    width: geo.width,
    height: geo.height,
  };
}
