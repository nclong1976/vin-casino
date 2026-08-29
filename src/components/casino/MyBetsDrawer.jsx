import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Receipt, Clock, CheckCircle2, XCircle, Hourglass, Landmark, ShieldCheck, RefreshCw, Layers } from "lucide-react";
const fmt = (num) => new Intl.NumberFormat("vi-VN").format(Math.max(0, Math.floor(num || 0))) + " ₫";

// Một vòng cược hiển thị "LIVE 4:59" (~5 phút). Quá mốc này mà vé vẫn
// "pending" nghĩa là trình duyệt đã đóng/tải lại/điều hướng đi trước khi
// triggerDealAndReveal() kịp chạy - xem reconcileStalePendingBets() bên dưới.
const ROUND_STALE_MS = 7 * 60 * 1000; // 7 phút (5 phút vòng cược + đệm an toàn)

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

  // Chỉ tải & lắng nghe cập nhật khi drawer thực sự đang mở - trước đây
  // effect này chạy vô điều kiện (component vẫn mounted khi đóng, chỉ
  // return null), khiến drawer ĐÃ ĐÓNG vẫn setState mỗi khi có bet mới ở
  // bất kỳ đâu trong app, gây re-render thừa không ai nhìn thấy.
  useEffect(() => {
    if (!open) return;
    loadBets();
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

  // "if (!open) return null" TRƯỚC AnimatePresence sẽ gỡ luôn cả cây
  // AnimatePresence khỏi DOM trong CÙNG 1 lượt render khi đóng - AnimatePresence
  // chỉ phát hiện được unmount và chạy animation "exit" khi con của nó biến
  // mất từ BÊN TRONG (qua điều kiện render), không phải khi chính nó bị gỡ
  // từ bên ngoài. Kết quả: exit={{ y: "100%" }} không bao giờ chạy, drawer
  // biến mất đột ngột thay vì trượt xuống. Giữ AnimatePresence luôn mounted,
  // đưa điều kiện open vào bên trong.
  return (
    <AnimatePresence>
      {open && (
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
      )}
    </AnimatePresence>
  );
}

// Sinh id chứng từ không trùng lặp - Math.random() thuần (6 chữ số, ~900k tổ
// hợp) có xác suất đụng độ thật khi ledger được quảng cáo là "banking ledger
// engine". crypto.randomUUID() (hỗ trợ trên mọi trình duyệt hiện đại phục vụ
// HTTPS/localhost) loại bỏ hoàn toàn rủi ro đó; giữ Math.random() làm phương
// án dự phòng cho môi trường cũ không có API này.
function generateBetId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `LENG-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  }
  return `LENG-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1000)}`;
}

// Helper to add a bet to local ledger
export function recordCasinoBet(gameSlug, gameName, betsObj, totalBet) {
  try {
    const raw = localStorage.getItem("vinclub_my_bets_v1");
    const existing = raw ? JSON.parse(raw) : [];

    const newBet = {
      id: generateBetId(),
      gameSlug,
      gameName,
      bets: { ...betsObj },
      totalBet,
      payout: 0,
      status: "pending",
      // createdAtMs: mốc thời gian THẬT (epoch ms) dùng để tính tuổi vé cho
      // reconcileStalePendingBets() bên dưới - timestamp/dateStr chỉ là
      // chuỗi đã format theo giờ Việt Nam, không parse ngược lại tin cậy
      // được nên không thể dùng để so tuổi.
      createdAtMs: Date.now(),
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

// Đánh dấu MỘT vé cụ thể (theo betId trả về từ recordCasinoBet) là đã quyết
// toán. Trước đây hàm này tìm "vé pending ĐẦU TIÊN khớp gameSlug" bằng
// findIndex() - vì recordCasinoBet() luôn unshift vé mới lên đầu mảng, đây
// luôn là VÉ MỚI NHẤT, không nhất thiết là vé của ván VỪA kết thúc. Hễ người
// chơi có từ 2 vé "pending" cùng lúc (vd. đặt cược liên tiếp nhiều vòng mà
// vòng trước chưa kịp mở bài, hoặc vé cũ bị kẹt do tải lại trang giữa
// chừng), mọi lần quyết toán đều ghi NHẦM vào vé mới nhất, để lại toàn bộ
// vé cũ hơn kẹt "pending" vĩnh viễn - đúng nguyên nhân user thấy nhiều vé
// "Chờ Khớp" không bao giờ tất toán. Truyền betId để khớp CHÍNH XÁC 1 vé;
// vẫn giữ hành vi cũ (khớp theo gameSlug) làm phương án lùi khi không có
// betId, để không phá code cũ chưa kịp cập nhật lời gọi.
export function resolveLatestCasinoBet(gameSlug, totalPayout, outcomeResultText, betId = null) {
  try {
    const raw = localStorage.getItem("vinclub_my_bets_v1");
    if (!raw) return;
    let existing = JSON.parse(raw);

    const idx = betId
      ? existing.findIndex((b) => b.id === betId)
      : existing.findIndex((b) => b.status === "pending" && (!gameSlug || b.gameSlug === gameSlug));

    if (idx !== -1) {
      existing[idx].status = "resolved";
      existing[idx].payout = totalPayout;
      existing[idx].resultText = outcomeResultText;
      localStorage.setItem("vinclub_my_bets_v1", JSON.stringify(existing));
      window.dispatchEvent(new CustomEvent("vinclub:my_bets_updated"));
    }
  } catch (e) {
    console.error("Failed to resolve bet", e);
  }
}

// Đánh dấu các vé "pending" đã quá hạn trong sổ lệnh HIỂN THỊ CỤC BỘ này là
// "không xác định được kết quả" - KHÔNG hoàn tiền dựa trên dữ liệu
// localStorage (bet.totalBet) như trước đây: localStorage do trình duyệt
// người chơi tự giữ, ai đó có thể tự ghi 1 "vé" khống với totalBet tuỳ ý rồi
// gọi thẳng RPC hoàn tiền qua devtools để tự cộng tiền không giới hạn. Việc
// đặt/quyết toán cược thật giờ đăng ký + đọc lại số tiền THẬT từ server
// (bảng casino_rounds, xem reconcileMyStaleCasinoRound() trong
// supabaseDb.js) nên vòng cược thật bị bỏ dở đã được hoàn tự động ở đó rồi -
// hàm này chỉ còn dọn dẹp hiển thị của sổ lệnh cho khớp.
export function reconcileStalePendingBets(gameSlug) {
  try {
    const raw = localStorage.getItem("vinclub_my_bets_v1");
    if (!raw) return;
    const existing = JSON.parse(raw);
    const now = Date.now();
    let changed = false;

    existing.forEach((b) => {
      if (
        b.status === "pending" &&
        (!gameSlug || b.gameSlug === gameSlug) &&
        (b.createdAtMs === undefined || now - b.createdAtMs > ROUND_STALE_MS)
      ) {
        b.status = "resolved";
        b.payout = 0;
        b.resultText = "Không xác định được kết quả - phiên chơi trước đã hết hạn";
        changed = true;
      }
    });

    if (changed) {
      localStorage.setItem("vinclub_my_bets_v1", JSON.stringify(existing));
      window.dispatchEvent(new CustomEvent("vinclub:my_bets_updated"));
    }
  } catch (e) {
    console.error("Failed to reconcile stale pending bets", e);
  }
}
