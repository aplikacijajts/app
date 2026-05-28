let io = null;

export function initRealtime(server) {
  return null;
}

export function attachRealtime(socketServer) {
  io = socketServer;
  io.on("connection", (socket) => {
    socket.emit("connected", { ok: true, at: new Date().toISOString() });
    socket.on("join", (payload = {}) => {
      const companyId = payload.companyId || "default";
      socket.join(`company:${companyId}`);
      if (payload.role) socket.join(`role:${payload.role}`);
    });
  });
  return io;
}

export function emitRealtime(event, payload = {}, room = null) {
  if (!io) return;
  if (room) io.to(room).emit(event, payload);
  else io.emit(event, payload);
}
