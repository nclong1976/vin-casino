import React, { useState } from "react";
import { 
  ArrowDownLeft, 
  ArrowUpRight, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  XCircle, 
  Gamepad2, 
  Gift, 
  Wallet,
  ChevronRight,
  X,
  Copy,
  Check
} from "lucide-react";
import { toast } from "sonner";

const fmt = (n) => (n || 0).toLocaleString("vi-VN");

// Format thời gian ngắn gọn thông minh
const formatCompactTime = (dateStr) => {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    
    const time = d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
    if (isToday) {
      return `${time} Hôm nay`;
    }
    const dayMonth = d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
    return `${time} · ${dayMonth}`;
  } catch (e) {
    return dateStr;
  }
};

const formatFullDateTime = (dateStr) => {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return d.toLocaleString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
  } catch (e) {
    return dateStr;
  }
};

const STATUS_CONFIG = {
  completed: {
    label: "Thành công",
    icon: CheckCircle2,
    badgeClass: "text-emerald-700 bg-emerald-50 border-emerald-200/60",
    dotClass: "bg-emerald-500",
  },
  pending: {
    label: "Chờ duyệt",
    icon: Clock,
    badgeClass: "text-amber-700 bg-amber-50 border-amber-200/60",
    dotClass: "bg-amber-500",
    spin: true,
  },
  failed: {
    label: "Thất bại",
    icon: AlertCircle,
    badgeClass: "text-rose-700 bg-rose-50 border-rose-200/60",
    dotClass: "bg-rose-500",
  },
  rejected: {
    label: "Từ chối",
    icon: XCircle,
    badgeClass: "text-rose-700 bg-rose-50 border-rose-200/60",
    dotClass: "bg-rose-500",
  },
};

const FILTER_OPTIONS = [
  { value: "all", label: "Tất cả" },
  { value: "deposit", label: "Nạp tiền" },
  { value: "withdraw", label: "Rút tiền" },
  { value: "pending", label: "Chờ xử lý" },
];

