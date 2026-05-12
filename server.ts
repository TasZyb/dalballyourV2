import { createServer } from "node:http";
import path from "node:path";
import express from "express";
import { Server } from "socket.io";
import { createRequestHandler } from "@react-router/express";
import { setIO } from "./app/lib/socket.server";

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: true,
    credentials: true,
  },
});

setIO(io);

io.on("connection", (socket) => {
  socket.on("chat:join", ({ chatId }) => {
    if (!chatId) return;
    socket.join(`chat:${chatId}`);
  });

  socket.on("chat:leave", ({ chatId }) => {
    if (!chatId) return;
    socket.leave(`chat:${chatId}`);
  });
});

// ВАЖЛИВО: роздаємо CSS/JS/assets
app.use(
  express.static(path.join(process.cwd(), "build/client"), {
    immutable: true,
    maxAge: "1y",
  })
);

// favicon/public файли, якщо є
app.use(express.static(path.join(process.cwd(), "public")));

app.use(
  createRequestHandler({
    build: () => import("./build/server/index.js"),
  })
);

const port = Number(process.env.PORT || 10000);

httpServer.listen(port, "0.0.0.0", () => {
  console.log(`Server running on port ${port}`);
});