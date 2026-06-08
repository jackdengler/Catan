# Catan TV

A digital clone of Settlers of Catan where **the board lives on a shared TV/large
screen** and **each player uses their phone as a private controller** — their hand
of cards is on their phone, and every action is taken from the phone.

The full base game is implemented: board generation, the setup snake-draft,
dice/production, the robber (discard on 7, move, steal), building roads /
settlements / cities, bank & port trading, **player-to-player trading**,
**development cards** (knight, victory point, road building, year of plenty,
monopoly), **longest road**, **largest army**, and winning at 10 victory points.

## Architecture

```
shared/   Game types shared by client & server (one source of truth over the wire)
server/   Authoritative game engine + Socket.IO realtime server (Node + Express)
client/   React + Vite app: the TV board view and the phone controller
```

- The **server is authoritative**: phones send *intents* (actions), the server
  validates them against the rules and broadcasts new state. Each phone only ever
  receives its own hand; other hands are sent as counts, and the TV never sees
  anyone's cards. This keeps the game in sync and prevents cheating from a phone.
- One shared `Board` SVG component renders both the large display-only TV board
  and the small **interactive** board on the phone (used to tap a legal vertex /
  edge / hex during placement and robber moves).

## Running it

```bash
npm install
npm run dev          # starts the server (:3001) and the Vite client (:5173)
```

Then:

- Open **`http://localhost:5173/tv`** on the screen you want to use as the board
  (a TV, a laptop on the big screen, etc.). It shows a 4-letter **room code** and
  a QR code.
- On each phone, open **`http://<your-computer-ip>:5173/`** (or scan the QR),
  enter the room code, pick a name and colour, and join. The Vite dev server is
  exposed on the LAN so phones on the same Wi-Fi can connect.
- The **first player to join is the host** and presses **Start** once everyone is
  in (2–4 players).

> The phone connects its socket to the server on port **3001** in dev. In
> production, run `npm run build` then `npm start` — the server serves the built
> client and everything is on one origin/port.

## Scripts

| Command              | What it does                                  |
| -------------------- | --------------------------------------------- |
| `npm run dev`        | Run server + client with live reload          |
| `npm run build`      | Build the client for production               |
| `npm start`          | Serve the built client + realtime server      |
| `npm test`           | Run the rules unit tests (Vitest)             |
| `npm run typecheck`  | Type-check all workspaces                      |

## Notes

- Game state is kept **in memory** per room (sessions are ephemeral). A phone that
  refreshes mid-game automatically rejoins with its hand (its player id is stored
  in `localStorage`).
- Base game for **2–4 players**; the 5–6 player expansion is out of scope.
