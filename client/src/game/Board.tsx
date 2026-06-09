import { useEffect, useMemo, useRef, useState } from "react";
import type { BoardLayout, GameStatePublic, PlayerColor } from "@catan/shared";
import { PLAYER_FILL, PLAYER_STROKE, RESOURCE_EMOJI, RESOURCE_FILL, TERRAIN_FILL } from "./theme.js";

// A non-interactive board for the lobby (preview of the layout to be played).
export function BoardPreview({ board, robberHex }: { board: BoardLayout; robberHex: string }) {
  const state = {
    board,
    robberHex,
    players: [],
    roads: {},
    buildings: {},
  } as unknown as GameStatePublic;
  return <Board state={state} />;
}

interface BoardProps {
  state: GameStatePublic;
  selectable?: "vertex" | "edge" | "hex" | null;
  highlight?: Set<string>;
  onSelect?: (id: string) => void;
  animate?: boolean; // pop newly-built pieces / robber moves (board displays only)
}

export function Board({ state, selectable = null, highlight, onSelect, animate = false }: BoardProps) {
  const board = state.board;

  const vById = useMemo(
    () => new Map(board.vertices.map((v) => [v.id, v])),
    [board]
  );
  const hexById = useMemo(() => new Map(board.hexes.map((h) => [h.id, h])), [board]);

  const colorOf = (pid: string): PlayerColor =>
    state.players.find((p) => p.id === pid)?.color ?? "white";

  const robber = hexById.get(state.robberHex);
  const hl = highlight ?? new Set<string>();

  // Track newly-placed roads/buildings (and city upgrades) to pop them in.
  const [recent, setRecent] = useState<Set<string>>(() => new Set());
  const prevRoads = useRef<Set<string>>(new Set(Object.keys(state.roads)));
  const prevBuildings = useRef<Map<string, string>>(
    new Map(Object.entries(state.buildings).map(([id, b]) => [id, b.type]))
  );
  useEffect(() => {
    if (!animate) return;
    const added: string[] = [];
    for (const id of Object.keys(state.roads)) if (!prevRoads.current.has(id)) added.push(id);
    for (const [id, b] of Object.entries(state.buildings))
      if (prevBuildings.current.get(id) !== b.type) added.push(id);
    prevRoads.current = new Set(Object.keys(state.roads));
    prevBuildings.current = new Map(Object.entries(state.buildings).map(([id, b]) => [id, b.type]));
    if (added.length === 0) return;
    setRecent((prev) => new Set([...prev, ...added]));
    const ids = new Set(added);
    const t = setTimeout(
      () => setRecent((prev) => new Set([...prev].filter((x) => !ids.has(x)))),
      1400
    );
    return () => clearTimeout(t);
  }, [state.roads, state.buildings, animate]);
  const isNew = (id: string) => animate && recent.has(id);

  // Briefly highlight the hex the robber just moved to, so spectators catch it.
  const [robberFlash, setRobberFlash] = useState(false);
  const prevRobber = useRef(state.robberHex);
  useEffect(() => {
    if (!animate) return;
    if (state.robberHex !== prevRobber.current) {
      prevRobber.current = state.robberHex;
      setRobberFlash(true);
      const t = setTimeout(() => setRobberFlash(false), 1600);
      return () => clearTimeout(t);
    }
  }, [state.robberHex, animate]);

  return (
    <svg
      viewBox={`0 0 ${board.width} ${board.height}`}
      className="board-svg"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        {/* Top-light / bottom-shade gloss to give each tile a subtle 3D feel. */}
        <linearGradient id="hexGloss" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.20" />
          <stop offset="45%" stopColor="#ffffff" stopOpacity="0.02" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.22" />
        </linearGradient>
        <radialGradient id="robberBody" cx="0.35" cy="0.3" r="0.9">
          <stop offset="0%" stopColor="#54585c" />
          <stop offset="100%" stopColor="#1c1f22" />
        </radialGradient>
        <filter id="pieceShadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="1.4" stdDeviation="1.3" floodColor="#000" floodOpacity="0.45" />
        </filter>
        <filter id="tokenShadow" x="-60%" y="-60%" width="220%" height="220%">
          <feDropShadow dx="0" dy="1" stdDeviation="1" floodColor="#000" floodOpacity="0.35" />
        </filter>
      </defs>

      {/* Hex tiles */}
      {board.hexes.map((h) => {
        const pts = h.corners
          .map((cid) => {
            const v = vById.get(cid)!;
            return `${v.x},${v.y}`;
          })
          .join(" ");
        const isRed = h.numberToken === 6 || h.numberToken === 8;
        const selectableHex = selectable === "hex" && hl.has(h.id);
        return (
          <g key={h.id}>
            <polygon
              points={pts}
              fill={TERRAIN_FILL[h.terrain]}
              stroke="#0b2a36"
              strokeWidth={1.6}
              strokeLinejoin="round"
            />
            {/* Gloss overlay for tile depth. */}
            <polygon points={pts} fill="url(#hexGloss)" stroke="none" pointerEvents="none" />
            {h.numberToken !== null && (
              <g pointerEvents="none">
                <circle cx={h.x} cy={h.y} r={16} fill="#f3ead2" stroke="#5b4a2a" filter="url(#tokenShadow)" />
                <text
                  x={h.x}
                  y={h.y + 1}
                  textAnchor="middle"
                  fontSize={15}
                  fontWeight={700}
                  fill={isRed ? "#c01616" : "#222"}
                >
                  {h.numberToken}
                </text>
                {/* Probability dots: more dots = more likely. */}
                {(() => {
                  const pips = 6 - Math.abs(7 - h.numberToken);
                  const gap = 3.4;
                  const startX = h.x - ((pips - 1) * gap) / 2;
                  return Array.from({ length: pips }).map((_, i) => (
                    <circle
                      key={i}
                      cx={startX + i * gap}
                      cy={h.y + 9}
                      r={1.4}
                      fill={isRed ? "#c01616" : "#333"}
                    />
                  ));
                })()}
              </g>
            )}
            {selectableHex && (
              <polygon
                points={pts}
                fill="rgba(255,255,255,0.25)"
                stroke="#ffe14d"
                strokeWidth={4}
                className="selectable"
                onClick={() => onSelect?.(h.id)}
              />
            )}
          </g>
        );
      })}

      {/* Ports: ratio + which resource, with docks to the two access vertices */}
      {board.ports.map((port) => {
        const v1 = vById.get(port.vertices[0]);
        const v2 = vById.get(port.vertices[1]);
        const res = port.type === "any" ? null : port.type;
        const fill = res ? RESOURCE_FILL[res] : "#2b3a55";
        return (
          <g key={port.id} pointerEvents="none">
            {v1 && <line x1={port.x} y1={port.y} x2={v1.x} y2={v1.y} stroke="#caa56b" strokeWidth={2} strokeDasharray="2 3" />}
            {v2 && <line x1={port.x} y1={port.y} x2={v2.x} y2={v2.y} stroke="#caa56b" strokeWidth={2} strokeDasharray="2 3" />}
            <circle cx={port.x} cy={port.y} r={15} fill={fill} stroke="#fff" strokeWidth={1.5} />
            <text x={port.x} y={port.y - 2} textAnchor="middle" fontSize={10} fill="#fff" fontWeight={800}>
              {res ? "2:1" : "3:1"}
            </text>
            <text x={port.x} y={port.y + 9} textAnchor="middle" fontSize={res ? 10 : 8} fill="#fff" fontWeight={700}>
              {res ? RESOURCE_EMOJI[res] : "any"}
            </text>
          </g>
        );
      })}

      {/* Last-action highlight: flash the hex the robber just landed on. */}
      {robber && robberFlash && (
        <polygon
          points={robber.corners
            .map((cid) => {
              const v = vById.get(cid)!;
              return `${v.x},${v.y}`;
            })
            .join(" ")}
          fill="none"
          stroke="#ffe14d"
          strokeWidth={5}
          className="robber-flash"
          pointerEvents="none"
        />
      )}

      {/* Robber — a little pawn with a ground shadow. */}
      {robber && (
        <g key={state.robberHex} className={animate ? "robber-anim" : undefined} pointerEvents="none">
          <ellipse cx={robber.x} cy={robber.y + 9} rx={11} ry={3.5} fill="#000" opacity={0.3} />
          <g filter="url(#pieceShadow)">
            <path
              d={`M ${robber.x - 9} ${robber.y + 7}
                  Q ${robber.x - 10} ${robber.y - 8} ${robber.x - 4} ${robber.y - 12}
                  Q ${robber.x} ${robber.y - 15} ${robber.x + 4} ${robber.y - 12}
                  Q ${robber.x + 10} ${robber.y - 8} ${robber.x + 9} ${robber.y + 7} Z`}
              fill="url(#robberBody)"
              stroke="#0c0d0e"
              strokeWidth={1}
            />
            <circle cx={robber.x} cy={robber.y - 16} r={6.5} fill="url(#robberBody)" stroke="#0c0d0e" strokeWidth={1} />
          </g>
        </g>
      )}

      {/* Roads (built) */}
      {Object.entries(state.roads).map(([eid, owner]) => {
        const e = board.edges.find((x) => x.id === eid);
        if (!e) return null;
        const c = colorOf(owner);
        return (
          <line
            key={eid}
            className={isNew(eid) ? "piece-new" : undefined}
            x1={e.x1}
            y1={e.y1}
            x2={e.x2}
            y2={e.y2}
            stroke={PLAYER_FILL[c]}
            strokeWidth={8}
            strokeLinecap="round"
            style={{ stroke: PLAYER_FILL[c], filter: `drop-shadow(0 0 1px ${PLAYER_STROKE[c]})` }}
          />
        );
      })}

      {/* Selectable edges — an oversized transparent hit line makes roads easy
          to tap on a phone; the coloured line on top is the visible target. */}
      {selectable === "edge" &&
        board.edges
          .filter((e) => hl.has(e.id))
          .map((e) => (
            <g key={`hl-${e.id}`} className="selectable" onClick={() => onSelect?.(e.id)}>
              <line
                x1={e.x1}
                y1={e.y1}
                x2={e.x2}
                y2={e.y2}
                stroke="transparent"
                strokeWidth={28}
                strokeLinecap="round"
              />
              <line
                x1={e.x1}
                y1={e.y1}
                x2={e.x2}
                y2={e.y2}
                stroke="#ffe14d"
                strokeWidth={11}
                strokeLinecap="round"
                opacity={0.9}
                className="pulse"
                pointerEvents="none"
              />
            </g>
          ))}

      {/* Buildings */}
      {Object.entries(state.buildings).map(([vid, b]) => {
        const v = vById.get(vid)!;
        const c = colorOf(b.owner);
        const cls = isNew(vid) ? "piece-new" : undefined;
        const fill = PLAYER_FILL[c];
        const line = PLAYER_STROKE[c];
        if (b.type === "city") {
          // A larger building: a flat-topped tower beside a pitched-roof house —
          // the classic Catan city silhouette.
          const x = v.x, y = v.y;
          return (
            <g key={vid} className={cls} pointerEvents="none" filter="url(#pieceShadow)">
              <path
                d={`M ${x - 10} ${y + 9} L ${x - 10} ${y - 9} L ${x - 3} ${y - 9}
                    L ${x - 3} ${y - 4} L ${x + 3.5} ${y - 11} L ${x + 10} ${y - 4}
                    L ${x + 10} ${y + 9} Z`}
                fill={fill}
                stroke={line}
                strokeWidth={1.6}
                strokeLinejoin="round"
              />
              {/* tower-top + roof highlight */}
              <polygon points={`${x + 3.5},${y - 11} ${x + 10},${y - 4} ${x - 3},${y - 4}`} fill="#fff" opacity={0.16} />
              {/* windows + door */}
              <rect x={x - 8} y={y - 5} width={3} height={3} fill={line} opacity={0.7} />
              <rect x={x - 8} y={y + 1} width={3} height={3} fill={line} opacity={0.7} />
              <rect x={x + 3} y={y + 3} width={4} height={6} fill={line} opacity={0.75} />
            </g>
          );
        }
        // Settlement: a small house (pentagon).
        const x = v.x, y = v.y;
        return (
          <g key={vid} className={cls} pointerEvents="none" filter="url(#pieceShadow)">
            <polygon
              points={`${x},${y - 9} ${x + 8},${y - 2} ${x + 8},${y + 8} ${x - 8},${y + 8} ${x - 8},${y - 2}`}
              fill={fill}
              stroke={line}
              strokeWidth={1.6}
              strokeLinejoin="round"
            />
            {/* roof highlight + door */}
            <polygon points={`${x},${y - 9} ${x + 8},${y - 2} ${x - 8},${y - 2}`} fill="#fff" opacity={0.2} />
            <rect x={x - 2} y={y + 2} width={4} height={6} fill={line} opacity={0.7} />
          </g>
        );
      })}

      {/* Selectable vertices — large transparent hit circle + a smaller visible
          marker, so settlements/cities are easy to place by thumb. */}
      {selectable === "vertex" &&
        board.vertices
          .filter((v) => hl.has(v.id))
          .map((v) => (
            <g key={`hlv-${v.id}`} className="selectable" onClick={() => onSelect?.(v.id)}>
              <circle cx={v.x} cy={v.y} r={24} fill="transparent" />
              <circle
                cx={v.x}
                cy={v.y}
                r={13}
                fill="rgba(255,225,77,0.5)"
                stroke="#ffe14d"
                strokeWidth={3}
                className="pulse"
                pointerEvents="none"
              />
            </g>
          ))}
    </svg>
  );
}
