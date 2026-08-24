import React, { useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  TrendingUp,
  Gift,
  Clock,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  X,
  Copy,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { buildTransactionHistory, TRANSACTION_KINDS } from "@/lib/transactionHistory";
import WithdrawalStatusBadge from "@/components/profile/WithdrawalStatusBadge";

const fmt = (n) => (n || 0).toLocaleString("vi-VN");

/** HH:mm:ss - DD/MM/YYYY, theo đúng yêu cầu hiển thị thời gian chính xác trên mỗi dòng. */
const formatPreciseTime = (isoTime) => {
  if (!isoTime) return "—";
  const d = new Date(isoTime);
  if (Number.isNaN(d.getTime())) return "—";
  const time = d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const date = d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
  return `${time} - ${date}`;
};

const KIND_STYLE = {
  [TRANSACTION_KINDS.DEPOSIT]: { icon: ArrowDownLeft, iconBg: "bg-emerald-50 text-emerald-600 border-emerald-100" },
  [TRANSACTION_KINDS.WITHDRAW]: { icon: ArrowUpRight, iconBg: "bg-orange-50 text-orange-600 border-orange-100" },
  [TRANSACTION_KINDS.INVESTMENT]: { icon: TrendingUp, iconBg: "bg-purple-50 text-purple-600 border-purple-100" },
  [TRANSACTION_KINDS.BONUS]: { icon: Gift, iconBg: "bg-amber-50 text-amber-600 border-amber-100" },
};

const STATUS_STYLE = {
  success: { label: "Thành công", icon: CheckCircle2, badgeClass: "text-emerald-700 bg-emerald-50 border-emerald-200/60", dotClass: "bg-emerald-500" },
  pending: { label: "Chờ xử lý", icon: Clock, badgeClass: "text-amber-700 bg-amber-50 border-amber-200/60", dotClass: "bg-amber-500 animate-pulse" },
  failed: { label: "Thất bại", icon: AlertCircle, badgeClass: "text-rose-700 bg-rose-50 border-rose-200/60", dotClass: "bg-rose-500" },
};

// Bộ lọc loại giao dịch: Nạp/Rút gộp chung 1 nhóm vì cùng là thao tác trên
// ví ngân hàng, Đầu tư/Đặt cược tách riêng theo đúng yêu cầu.
const KIND_FILTERS = [
  { value: "all", label: "Tất cả" },
  { value: "wallet", label: "Nạp / Rút", kinds: [TRANSACTION_KINDS.DEPOSIT, TRANSACTION_KINDS.WITHDRAW] },
  { value: "investment", label: "Đầu tư", kinds: [TRANSACTION_KINDS.INVESTMENT] },
  { value: "bonus", label: "Thưởng / Lãi", kinds: [TRANSACTION_KINDS.BONUS] },
];

const STATUS_FILTERS = [
  { value: "all", label: "Tất cả trạng thái" },
  { value: "pending", label: "Chờ xử lý" },
  { value: "success", label: "Thành công" },
];

export default function WalletTransactionList({ items = [], loading = false, currentBalance = 0 }) {
  const [kindFilter, setKindFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedTx, setSelectedTx] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [copied, setCopied] = useState(false);

  // buildTransactionHistory() chạy trên TOÀN BỘ items (chưa lọc) để
  // balanceAfter tính đúng - lọc để hiển thị chỉ áp dụng SAU bước này.
  const history = useMemo(() => buildTransactionHistory(items, currentBalance), [items, currentBalance]);

  const filtered = useMemo(() => {
    const kindOpt = KIND_FILTERS.find((f) => f.value === kindFilter);
    return history.filter((t) => {
      if (kindOpt?.kinds && !kindOpt.kinds.includes(t.kind)) return false;
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      return true;
    });
  }, [history, kindFilter, statusFilter]);

  const displayList = showAll ? filtered : filtered.slice(0, 5);

  const handleCopyCode = (code) => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success("Đã sao chép mã giao dịch");
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl p-5 text-center text-[11px] text-gray-400 flex flex-col items-center gap-2 border border-gray-100">
        <Clock className="w-4 h-4 animate-spin text-[#948154]" />
        Đang tải giao dịch...
      </div>
    );
  }

  return (
    <div className="space-y-2 font-heading">
      {/* Bộ lọc loại giao dịch */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
        {KIND_FILTERS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => {
              setKindFilter(opt.value);
              setShowAll(false);
            }}
            className={`text-[10px] font-semibold px-2.5 py-1 rounded-lg whitespace-nowrap transition-all cursor-pointer ${
              kindFilter === opt.value
                ? "bg-[#948154] text-white shadow-xs"
                : "bg-white text-gray-500 border border-gray-200/80 hover:bg-gray-50"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Bộ lọc trạng thái */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
        {STATUS_FILTERS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => {
              setStatusFilter(opt.value);
              setShowAll(false);
            }}
            className={`text-[9.5px] font-semibold px-2 py-0.5 rounded-md whitespace-nowrap transition-all cursor-pointer border ${
              statusFilter === opt.value
                ? "bg-[#948154]/10 text-[#948154] border-[#948154]/30"
                : "bg-white text-gray-400 border-gray-200/70 hover:bg-gray-50"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Danh sách giao dịch */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl p-4 text-center text-[11px] text-gray-400 border border-gray-100">
          Chưa có giao dịch phù hợp
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-xs border border-gray-100 divide-y divide-gray-50 overflow-hidden">
          {displayList.map((t) => {
            const kindStyle = KIND_STYLE[t.kind];
            const statusStyle = STATUS_STYLE[t.status];
            const Icon = kindStyle.icon;
            const isMuted = t.status === "failed";
            const isPositive = t.signedAmount >= 0;

            return (
              <div
                key={t.id}
                onClick={() => setSelectedTx(t)}
                className="flex items-center gap-2.5 p-2.5 hover:bg-gray-50/80 active:bg-gray-100/70 transition-colors cursor-pointer"
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${kindStyle.iconBg}`}>
                  <Icon className="w-4 h-4" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <p className={`text-[11px] font-bold truncate ${isMuted ? "text-gray-400 line-through" : "text-gray-900"}`}>
                      {t.kindLabel}
                    </p>
                    <p
                      title={`${isPositive ? "+" : "−"}${fmt(t.amount)} VNĐ`}
                      className={`text-[11.5px] font-extrabold tracking-tight shrink-0 max-w-[110px] truncate ${
                        t.status === "pending"
                          ? "text-gray-400"
                          : isMuted
                          ? "text-gray-400 line-through"
                          : isPositive
                          ? "text-emerald-600"
                          : "text-orange-600"
                      }`}
                    >
                      {t.status === "success" ? (isPositive ? "+" : "−") : ""}
                      {fmt(t.amount)} <span className="text-[9px] font-semibold">đ</span>
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-1 mt-0.5">
                    <p className="text-[9.5px] text-gray-400 truncate font-mono">{formatPreciseTime(t.isoTime)}</p>
                    {t.kind === TRANSACTION_KINDS.WITHDRAW ? (
                      <WithdrawalStatusBadge status={t.status} reason={t.rejectionReason} />
                    ) : (
                      <span className={`inline-flex items-center gap-1 text-[8.5px] font-semibold px-1.5 py-0.2 rounded-full border shrink-0 ${statusStyle.badgeClass}`}>
                        <span className={`w-1 h-1 rounded-full ${statusStyle.dotClass}`} />
                        {statusStyle.label}
                      </span>
                    )}
                  </div>

                  <p className="text-[9px] text-gray-400 mt-0.5 truncate">
                    Số dư sau: <span className="font-semibold text-gray-500">{fmt(t.balanceAfter)} VNĐ</span>
                  </p>
                </div>

                <ChevronRight className="w-3 h-3 text-gray-300 shrink-0" />
              </div>
            );
          })}
        </div>
      )}

      {filtered.length > 5 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="w-full py-1.5 text-center text-[10px] font-bold text-[#948154] hover:text-[#7d6d45] transition-colors cursor-pointer"
        >
          {showAll ? "Thu gọn danh sách ▲" : `Xem thêm ${filtered.length - 5} giao dịch khác ▼`}
        </button>
      )}

      {/* Modal chi tiết giao dịch */}
      {selectedTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl w-full max-w-[310px] p-4 shadow-xl border border-gray-100 space-y-3 font-heading relative animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <h3 className="text-[13px] font-bold text-gray-900 flex items-center gap-1.5">
                {React.createElement(KIND_STYLE[selectedTx.kind].icon, { className: "w-4 h-4 text-[#948154]" })}
                Chi tiết giao dịch
              </h3>
              <button
                onClick={() => setSelectedTx(null)}
                className="w-6 h-6 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="text-center py-2 bg-gray-50 rounded-xl border border-gray-100">
              <p className="text-[10px] text-gray-500 font-medium">{selectedTx.kindLabel}</p>
              <p
                className={`text-[17px] font-extrabold tracking-tight mt-0.5 ${
                  selectedTx.status === "failed"
                    ? "text-gray-400 line-through"
                    : selectedTx.status === "pending"
                    ? "text-gray-500"
                    : selectedTx.signedAmount >= 0
                    ? "text-emerald-600"
                    : "text-orange-600"
                }`}
              >
                {selectedTx.status === "success" ? (selectedTx.signedAmount >= 0 ? "+" : "−") : ""}
                {fmt(selectedTx.amount)} VNĐ
              </p>
              <div className="mt-1.5 flex justify-center">
                {selectedTx.kind === TRANSACTION_KINDS.WITHDRAW ? (
                  <WithdrawalStatusBadge status={selectedTx.status} reason={selectedTx.rejectionReason} />
                ) : (
                  <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full border ${STATUS_STYLE[selectedTx.status].badgeClass}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${STATUS_STYLE[selectedTx.status].dotClass}`} />
                    {STATUS_STYLE[selectedTx.status].label}
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-1.5 text-[11px]">
              <div className="flex justify-between items-center py-1 border-b border-gray-50">
                <span className="text-gray-400">Loại giao dịch</span>
                <span className="font-semibold text-gray-800">{selectedTx.kindLabel}</span>
              </div>

              {selectedTx.code && (
                <div className="flex justify-between items-center py-1 border-b border-gray-50">
                  <span className="text-gray-400">Mã giao dịch</span>
                  <button
                    onClick={() => handleCopyCode(selectedTx.code)}
                    className="flex items-center gap-1 font-mono font-bold text-gray-700 hover:text-[#948154] cursor-pointer"
                  >
                    <span>{selectedTx.code}</span>
                    {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3 text-gray-400" />}
                  </button>
                </div>
              )}

              {selectedTx.bankName && (
                <div className="flex justify-between items-center py-1 border-b border-gray-50">
                  <span className="text-gray-400">Ngân hàng</span>
                  <span className="font-semibold text-gray-800">{selectedTx.bankName}</span>
                </div>
              )}

              {selectedTx.accountNumber && (
                <div className="flex justify-between items-center py-1 border-b border-gray-50">
                  <span className="text-gray-400">Số tài khoản</span>
                  <span className="font-mono font-semibold text-gray-800">{selectedTx.accountNumber}</span>
                </div>
              )}

              <div className="flex justify-between items-center py-1 border-b border-gray-50">
                <span className="text-gray-400">Thời gian</span>
                <span className="font-medium text-gray-700 font-mono">{formatPreciseTime(selectedTx.isoTime)}</span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-gray-50">
                <span className="text-gray-400">Số dư sau giao dịch</span>
                <span className="font-semibold text-gray-800">{fmt(selectedTx.balanceAfter)} VNĐ</span>
              </div>

              {selectedTx.description && (
                <div className="flex justify-between items-start py-1 border-b border-gray-50">
                  <span className="text-gray-400 shrink-0">Nội dung</span>
                  <span className="font-medium text-gray-700 text-right max-w-[180px] break-words">{selectedTx.description}</span>
                </div>
              )}

              {selectedTx.rejectionReason && (
                <div className="bg-rose-50 border border-rose-100 rounded-lg p-2 mt-1">
                  <p className="text-[9.5px] font-bold text-rose-700">Lý do từ chối:</p>
                  <p className="text-[10px] text-rose-600 mt-0.5">{selectedTx.rejectionReason}</p>
                </div>
              )}
            </div>

            <button
              onClick={() => setSelectedTx(null)}
              className="w-full py-2 bg-[#948154] hover:bg-[#7d6d45] text-white text-[11px] font-bold rounded-xl transition-colors shadow-xs cursor-pointer"
            >
              Đóng
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
