import type { ResourceCount, Resource, DevCardType, Terrain, GameOptions } from "./types.js";

export const VICTORY_POINTS_TO_WIN = 10;

export const DEFAULT_OPTIONS: GameOptions = {
  targetVictoryPoints: 10,
  discardLimit: 7,
  turnTimerSeconds: 0,
  randomizeOrder: true,
};

export const EMPTY_RESOURCES = (): ResourceCount => ({
  wood: 0,
  brick: 0,
  sheep: 0,
  wheat: 0,
  ore: 0,
});

// Starting bank supply (19 of each resource in base Catan).
export const BANK_PER_RESOURCE = 19;

// Building costs.
export const COSTS: Record<"road" | "settlement" | "city" | "devCard", Partial<ResourceCount>> = {
  road: { wood: 1, brick: 1 },
  settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1 },
  city: { wheat: 2, ore: 3 },
  devCard: { sheep: 1, wheat: 1, ore: 1 },
};

// Pieces each player starts with.
export const PIECES = {
  roads: 15,
  settlements: 5,
  cities: 4,
};

// Standard base-game terrain distribution (19 hexes).
export const TERRAIN_BAG: Terrain[] = [
  "wood", "wood", "wood", "wood",
  "sheep", "sheep", "sheep", "sheep",
  "wheat", "wheat", "wheat", "wheat",
  "brick", "brick", "brick",
  "ore", "ore", "ore",
  "desert",
];

// Standard number tokens (no 7; one desert gets none).
export const NUMBER_TOKENS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];

// Development card deck composition (25 cards).
export const DEV_DECK: DevCardType[] = [
  ...Array<DevCardType>(14).fill("knight"),
  ...Array<DevCardType>(5).fill("victory"),
  ...Array<DevCardType>(2).fill("roadBuilding"),
  ...Array<DevCardType>(2).fill("yearOfPlenty"),
  ...Array<DevCardType>(2).fill("monopoly"),
];

// Port type distribution (9 ports: 4 generic 3:1, 5 specific 2:1).
export const PORT_TYPES: ("any" | Resource)[] = [
  "any", "any", "any", "any",
  "wood", "brick", "sheep", "wheat", "ore",
];

export const RESOURCE_LABEL: Record<Resource, string> = {
  wood: "Wood",
  brick: "Brick",
  sheep: "Sheep",
  wheat: "Wheat",
  ore: "Ore",
};
