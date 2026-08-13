import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X, Wallet, AlertTriangle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { updateUserBalance } from "@/lib/balanceSync";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";

export default function TradeSheet({ stock, onClose }) {
  const navigate = useNavigate();
  const [qty, setQty] = useState(100);
  const [loading, setLoading] = useState(false);
  const [userBalance, setUserBalance] = useState(0);
  const { user } = useAuth();

  useEffect(() => {
    async function fetchBal() {
      try {
        const me = user || (await base44.auth.me().catch(() => null));
        if (me) {
          setUserBalance(Number(me.balance || 0));
        }
      } catch (err) {
        console.error(err);
      }
    }
    fetchBal();
  }, [user]);

  if (!stock) return null;

  const unit = Number(String(stock.price).replace(/[.,]/g, "")) || 0;
  const totalNum = unit * qty;
  const total = totalNum.toLocaleString("vi-VN");
  const up = stock.change >= 0;

  const handleOrder = async () => {
    if (userBalance < totalNum) {
      toast.warning(
        `Số dư ví (${userBalance.toLocaleString("vi-VN")} VNĐ) không đủ ${total} VNĐ. Đang chuyển hướng đến trang Nạp tiền...`
      );
      onClose?.();
      navigate("/profile?deposit=true");
      return;
    }

    setLoading(true);
    try {
      const newBal = Math.max(0, userBalance - totalNum);
      if (user?.id) {
        updateUserBalance(user.id, newBal);
      }

      await base44.entities.Transaction.create({
        user_id: user?.id || "u_guest",
        user_email: user?.email || "khachhang@vinclub.com",
        user_name: user?.name || "Khách hàng",
        project_id: `stock_${stock.symbol}`,
        project_name: `Cổ phiếu ${stock.symbol} (${stock.name})`,
        category: "Đầu tư chứng khoán",
        amount: totalNum,
        shares: qty,
        status: "completed",
        contract_status: "approved",
        note: `Đặt lệnh ${up ? "MUA" : "BÁN"} ${qty} CP ${stock.symbol}`,
        created_date: new Date().toISOString(),
      });

      await base44.entities.WalletTransaction.create({
        user_id: user?.id,
        type: "investment",
        amount: totalNum,
        status: "completed",
        description: `Mua ${qty} cổ phiếu ${stock.symbol}`,
        created_date: new Date().toISOString(),
      });

      toast.success(`Đặt lệnh thành công! Đã khớp ${qty} cổ phiếu ${stock.symbol}`);
      onClose();
    } catch (e) {
      toast.error("Không thể thực hiện lệnh giao dịch chứng khoán");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[60] bg-black/60 flex items-end justify-center font-heading"
      >
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-[331px] bg-[#151b24] rounded-t-3xl p-5 pb-8 border-t border-[#d4af37]/30"
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[15px] font-bold text-white">{stock.symbol}</p>
              <p className="text-[11px] text-gray-400">{stock.name}</p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-full bg-white/5 cursor-pointer">
              <X className="w-4 h-4 text-gray-300" />
            </button>
          </div>

          {/* User balance indicator */}
          <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/5 text-xs mb-3 text-gray-300 border border-white/10">
            <span className="flex items-center gap-1.5 text-amber-300 font-medium">
              <Wallet className="w-3.5 h-3.5" />
              <span>Số dư khả dụng:</span>
            </span>
            <span className="font-mono font-bold text-white">{userBalance.toLocaleString("vi-VN")} đ</span>
          </div>

          <div className="flex items-baseline justify-between p-3 rounded-xl bg-[#0d1117] mb-4">
            <span className="text-[11px] text-gray-400">Giá khớp lệnh</span>
            <span className="text-[18px] font-bold font-mono" style={{ color: up ? "#10b981" : "#ef4444" }}>
              {stock.price} đ
            </span>
          </div>

          {/* Quantity */}
          <p className="text-[11px] text-gray-400 mb-2">Khối lượng (cổ phiếu)</p>
          <div className="flex items-center gap-2 mb-2">
            {[100, 500, 1000].map((n) => (
              <button
                key={n}
                onClick={() => setQty(n)}
                className={`flex-1 py-2 rounded-lg text-[12px] font-medium transition-colors cursor-pointer ${
                  qty === n ? "bg-emerald-500 text-white font-bold" : "bg-[#1f2937] text-gray-300"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <input
            type="number"
            value={qty}
            onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
            className="w-full px-3 py-2.5 rounded-lg bg-[#0d1117] border border-[#222c38] text-white text-[13px] outline-none focus:border-emerald-500 font-mono"
          />

          <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/5">
            <span className="text-[12px] text-gray-400">Tổng giá trị</span>
            <span className="text-[16px] font-bold text-white font-mono">{total} đ</span>
          </div>

          {userBalance < totalNum && (
            <div className="mt-3 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[10px] text-amber-300 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
              <span>Số dư ví không đủ. Khi bấm đặt lệnh sẽ chuyển đến Nạp tiền.</span>
            </div>
          )}

          <button
            disabled={loading}
            onClick={handleOrder}
            className="w-full mt-4 py-3 rounded-xl text-[14px] font-extrabold text-white active:scale-[0.98] transition-transform cursor-pointer shadow-lg uppercase tracking-wider"
            style={{ backgroundColor: userBalance < totalNum ? "#d4af37" : (up ? "#10b981" : "#ef4444") }}
          >
            {loading ? "Đang xử lý lệnh..." : userBalance < totalNum ? "NẠP TIỀN ĐỂ ĐẶT LỆNH" : (up ? "Đặt lệnh mua ngay" : "Đặt lệnh bán ngay")}
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
