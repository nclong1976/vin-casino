import React, { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Wifi, 
  WifiOff, 
  Activity, 
  RefreshCw, 
  Database, 
  Terminal, 
  Zap, 
  X, 
  Clock 
} from "lucide-react";
import { 
  socket, 
  subscribeToLogs, 
  subscribeToLatency, 
  broadcastMutation 
} from "@/lib/socket-sync";

export default function RealTimeMonitor() {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [latency, setLatency] = useState(0);
  const [logs, setLogs] = useState([]);
  const [activeQueries, setActiveQueries] = useState([]);

  // Subscribe to socket connection status
  useEffect(() => {
    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    // Initial state
    setIsConnected(socket.connected);

    // Subscribe to logs and latency from the socket-sync library
    const unsubLogs = subscribeToLogs((newLogs) => setLogs(newLogs));
    const unsubLatency = subscribeToLatency((newLatency) => setLatency(newLatency));

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      unsubLogs();
      unsubLatency();
    };
  }, []);

  // Poll TanStack Query's active cache keys
  useEffect(() => {
    if (!isOpen) return;

    const updateQueries = () => {
      const cache = queryClient.getQueryCache();
      const queries = cache.getAll().map((q) => {
        const state = q.state;
        return {
          key: JSON.stringify(q.queryKey),
          status: q.isFetching() ? "fetching" : state.isInvalidated ? "invalidated" : "fresh",
          updatedAt: new Date(state.dataUpdatedAt).toLocaleTimeString(),
          data: state.data,
        };
      });
      setActiveQueries(queries);
    };

    updateQueries();
    const interval = setInterval(updateQueries, 2000);
    return () => clearInterval(interval);
  }, [isOpen, queryClient]);

  const forceRefetch = () => {
    queryClient.invalidateQueries();
    // Emit a broadcast to simulate activity
    broadcastMutation("System", "invalidate_all", { timestamp: Date.now() });
  };

  const simulateActivity = () => {
    if (!socket.connected) return;
    const randomAmount = Math.floor(Math.random() * 5 + 1) * 10000000;
    const randomUser = "Hội viên Kim Cương " + ["Hoàng", "Minh", "Thu", "Phạm", "Lê"][Math.floor(Math.random() * 5)];
    const activityText = `${randomUser} vừa khớp lệnh suất đầu tư trị giá ${new Intl.NumberFormat("vi-VN").format(randomAmount)} VNĐ`;
    
    socket.emit("mutation", {
      entity: "Message",
      action: "simulate",
      payload: {
        id: "sim_" + Date.now(),
        sender: "support",
        text: activityText,
        created_date: new Date().toISOString()
      }
    });
  };

  return (
    <>
      {/* Floating Badge Indicator */}
      <div className="fixed bottom-[74px] right-[10px] z-50 flex items-center">
        <button
          onClick={() => setIsOpen(true)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border shadow-lg text-[9px] font-bold tracking-wider uppercase transition-all active:scale-95 ${
            isConnected
              ? "bg-[#0d1117]/95 text-green-400 border-green-500/30 hover:border-green-400/50"
              : "bg-[#0d1117]/95 text-red-400 border-red-500/30 hover:border-red-400/50"
          }`}
        >
          {isConnected ? (
            <>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              <Wifi className="w-3.5 h-3.5 text-green-400" />
              <span>{latency}ms</span>
            </>
          ) : (
            <>
              <span className="relative flex h-2 w-2">
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
              </span>
              <WifiOff className="w-3.5 h-3.5 text-red-400" />
              <span>OFFLINE</span>
            </>
          )}
        </button>
      </div>

      {/* Main Bottom Sheet / Overlay */}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs">
            {/* Click outside to close */}
            <div className="absolute inset-0" onClick={() => setIsOpen(false)} />

            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className="relative w-full max-w-[331px] h-[520px] bg-[#0d1117] border-t border-[#948154]/40 rounded-t-2xl shadow-2xl flex flex-col overflow-hidden font-sans"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3.5 border-b border-[#948154]/20 bg-gradient-to-r from-[#161b22] to-[#0d1117]">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[#948154] animate-pulse" />
                  <div>
                    <h3 className="text-[12px] font-extrabold text-[#e5c158] tracking-wider uppercase">
                      VinClub Realtime & Cache Sync
                    </h3>
                    <p className="text-[8.5px] text-gray-400 font-medium">
                      Bảng giám sát WebSocket & TanStack Query
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 rounded-lg bg-gray-800 text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-3.5 space-y-4">
                
                {/* 1. Network Status Panel */}
                <div className="grid grid-cols-2 gap-2 bg-[#161b22] p-2.5 rounded-xl border border-[#948154]/10">
                  <div className="space-y-1">
                    <span className="text-[8px] text-gray-400 uppercase font-semibold">Kết nối Máy chủ</span>
                    <div className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500 shadow-[0_0_8px_#22c55e]" : "bg-red-500"}`} />
                      <span className="text-[11px] font-bold text-white">
                        {isConnected ? "CONNECTED" : "DISCONNECTED"}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1 border-l border-gray-800 pl-2">
                    <span className="text-[8px] text-gray-400 uppercase font-semibold">Độ trễ phản hồi</span>
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-amber-500" />
                      <span className="text-[11px] font-mono font-bold text-white">{latency} ms</span>
                    </div>
                  </div>
                </div>

                {/* 2. TanStack Query Cache State */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[9.5px] font-bold text-gray-300 flex items-center gap-1.5">
                      <Database className="w-3.5 h-3.5 text-blue-400" /> Bộ nhớ đệm TanStack Query
                    </span>
                    <button
                      onClick={forceRefetch}
                      className="text-[8.5px] text-[#e5c158] hover:underline flex items-center gap-1 font-semibold"
                    >
                      <RefreshCw className="w-2.5 h-2.5 animate-spin-slow" /> Invalidate Cache
                    </button>
                  </div>

                  <div className="max-h-[110px] overflow-y-auto space-y-1.5 border border-gray-800 rounded-xl p-2 bg-[#090d13]">
                    {activeQueries.length === 0 ? (
                      <p className="text-[8.5px] text-gray-500 text-center py-2">Không tìm thấy khoá cache nào hoạt động</p>
                    ) : (
                      activeQueries.map((q, idx) => (
                        <div key={idx} className="flex items-center justify-between text-[9px] bg-[#161b22] p-1.5 rounded-lg border border-gray-800">
                          <div className="flex items-center gap-1.5 truncate max-w-[170px]">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                            <span className="font-mono text-gray-300 truncate">{q.key}</span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className={`px-1.5 py-0.2 rounded-full text-[7.5px] font-bold uppercase ${
                              q.status === "fetching" ? "bg-amber-950 text-amber-400 border border-amber-900" : "bg-green-950 text-green-400 border border-green-900"
                            }`}>
                              {q.status}
                            </span>
                            <span className="text-gray-500 font-mono text-[7px]">{q.updatedAt}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* 3. Live WebSocket Event Traffic */}
                <div className="space-y-2">
                  <span className="text-[9.5px] font-bold text-gray-300 flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5 text-green-400" /> Luồng dữ liệu WebSockets
                  </span>

                  <div className="h-[140px] overflow-y-auto space-y-1.5 border border-gray-800 rounded-xl p-2 bg-[#090d13] font-mono text-[8px] leading-relaxed">
                    {logs.length === 0 ? (
                      <p className="text-gray-500 text-center py-6">Đang đợi luồng sự kiện...</p>
                    ) : (
                      logs.map((log) => (
                        <div key={log.id} className="border-b border-gray-900 pb-1.5 last:border-b-0 space-y-0.5">
                          <div className="flex items-center justify-between">
                            <span className="text-gray-500">[{log.timestamp}]</span>
                            <span className={`px-1.5 py-0.2 rounded text-[7px] font-bold tracking-wider ${
                              log.type === "SYSTEM" ? "bg-purple-950 text-purple-400" :
                              log.type === "STOCK_TICKER" ? "bg-green-950 text-green-400" :
                              log.type === "CHAT_MESSAGE" ? "bg-blue-950 text-blue-400" :
                              log.type === "COMMUNITY" ? "bg-yellow-950 text-yellow-400" :
                              "bg-gray-800 text-gray-300"
                            }`}>
                              {log.type}
                            </span>
                          </div>
                          <p className="text-gray-300 leading-normal font-sans text-[8.5px]">
                            {log.data}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

              </div>

              {/* Footer Control Actions */}
              <div className="px-4 py-3 bg-[#161b22] border-t border-gray-800 flex gap-2">
                <button
                  disabled={!isConnected}
                  onClick={simulateActivity}
                  className="flex-1 py-2 rounded-xl bg-gradient-to-r from-[#948154] to-[#c2af81] text-white disabled:opacity-50 text-[10px] font-bold flex items-center justify-center gap-1.5 active:scale-95 shadow-md shadow-black/40 transition-all"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-200" /> Gửi Giao dịch Giả lập
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
