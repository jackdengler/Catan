# Catan TV

A digital clone of Settlers of Catan where **the board is shown on a TV** and
**each player uses their phone as a private controller** — their hand of cards is
on their phone, and every action is taken from the phone.

It's a **fully static app** that can be hosted on **GitHub Pages**. There's no
backend to run: the board tab runs the game engine itself and players connect to
it **peer-to-peer over WebRTC**.

## How it gets onto the TV

You don't need a smart TV or a computer. **Open the board on one phone and
AirPlay / screen-mirror that phone to the TV.** Then:

1. On the "board" phone, open the app with **`?tv`** (e.g.
   `https://<you>.github.io/catan/?tv`) and AirPlay/mirror it to the TV. It shows
   a **room code** and a **QR code**, and keeps the screen awake.
2. Every player opens the app on their own phone, scans the QR (or enters the
   code), picks a name + colour, and joins.
3. The **first player to join is the host** and presses **Start** (2–4 players).

The board phone is a dedicated display (its screen is mirrored, so don't use it as
your private hand). Everyone else plays on their own phone.

## Architecture

```
shared/   Types shared everywhere (one source of truth over the wire)
engine/   The game engine: board gen, rules, applyAction — pure, browser-safe TS
client/   React + Vite app: the board view (?tv) and the phone controller
server/   OPTIONAL Node + Socket.IO server (a LAN fallback; not used by Pages)
```

- The **board tab is the authoritative host**. It runs `engine/` in the browser,
  validates every action, and sends each phone **only its own hand** (others are
  counts; the board sees no one's cards). This keeps everyone in sync and stops a
  phone from cheating.
- Phones reach the host over **WebRTC data channels** (via [PeerJS](https://peerjs.com)).
  One shared `Board` SVG component renders both the big board and the small
  **interactive** board phones use to tap legal spots during placement / robber.

> **About the one external dependency:** WebRTC needs a tiny *rendezvous* to
> introduce two devices the first time — browsers can't find each other on a LAN
> on their own. This uses PeerJS's **free public broker** (no account, no signup);
> it's only used for the ~1-second handshake, after which **all game traffic is
> direct phone-to-phone on your WiFi**. If you want zero third-party reliance for
> same-room play, use the optional local server below instead.

## Deploy to GitHub Pages

1. Push to your default branch (`main`).
2. In the repo: **Settings → Pages → Build and deployment → Source: GitHub
   Actions**.
3. The included workflow (`.github/workflows/deploy.yml`) builds the client and
   publishes it. Your app will be at `https://<you>.github.io/<repo>/`.

The build uses relative asset paths, so it works under the `/<repo>/` subpath.

## Run locally

```bash
npm install
npm run dev      # client on http://localhost:5173  (+ optional server on :3001)
```

- Board: `http://<your-computer-ip>:5173/?tv`
- Phones: scan the QR, or `http://<your-computer-ip>:5173/?room=CODE`

Phones must be able to reach the PeerJS broker (normal internet access). For a
pure-LAN, no-broker setup you can instead run the **optional Node server**
(`npm start` after `npm run build`) and point everyone at the host machine — but
that path uses the Socket.IO server, not Pages.

## Scripts

| Command             | What it does                              |
| ------------------- | ----------------------------------------- |
| `npm run dev`       | Run the client (and optional server)      |
| `npm run build`     | Build the static client (Pages artifact)  |
| `npm test`          | Run the engine rules tests (Vitest)       |
| `npm run typecheck` | Type-check every workspace                 |

## Game scope

Full base game for **2–4 players**: board generation, the setup snake-draft,
dice/production, the robber (discard on 7, move, steal), roads/settlements/cities,
bank & port trading, **player-to-player trading**, all **5 development cards**,
**longest road**, **largest army**, and winning at 10 victory points. State is
in memory in the board tab; a phone that refreshes mid-game rejoins with its hand
(its id is kept in `localStorage`). The 5–6 player expansion is out of scope.
