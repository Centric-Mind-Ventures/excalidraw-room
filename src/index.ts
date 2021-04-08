import debug from "debug";
import express from "express";
import http from "http";
import socketIO from "socket.io";

const serverDebug = debug("excalidraw:server");
const ioDebug = debug("excalidraw:io");
const socketDebug = debug("excalidraw:socket");

const app = express();
const port = process.env.PORT || 80; // default port to listen

const roomData: { [key: string]: Array<any> } = {};

app.use(express.static("public"));

app.get("/", (req, res) => {
  res.send("Excalidraw collaboration server is up :)");
});

const server = http.createServer(app);

server.listen(port, () => {
  serverDebug(`listening on port ${port}`);
});

const io = socketIO(server, {
  handlePreflightRequest: (req, res) => {
    const headers = {
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Origin":
        (req.header && req.header.origin) || "https://excalidraw.com",
      "Access-Control-Allow-Credentials": true,
    };
    res.writeHead(200, headers);
    res.end();
  },
});

io.on("connection", (socket) => {
  io.to(`${socket.id}`).emit("init-room");
  socket.on("join-room", (roomID) => {
    socketDebug(`${socket.id} has joined ${roomID}`);
    socket.join(roomID);
    if (io.sockets.adapter.rooms[roomID].length <= 1) {
      io.to(`${socket.id}`).emit("first-in-room");
    } else {
      socket.broadcast.to(roomID).emit("new-user", socket.id);
    }
    if (roomData[roomID] !== undefined) {
      ioDebug(`Sending ${roomData[roomID][0].length} bytes of data for room ${roomID}`);
      socket.emit("client-broadcast", ...roomData[roomID]);
    }
    io.in(roomID).emit(
      "room-user-change",
      Object.keys(io.sockets.adapter.rooms[roomID].sockets),
    );
  });

  socket.on("slotSelected", (slotIndex, sessionIdentifier) => {
    socketDebug(
      `Slot ${slotIndex} for session ${sessionIdentifier} has been selected. Broadcasting...`,
    );
    socket.broadcast.emit("slotSelected", slotIndex, sessionIdentifier);
  });

  socket.on("sessionLogoutByTeacher", (sessionIdentifier) => {
    socketDebug(`Session ${sessionIdentifier} has been finished by teacher`);
    socket.broadcast.emit("sessionLogoutByTeacher", sessionIdentifier);
  });

  socket.on("sessionStartedByTeacher", (sessionIdentifier) => {
    socketDebug(`Session ${sessionIdentifier} has been started by teacher`);
    socket.broadcast.emit("sessionStartedByTeacher", sessionIdentifier);
  });

  socket.on(
    "server-broadcast",
    (
      roomID: string,
      encryptedData: ArrayBuffer,
      iv: Uint8Array,
      containsAllData: boolean,
    ) => {
      socketDebug(`${socket.id} sends update to ${roomID}`);
      if (containsAllData) {
        ioDebug(`Storing data for room ${roomID}`);
        roomData[roomID] = [encryptedData, iv];
      }
      socket.broadcast.to(roomID).emit("client-broadcast", encryptedData, iv);
    },
  );

  socket.on(
    "server-volatile-broadcast",
    (roomID: string, encryptedData: ArrayBuffer, iv: Uint8Array) => {
      socket.volatile.broadcast
        .to(roomID)
        .emit("client-broadcast", encryptedData, iv);
    },
  );

  socket.on("disconnecting", () => {
    const rooms = io.sockets.adapter.rooms;
    for (const roomID in socket.rooms) {
      const clients = Object.keys(rooms[roomID].sockets).filter(
        (id) => id !== socket.id,
      );
      if (clients.length > 0) {
        socket.broadcast.to(roomID).emit("room-user-change", clients);
      }
    }
  });

  socket.on("disconnect", () => {
    socket.removeAllListeners();
  });
});
