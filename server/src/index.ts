import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import express from "express";
import { Server } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "@catan/shared";
import { RoomManager } from "./rooms.js";
import { registerSocketHandlers } from "./socket.js";

const PORT = Number(process.env.PORT ?? 3001);

const app = express();
const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: true },
});

const rooms = new RoomManager();
registerSocketHandlers(io, rooms);

app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

// In production, serve the built client.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, "../../client/dist");
app.use(express.static(clientDist));
app.get("*", (_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"), (err) => {
    if (err) res.status(404).send("Client build not found. Run `npm run build`.");
  });
});

httpServer.listen(PORT, () => {
  console.log(`Catan server listening on http://localhost:${PORT}`);
});
