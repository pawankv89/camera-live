const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const { Server } = require("socket.io");
const QRCode = require("qrcode");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const MAX_VIEWERS = 5;
const rooms = new Map();
const dataDir = path.join(__dirname, "..", "data");
const historyFile = path.join(dataDir, "sessions.json");

fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(historyFile)) fs.writeFileSync(historyFile, "[]");

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/api/health", (_, res) => res.json({ ok: true, service: "LiveShare" }));

app.get("/api/history", (_, res) => {
  try { res.json(JSON.parse(fs.readFileSync(historyFile, "utf8"))); }
  catch { res.json([]); }
});

app.get("/api/qr/:room", async (req, res) => {
  try {
    const base = process.env.PUBLIC_URL || `${req.protocol}://${req.get("host")}`;
    const url = `${base}/?room=${encodeURIComponent(req.params.room)}&mode=viewer`;
    const png = await QRCode.toDataURL(url, { width: 420, margin: 2 });
    res.json({ url, dataUrl: png });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

function saveHistory(item) {
  let list = [];
  try { list = JSON.parse(fs.readFileSync(historyFile, "utf8")); } catch {}
  list.unshift(item);
  fs.writeFileSync(historyFile, JSON.stringify(list.slice(0, 100), null, 2));
}

io.on("connection", socket => {
  socket.on("create-room", ({ room }) => {
    if (!room) return;
    rooms.set(room, { sender: socket.id, viewers: new Set(), startedAt: Date.now() });
    socket.join(room);
    socket.data.room = room;
    socket.data.role = "sender";
    socket.emit("room-created", { room });
  });

  socket.on("join-room", ({ room }) => {
    const r = rooms.get(room);
    if (!r) return socket.emit("room-error", "Room not found. Ask the sender for a new QR/link.");
    if (r.viewers.size >= MAX_VIEWERS) return socket.emit("room-error", "This room already has 5 viewers.");
    r.viewers.add(socket.id);
    socket.join(room);
    socket.data.room = room;
    socket.data.role = "viewer";
    io.to(r.sender).emit("viewer-joined", { viewerId: socket.id });
    socket.emit("room-joined", { room, senderId: r.sender });
  });

  socket.on("offer", ({ target, offer }) => io.to(target).emit("offer", { from: socket.id, offer }));
  socket.on("answer", ({ target, answer }) => io.to(target).emit("answer", { from: socket.id, answer }));
  socket.on("ice-candidate", ({ target, candidate }) => io.to(target).emit("ice-candidate", { from: socket.id, candidate }));

  socket.on("session-info", ({ room, duration, viewers }) => {
    saveHistory({
      room, endedAt: new Date().toISOString(), durationSeconds: duration || 0,
      viewers: viewers || 0
    });
  });

  socket.on("disconnect", () => {
    const room = socket.data.room;
    const r = rooms.get(room);
    if (!r) return;
    if (socket.data.role === "viewer") {
      r.viewers.delete(socket.id);
      io.to(r.sender).emit("viewer-left", { viewerId: socket.id });
    } else if (r.sender === socket.id) {
      io.to(room).emit("sender-left");
      rooms.delete(room);
    }
  });
});

app.get("*", (_, res) => res.sendFile(path.join(__dirname, "..", "public", "index.html")));

server.listen(PORT, HOST, () => {
  console.log(`LiveShare running on http://localhost:${PORT}`);
  console.log(`For LAN: http://<YOUR-COMPUTER-LAN-IP>:${PORT}`);
});