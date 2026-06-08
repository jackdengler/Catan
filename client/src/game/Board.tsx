import { useMemo } from "react";
import type { GameStatePublic, PlayerColor } from "@catan/shared";
import { PLAYER_FILL, PLAYER_STROKE, TERRAIN_FILL } from "./theme.js";

interface BoardProps {
  state: GameStatePublic;
  selectable?: "vertex" | "edge" | "hex" | null;
  highlight?: Set<string>;
  onSelect?: (id: string) => void;
}

export function Board({ state, selectable = null, highlight, onSelect }: BoardProps) {
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

  return (
    <svg
      viewBox={`0 0 ${board.width} ${board.height}`}
      className="board-svg"
      preserveAspectRatio="xMidYMid meet"
    >
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
              stroke="#0d3b16"
              strokeWidth={2}
            />
            {h.numberToken !== null && (
              <g pointerEvents="none">
                <circle cx={h.x} cy={h.y} r={16} fill="#f3ead2" stroke="#5b4a2a" />
                <text
                  x={h.x}
                  y={h.y + 5}
                  textAnchor="middle"
                  fontSize={16}
                  fontWeight={700}
                  fill={isRed ? "#c01616" : "#222"}
                >
                  {h.numberToken}
                </text>
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

      {/* Ports */}
      {board.ports.map((port) => (
        <g key={port.id} pointerEvents="none">
          <circle cx={port.x} cy={port.y} r={13} fill="#2b3a55" stroke="#dfe7f5" />
          <text x={port.x} y={port.y + 4} textAnchor="middle" fontSize={10} fill="#fff" fontWeight={700}>
            {port.type === "any" ? "3:1" : "2:1"}
          </text>
        </g>
      ))}

      {/* Robber */}
      {robber && (
        <g pointerEvents="none">
          <circle cx={robber.x} cy={robber.y - 22} r={11} fill="#222" stroke="#000" />
          <rect x={robber.x - 9} y={robber.y - 14} width={18} height={20} rx={6} fill="#222" />
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

      {/* Selectable edges */}
      {selectable === "edge" &&
        board.edges
          .filter((e) => hl.has(e.id))
          .map((e) => (
            <line
              key={`hl-${e.id}`}
              x1={e.x1}
              y1={e.y1}
              x2={e.x2}
              y2={e.y2}
              stroke="#ffe14d"
              strokeWidth={10}
              strokeLinecap="round"
              opacity={0.85}
              className="selectable"
              onClick={() => onSelect?.(e.id)}
            />
          ))}

      {/* Buildings */}
      {Object.entries(state.buildings).map(([vid, b]) => {
        const v = vById.get(vid)!;
        const c = colorOf(b.owner);
        if (b.type === "city") {
          return (
            <g key={vid} pointerEvents="none">
              <rect
                x={v.x - 11}
                y={v.y - 11}
                width={22}
                height={22}
                rx={4}
                fill={PLAYER_FILL[c]}
                stroke={PLAYER_STROKE[c]}
                strokeWidth={2}
              />
              <circle cx={v.x} cy={v.y} r={4} fill={PLAYER_STROKE[c]} />
            </g>
          );
        }
        return (
          <g key={vid} pointerEvents="none">
            <circle cx={v.x} cy={v.y} r={9} fill={PLAYER_FILL[c]} stroke={PLAYER_STROKE[c]} strokeWidth={2} />
          </g>
        );
      })}

      {/* Selectable vertices */}
      {selectable === "vertex" &&
        board.vertices
          .filter((v) => hl.has(v.id))
          .map((v) => (
            <circle
              key={`hlv-${v.id}`}
              cx={v.x}
              cy={v.y}
              r={11}
              fill="rgba(255,225,77,0.5)"
              stroke="#ffe14d"
              strokeWidth={3}
              className="selectable pulse"
              onClick={() => onSelect?.(v.id)}
            />
          ))}
    </svg>
  );
}
