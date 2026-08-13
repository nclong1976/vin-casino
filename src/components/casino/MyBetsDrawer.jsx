import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Receipt, Clock, CheckCircle2, XCircle, Hourglass, Landmark, ShieldCheck, RefreshCw, Layers } from "lucide-react";

const fmt = (num) => new Intl.NumberFormat("vi-VN").format(Math.max(0, Math.floor(num || 0))) + " ₫";

export default function MyBetsDrawer({ open, onClose, currentTimerSeconds = 299, gameFilter = "" }) {
  const [filter, setFilter] = useState("all"); // 'all', 'pending', 'resolved'
  const [bets, setBets] = useState([]);

  const loadBets = () => {
    try {
      const raw = localStorage.getItem("vinclub_my_bets_v1");
      if (raw) {
        let parsed = JSON.parse(raw);
        if (gameFilter) {
          parsed = parsed.filter((b) => !b.gameSlug || b.gameSlug === gameFilter);
        }
        setBets(parsed);
      } else {
        setBets([]);
      }
    } catch (e) {
      setBets([]);
    }
  };

  useEffect(() => {
    if (open) loadBets();
    const handleUpdate = () => loadBets();
    window.addEventListener("vinclub:my_bets_updated", handleUpdate);
    return () => window.removeEventListener("vinclub:my_bets_updated", handleUpdate);
  }, [open, gameFilter]);

  const filteredBets = bets.filter((b) => {
    if (filter === "pending") return b.status === "pending";
    if (filter === "resolved") return b.status === "resolved";
    return true;
  });

  const totalBetAmount = bets.reduce((acc, curr) => acc + (curr.totalBet || 0), 0);
  const totalPayoutWon = bets.reduce((acc, curr) => acc + (curr.payout || 0), 0);
  const pendingCount = bets.filter((b) => b.status === "pending").length;

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[160] bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center font-heading p-0 sm:p-4"
      >
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 260 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-lg bg-[#0e1218] border-t sm:border-2 border-[#d4af37]/40 rounded-t-3xl sm:rounded-3xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl text-white"
        >
          {/* HEADER BAR */}
          <div className="p-4 sm:p-5 bg-gradient-to-r from-[#18202c] via-[#121822] to-[#0e1218] border-b border-[#d4af37]/20 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-[#d4af37]/10 border border-[#d4af37]/30 text-amber-400">
                <Receipt className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-black text-white uppercase tracking-wide flex items-center gap-2">
                  <span>SỔ LỆNH GIAO DỊCH CƯỢC</span>
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                </h3>
                <p className="text-[10.5px] text-gray-400 font-mono">Xác thực chứng từ giao dịch Casino VinClub</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-gray-300 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* SUMMARY STATS BAR */}
          <div className="grid grid-cols-3 gap-2 p-3 bg-[#0a0d12] border-b border-white/10 text-center font-mono">
            <div className="bg-[#121720] p-2 rounded-xl border border-white/5">
              <p className="text-[9.5px] text-gray-400 font-sans uppercase">Tổng Tiền Đặt</p>
              <p className="text-xs font-bold text-amber-300 mt-0.5">{fmt(totalBetAmount)}</p>
            </div>
            <div className="bg-[#121720] p-2 rounded-xl border border-white/5">
              <p className="text-[9.5px] text-gray-400 font-sans uppercase">Tổng Tiền Thắng</p>
              <p className="text-xs font-bold text-emerald-400 mt-0.5">{fmt(totalPayoutWon)}</p>
            </div>
            <div className="bg-[#121720] p-2 rounded-xl border border-white/5">
              <p className="text-[9.5px] text-gray-400 font-sans uppercase">Chờ Kết Quả</p>
              <p className="text-xs font-bold text-amber-400 mt-0.5">{pendingCount} ván</p>
            </div>
          </div>

          {/* FILTER TABS */}
          <div className="flex bg-[#121720] p-1.5 gap-1 border-b border-white/5 text-xs font-bold">
            <button
              onClick={() => setFilter("all")}
              className={`flex-1 py-1.5 rounded-xl transition-all cursor-pointer ${
                filter === "all" ? "bg-[#d4af37] text-black shadow-md" : "text-gray-400 hover:text-white"
              }`}
            >
              Tất Cả ({bets.length})
            </button>
            <button
              onClick={() => setFilter("pending")}
              className={`flex-1 py-1.5 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1 ${
                filter === "pending" ? "bg-amber-500 text-black shadow-md" : "text-amber-400/80 hover:text-amber-300"
              }`}
            >
              <Hourglass className="w-3.5 h-3.5" />
              <span>Chờ Khớp ({pendingCount})</span>
            </button>
            <button
              onClick={() => setFilter("resolved")}
              className={`flex-1 py-1.5 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1 ${
                filter === "resolved" ? "bg-emerald-600 text-white shadow-md" : "text-gray-400 hover:text-white"
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Đã Quyết Toán</span>
            </button>
          </div>

          {/* BETS LIST CONTAINER */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 min-h-[250px]">
            {filteredBets.length === 0 ? (
              <div className="text-center py-12 px-4 text-gray-400 space-y-2">
                <Landmark className="w-10 h-10 mx-auto text-gray-600 opacity-60" />
                <p className="text-xs font-bold">Chưa có chứng từ lệnh giao dịch nào</p>
                <p className="text-[11px] text-gray-500">
                  {filter === "pending"
                    ? "Hiện tại không có ván cược nào đang chờ đếm ngược 04:59"
                    : "Các ván cược của bạn sẽ được tự động lưu lại tại đây."}
                </p>
              </div>
            ) : (
              filteredBets.map((item) => {
                const isPending = item.status === "pending";
                const isWon = item.status === "resolved" && item.payout > 0;

                return (
                  <div
                    key={item.id}
                    className={`bg-gradient-to-r ${
                      isPending
                        ? "from-[#1c1810] to-[#12100a] border-amber-500/40"
                        : isWon
                        ? "from-[#0d1a14] to-[#0a120e] border-emerald-500/40"
                        : "from-[#141820] to-[#0e1218] border-white/10"
                    } border rounded-2xl p-3.5 shadow-md relative overflow-hidden`}
                  >
                    {/* CARD TOP BAR */}
                    <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-2 text-[11px] font-mono">
                      <div className="flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-amber-400" />
                        <span className="font-bold text-amber-300">{item.id}</span>
                        <span className="text-gray-500">•</span>
                        <span className="text-gray-400 font-sans">{item.gameName || "Tiger Baccarat"}</span>
                      </div>
                      <span className="text-gray-400 text-[10px]">{item.timestamp}</span>
                    </div>

                    {/* BET ZONES BREAKDOWN */}
                    <div className="space-y-1 mb-2.5">
                      {Object.entries(item.bets || {}).map(([zone, val]) => {
                        if (!val || val <= 0) return null;
                        const zoneLabel =
                          zone === "player"
                            ? "PLAYER (Người chơi)"
                            : zone === "banker"
                            ? "BANKER (Nhà cái)"
                            : zone === "tie"
                            ? "TIE (Hòa 8:1)"
                            : zone === "tiger"
                            ? "THẦN HỔ (Tiger 40:1)"
                            : zone === "player_pair"
                            ? "ĐÔI PLAYER (11:1)"
                            : zone === "banker_pair"
                            ? "ĐÔI BANKER (11:1)"
                            : zone.toUpperCase();

                        return (
                          <div key={zone} className="flex justify-between items-center text-[11.5px]">
                            <span className="text-gray-300 font-medium">{zoneLabel}:</span>
                            <span className="font-mono font-bold text-white">{fmt(val)}</span>
                          </div>
                        );
                      })}
                    </div>

                    {/* STATUS & RESULTS FOOTER */}
                    <div className="pt-2 border-t border-white/10 flex items-center justify-between text-xs">
                      {isPending ? (
                        <div className="flex items-center gap-1.5 text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/30 font-mono text-[11px] animate-pulse">
                          <Clock className="w-3.5 h-3.5 shrink-0" />
                          <span>Chờ đồng hồ 04:59 mở bài ({Math.floor(currentTimerSeconds / 60)}:{(currentTimerSeconds % 60).toString().padStart(2, "0")})</span>
                        </div>
                      ) : isWon ? (
                        <div className="flex items-center gap-1 text-emerald-400 font-bold bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/30 text-[11px]">
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          <span>Thắng +{fmt(item.payout)}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-gray-400 bg-white/5 px-2.5 py-1 rounded-full border border-white/10 text-[11px]">
                          <XCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>Không trúng</span>
                        </div>
                      )}

                      <div className="text-right font-mono">
                        <span className="text-[10px] text-gray-500 block">Tổng cược</span>
                        <span className="font-bold text-amber-300">{fmt(item.totalBet)}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* DRAWER FOOTER */}
          <div className="p-3 bg-[#0a0d12] border-t border-white/10 text-center text-[10.5px] font-mono text-gray-500 flex items-center justify-between">
            <span>VINCLUB BANKING LEDGER ENGINE v2.6</span>
            <button
              onClick={loadBets}
              className="text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer font-sans font-bold"
            >
              <RefreshCw className="w-3 h-3" /> Cập nhật
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// Helper to add a bet to local ledger
export function recordCasinoBet(gameSlug, gameName, betsObj, totalBet) {
  try {
    const raw = localStorage.getItem("vinclub_my_bets_v1");
    const existing = raw ? JSON.parse(raw) : [];

    const newBet = {
      id: `LENG-${Math.floor(100000 + Math.random() * 900000)}`,
      gameSlug,
      gameName,
      bets: { ...betsObj },
      totalBet,
      payout: 0,
      status: "pending",
      timestamp: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      dateStr: new Date().toLocaleDateString("vi-VN"),
    };

    const updated = [newBet, ...existing].slice(0, 50); // Keep last 50
    localStorage.setItem("vinclub_my_bets_v1", JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent("vinclub:my_bets_updated"));
    return newBet.id;
  } catch (e) {
    console.error("Failed to record bet", e);
    return null;
  }
}

// Helper to resolve the latest pending bet
export function resolveLatestCasinoBet(gameSlug, totalPayout, outcomeResultText) {
  try {
    const raw = localStorage.getItem("vinclub_my_bets_v1");
    if (!raw) return;
    let existing = JSON.parse(raw);

    const pendingIdx = existing.findIndex((b) => b.status === "pending" && (!gameSlug || b.gameSlug === gameSlug));
    if (pendingIdx !== -1) {
      existing[pendingIdx].status = "resolved";
      existing[pendingIdx].payout = totalPayout;
      existing[pendingIdx].resultText = outcomeResultText;
      localStorage.setItem("vinclub_my_bets_v1", JSON.stringify(existing));
      window.dispatchEvent(new CustomEvent("vinclub:my_bets_updated"));
    }
  } catch (e) {
    console.error("Failed to resolve bet", e);
  }
}
