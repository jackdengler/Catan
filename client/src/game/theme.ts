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

// Two player palettes: the default, and a colorblind-friendlier set (well
// separated under the common red-green deficiencies). The choice is a per-
// device preference; toggling it reloads so every view picks up the new colors.
const DEFAULT_FILL: Record<PlayerColor, string> = {
  red: "#e23b3b",
  blue: "#2f7de2",
  white: "#f5f5f5",
  orange: "#f08a24",
};
const DEFAULT_STROKE: Record<PlayerColor, string> = {
  red: "#7a1414",
  blue: "#10396f",
  white: "#9a9a9a",
  orange: "#8a4708",
};
// Vermillion / blue / near-white / yellow — distinguishable for most CVD types.
const CB_FILL: Record<PlayerColor, string> = {
  red: "#d55e00",
  blue: "#0072b2",
  white: "#f5f5f5",
  orange: "#f0e442",
};
const CB_STROKE: Record<PlayerColor, string> = {
  red: "#8a3c00",
  blue: "#004c77",
  white: "#555555",
  orange: "#8f8400",
};

const CB_KEY = "catan_colorblind";
export function colorblindEnabled(): boolean {
  try {
    return localStorage.getItem(CB_KEY) === "on";
  } catch {
    return false;
  }
}
export function setColorblind(on: boolean): void {
  try {
    localStorage.setItem(CB_KEY, on ? "on" : "off");
  } catch {
    /* ignore */
  }
}

const cb = colorblindEnabled();
export const PLAYER_FILL: Record<PlayerColor, string> = cb ? CB_FILL : DEFAULT_FILL;
export const PLAYER_STROKE: Record<PlayerColor, string> = cb ? CB_STROKE : DEFAULT_STROKE;

export const RESOURCE_EMOJI: Record<Resource, string> = {
  wood: "🌲",
  brick: "🧱",
  sheep: "🐑",
  wheat: "🌾",
  ore: "⛰️",
};
