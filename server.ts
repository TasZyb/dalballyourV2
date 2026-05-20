import { createServer } from "node:http";
import path from "node:path";
import express from "express";
import { Server } from "socket.io";
import { createRequestHandler } from "@react-router/express";
import { setIO } from "./app/lib/socket.server";
import { prisma } from "./app/lib/db.server";

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

  socket.on("chat:message-created", async ({ chatId, message }) => {
    if (!chatId || !message?.id) return;

    try {
      const savedMessage = await prisma.chatMessage.findFirst({
        where: {
          id: message.id,
          chatId,
          isDeleted: false,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              displayName: true,
              image: true,
            },
          },
        },
      });

      if (!savedMessage) return;

      io.to(`chat:${chatId}`).emit("chat:new-message", {
        id: savedMessage.id,
        text: savedMessage.text,
        isDeleted: savedMessage.isDeleted,
        isEdited: savedMessage.isEdited,
        createdAt: savedMessage.createdAt.toISOString(),
        userId: savedMessage.userId,
        clientMessageId: message.clientMessageId ?? null,
        user: savedMessage.user,
      });
    } catch (error) {
      console.error("Failed to broadcast chat message", error);
    }
  });
});

app.use(
  express.static(path.join(process.cwd(), "build/client"), {
    immutable: true,
    maxAge: "1y",
  })
);


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
