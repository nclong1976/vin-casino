import { io } from "socket.io-client";
import { queryClientInstance } from "./query-client";
import { base44 } from "@/api/base44Client";

// Connect to the same host/port as the current web page
const SOCKET_URL = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";

export const socket = io(SOCKET_URL, {
  autoConnect: true,
  transports: ["websocket", "polling"],
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
});

// In-memory log of received socket events for the Monitor UI
let eventLogs = [];
const logListeners = new Set();

export function addLog(type, data) {
  const timestamp = new Date().toLocaleTimeString();
  const newLog = { id: Math.random().toString(), timestamp, type, data };
  eventLogs = [newLog, ...eventLogs].slice(0, 100);
  logListeners.forEach(listener => listener(eventLogs));
}

export function subscribeToLogs(listener) {
  logListeners.add(listener);
  listener(eventLogs);
  return () => {
    logListeners.delete(listener);
  };
}

// Latency calculation (ping-pong)
let latency = 0;
const latencyListeners = new Set();

export function subscribeToLatency(listener) {
  latencyListeners.add(listener);
  listener(latency);
  return () => {
    latencyListeners.delete(listener);
  };
}

setInterval(() => {
  if (socket.connected) {
    const start = Date.now();
    socket.emit("client:ping", () => {
      latency = Date.now() - start;
      latencyListeners.forEach(cb => cb(latency));
    });
  }
}, 5000);

// Initialize real-time listeners & bind them to TanStack Query
export function initSocketSync() {
  console.log("[SocketSync] Initializing automatic cache sync...");

  socket.on("connect", () => {
    console.log("[SocketSync] Connected to server. Socket ID:", socket.id);
    addLog("SYSTEM", "Đã kết nối thành công với máy chủ Realtime.");
    
    // Invalidate main queries to ensure we are up to date on reconnect
    queryClientInstance.invalidateQueries({ queryKey: ["projects"] });
    queryClientInstance.invalidateQueries({ queryKey: ["stocks"] });
    queryClientInstance.invalidateQueries({ queryKey: ["me"] });
    queryClientInstance.invalidateQueries({ queryKey: ["messages"] });
  });

  socket.on("disconnect", (reason) => {
    console.log("[SocketSync] Disconnected from server:", reason);
    addLog("SYSTEM", `Mất kết nối với máy chủ: ${reason}`);
  });

  // 1. Stock price updates
  socket.on("stock:update", (updatedStocks) => {
    addLog("STOCK_TICKER", `Cập nhật thị giá: ${updatedStocks.map(s => `${s.symbol}: ${s.price}`).join(", ")}`);
    queryClientInstance.setQueryData(["stocks"], updatedStocks);
  });

  // 2. Project updates (e.g. progress, status)
  socket.on("project:update", (updatedProjects) => {
    addLog("PROJECT_UPDATE", "Cập nhật tiến trình & trạng thái các dự án VinClub.");
    queryClientInstance.setQueryData(["projects"], updatedProjects);
    
    // Also sync back to base44Client local storage to keep offline fallbacks robust
    try {
      localStorage.setItem("base44_entity_Project", JSON.stringify(updatedProjects));
      base44.entities.Project.notifySubscribers();
    } catch (e) {
      console.warn("Could not write Project sync to LocalStorage", e);
    }
  });

  // 3. User Balance & Profile updates
  socket.on("user:update", (userData) => {
    addLog("USER_PROFILE", `Đồng bộ số dư hội viên: ${new Intl.NumberFormat("vi-VN").format(userData.balance)} VNĐ`);
    queryClientInstance.setQueryData(["me"], (old) => ({ ...old, ...userData }));
    
    // Update local storage me
    try {
      localStorage.setItem("base44_local_user", JSON.stringify(userData));
    } catch (e) {}
  });

  // 4. Chat Messages update
  socket.on("message:new", (message) => {
    addLog("CHAT_MESSAGE", `Tin nhắn mới từ ${message.sender === "user" ? "Hội viên" : "Ban Cố vấn"}: ${message.text.substring(0, 20)}...`);
    queryClientInstance.setQueryData(["messages"], (old) => {
      const currentList = old || [];
      // Prevent duplicates (idempotency rule)
      if (currentList.some(m => m.id === message.id)) return currentList;
      return [...currentList, message];
    });
  });

  // 5. System notification or community alerts
  socket.on("community:activity", (activity) => {
    addLog("COMMUNITY", activity.text);
    queryClientInstance.setQueryData(["activities"], (old) => {
      const currentList = old || [];
      // Prevent duplicate
      if (currentList.some(a => a.id === activity.id)) return currentList;
      return [activity, ...currentList].slice(0, 50);
    });
  });
}

// Helper to manually notify mutations to other users via socket
export function broadcastMutation(entity, action, payload) {
  if (socket.connected) {
    socket.emit("mutation", { entity, action, payload });
  }
}
