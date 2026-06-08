import type { PlayerColor, Resource, Terrain } from "@catan/shared";

export const TERRAIN_FILL: Record<Terrain, string> = {
  wood: "#2f7d32",
  brick: "#bf5a36",
  sheep: "#9ccc65",
  wheat: "#f1c44a",
  ore: "#7a8c99",
  desert: "#e3d2a0",
};

export const RESOURCE_FILL: Record<Resource, string> = {
  wood: "#2f7d32",
  brick: "#bf5a36",
  sheep: "#9ccc65",
  wheat: "#f1c44a",
  ore: "#7a8c99",
};

export const PLAYER_FILL: Record<PlayerColor, string> = {
  red: "#e23b3b",
  blue: "#2f7de2",
  white: "#f5f5f5",
  orange: "#f08a24",
};

export const PLAYER_STROKE: Record<PlayerColor, string> = {
  red: "#7a1414",
  blue: "#10396f",
  white: "#9a9a9a",
  orange: "#8a4708",
};

export const RESOURCE_EMOJI: Record<Resource, string> = {
  wood: "🌲",
  brick: "🧱",
  sheep: "🐑",
  wheat: "🌾",
  ore: "⛰️",
};