export default function WalletTransactionList({ items = [], loading = false }) {
  const [filterType, setFilterType] = useState("all");
  const [selectedTx, setSelectedTx] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [copied, setCopied] = useState(false);

  if (loading) {
    return (
      <div className="bg-white rounded-xl p-5 text-center text-[11px] text-gray-400 flex flex-col items-center gap-2 border border-gray-100">
        <Clock className="w-4 h-4 animate-spin text-[#948154]" />
        Đang tải giao dịch...
      </div>
    );
  }

  // Sắp xếp mới nhất lên đầu
  const sorted = [...items].sort((a, b) => {
    const da = new Date(a.created_date || a.created_at || 0);
    const db = new Date(b.created_date || b.created_at || 0);
    return db - da;
  });

  // Lọc
  const filtered = sorted.filter((t) => {
    if (filterType === "all") return true;
    if (filterType === "deposit") return t.type === "deposit";
    if (filterType === "withdraw") return t.type === "withdraw";
    if (filterType === "pending") return (t.status || "completed") === "pending";
    return true;
  });

  const displayList = showAll ? filtered : filtered.slice(0, 5);

  const handleCopyCode = (code) => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success("Đã sao chép mã giao dịch");
    setTimeout(() => setCopied(false), 2000);
  };

  const getTxTypeInfo = (t) => {
    const type = t.type || "deposit";
    if (type === "deposit") {
      return {
        title: "Nạp tiền",
        sub: t.bank_name ? `Ngân hàng: ${t.bank_name}` : "Nạp tiền vào ví",
        isPositive: true,
        icon: ArrowDownLeft,
        iconBg: "bg-emerald-50 text-emerald-600 border-emerald-100",
      };
    }
    if (type === "withdraw") {
      return {
        title: "Rút tiền",
        sub: t.bank_name ? `${t.bank_name} · ${t.account_number ? `...${String(t.account_number).slice(-4)}` : ""}` : "Rút về tài khoản",
        isPositive: false,
        icon: ArrowUpRight,
        iconBg: "bg-orange-50 text-orange-600 border-orange-100",
      };
    }
    if (type === "game_win" || type === "win") {
      return {
        title: "Thưởng thắng cược",
        sub: t.description || "Game Casino",
        isPositive: true,
        icon: Gamepad2,
        iconBg: "bg-purple-50 text-purple-600 border-purple-100",
      };
    }
    if (type === "wheel_reward" || type === "reward") {
      return {
        title: "Thưởng vòng quay",
        sub: t.description || "Ưu đãi thành viên",
        isPositive: true,
        icon: Gift,
        iconBg: "bg-amber-50 text-amber-600 border-amber-100",
      };
    }
    return {
      title: t.description || "Biến động số dư",
      sub: "Giao dịch ví",
      isPositive: (t.amount || 0) >= 0,
      icon: Wallet,
      iconBg: "bg-gray-50 text-gray-600 border-gray-100",
    };
  };

  return (
    <div className="space-y-2 font-heading">
      {/* Filter tabs nhỏ gọn */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => {
              setFilterType(opt.value);
              setShowAll(false);
            }}
            className={`text-[10px] font-semibold px-2.5 py-1 rounded-lg whitespace-nowrap transition-all ${
              filterType === opt.value
                ? "bg-[#948154] text-white shadow-xs"
                : "bg-white text-gray-500 border border-gray-200/80 hover:bg-gray-50"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Transaction List */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl p-4 text-center text-[11px] text-gray-400 border border-gray-100">
          Chưa có giao dịch phù hợp
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-xs border border-gray-100 divide-y divide-gray-50 overflow-hidden">
          {displayList.map((t) => {
            const status = t.status || "completed";
            const statusCfg = STATUS_CONFIG[status] || STATUS_CONFIG.completed;
            const isRejected = status === "rejected" || status === "failed";
            const typeInfo = getTxTypeInfo(t);
            const Icon = typeInfo.icon;

            return (
              <div
                key={t.id}
                onClick={() => setSelectedTx(t)}
                className="flex items-center gap-2.5 p-2.5 hover:bg-gray-50/80 active:bg-gray-100/70 transition-colors cursor-pointer"
              >
                {/* Icon */}
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${typeInfo.iconBg}`}>
                  <Icon className="w-4 h-4" />
                </div>

                {/* Main Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <p className={`text-[11px] font-bold truncate ${isRejected ? "text-gray-400 line-through" : "text-gray-900"}`}>
                      {typeInfo.title}
                    </p>
                    <p className={`text-[11.5px] font-extrabold tracking-tight shrink-0 ${
                      isRejected
                        ? "text-gray-400 line-through"
                        : typeInfo.isPositive
                        ? "text-emerald-600"
                        : "text-orange-600"
                    }`}>
                      {typeInfo.isPositive ? "+" : "−"}{fmt(t.amount)} <span className="text-[9px] font-semibold">đ</span>
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-1 mt-0.5">
                    <p className="text-[9.5px] text-gray-400 truncate">
                      {formatCompactTime(t.created_date || t.created_at)}
                    </p>
                    <span className={`inline-flex items-center gap-1 text-[8.5px] font-semibold px-1.5 py-0.2 rounded-full border ${statusCfg.badgeClass}`}>
                      <span className={`w-1 h-1 rounded-full ${statusCfg.dotClass} ${statusCfg.spin ? "animate-pulse" : ""}`} />
                      {statusCfg.label}
                    </span>
                  </div>
                </div>

                <ChevronRight className="w-3 h-3 text-gray-300 shrink-0" />
              </div>
            );
          })}
        </div>
      )}

      {/* Nút Xem thêm / Thu gọn */}
      {filtered.length > 5 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="w-full py-1.5 text-center text-[10px] font-bold text-[#948154] hover:text-[#7d6d45] transition-colors"
        >
          {showAll ? "Thu gọn danh sách ▲" : `Xem thêm ${filtered.length - 5} giao dịch khác ▼`}
        </button>
      )}

      {/* Modal Chi tiết Giao dịch (Khi bấm vào xem) */}
      {selectedTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl w-full max-w-[310px] p-4 shadow-xl border border-gray-100 space-y-3 font-heading relative animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <h3 className="text-[13px] font-bold text-gray-900 flex items-center gap-1.5">
                <Wallet className="w-4 h-4 text-[#948154]" /> Chi tiết giao dịch
              </h3>
              <button
                onClick={() => setSelectedTx(null)}
                className="w-6 h-6 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Số tiền nổi bật */}
            <div className="text-center py-2 bg-gray-50 rounded-xl border border-gray-100">
              <p className="text-[10px] text-gray-500 font-medium">Số tiền biến động</p>
              <p className={`text-[17px] font-extrabold tracking-tight mt-0.5 ${
                (selectedTx.status === "rejected" || selectedTx.status === "failed")
                  ? "text-gray-400 line-through"
                  : selectedTx.type === "deposit" || selectedTx.type === "game_win" || selectedTx.type === "reward"
                  ? "text-emerald-600"
                  : "text-orange-600"
              }`}>
                {selectedTx.type === "deposit" || selectedTx.type === "game_win" || selectedTx.type === "reward" ? "+" : "−"}
                {fmt(selectedTx.amount)} VNĐ
              </p>
              <div className="mt-1.5 flex justify-center">
                {(() => {
                  const cfg = STATUS_CONFIG[selectedTx.status || "completed"] || STATUS_CONFIG.completed;
                  return (
                    <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full border ${cfg.badgeClass}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dotClass}`} />
                      {cfg.label}
                    </span>
                  );
                })()}
              </div>
            </div>

            {/* Chi tiết từng dòng */}
            <div className="space-y-1.5 text-[11px]">
              <div className="flex justify-between items-center py-1 border-b border-gray-50">
                <span className="text-gray-400">Loại giao dịch</span>
                <span className="font-semibold text-gray-800">
                  {selectedTx.type === "deposit" ? "Nạp tiền vào ví" : selectedTx.type === "withdraw" ? "Rút tiền về ngân hàng" : "Giao dịch hệ thống"}
                </span>
              </div>

              {selectedTx.code && (
                <div className="flex justify-between items-center py-1 border-b border-gray-50">
                  <span className="text-gray-400">Mã giao dịch</span>
                  <button
                    onClick={() => handleCopyCode(selectedTx.code)}
                    className="flex items-center gap-1 font-mono font-bold text-gray-700 hover:text-[#948154]"
                  >
                    <span>{selectedTx.code}</span>
                    {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3 text-gray-400" />}
                  </button>
                </div>
              )}

              {selectedTx.bank_name && (
                <div className="flex justify-between items-center py-1 border-b border-gray-50">
                  <span className="text-gray-400">Ngân hàng</span>
                  <span className="font-semibold text-gray-800">{selectedTx.bank_name}</span>
                </div>
              )}

              {selectedTx.account_number && (
                <div className="flex justify-between items-center py-1 border-b border-gray-50">
                  <span className="text-gray-400">Số tài khoản</span>
                  <span className="font-mono font-semibold text-gray-800">{selectedTx.account_number}</span>
                </div>
              )}

              <div className="flex justify-between items-center py-1 border-b border-gray-50">
                <span className="text-gray-400">Thời gian</span>
                <span className="font-medium text-gray-700">{formatFullDateTime(selectedTx.created_date || selectedTx.created_at)}</span>
              </div>

              {selectedTx.description && (
                <div className="flex justify-between items-start py-1 border-b border-gray-50">
                  <span className="text-gray-400 shrink-0">Nội dung</span>
                  <span className="font-medium text-gray-700 text-right max-w-[180px] break-words">{selectedTx.description}</span>
                </div>
              )}

              {selectedTx.rejection_reason && (
                <div className="bg-rose-50 border border-rose-100 rounded-lg p-2 mt-1">
                  <p className="text-[9.5px] font-bold text-rose-700">Lý do từ chối:</p>
                  <p className="text-[10px] text-rose-600 mt-0.5">{selectedTx.rejection_reason}</p>
                </div>
              )}
            </div>

            <button
              onClick={() => setSelectedTx(null)}
              className="w-full py-2 bg-[#948154] hover:bg-[#7d6d45] text-white text-[11px] font-bold rounded-xl transition-colors shadow-xs"
            >
              Đóng
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

