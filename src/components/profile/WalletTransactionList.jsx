import React, { useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Clock, CheckCircle2, AlertCircle, XCircle, Filter } from "lucide-react";

const fmt = (n) => (n || 0).toLocaleString("vi-VN");

const formatDateTimeSeconds = (dateStr) => {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }) + " " + d.toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (e) {
    return dateStr;
  }
};

const STATUS_CONFIG = {
  completed: {
    label: "Hoàn tất",
    icon: CheckCircle2,
    className: "text-emerald-600 bg-emerald-50 border-emerald-100",
  },
  pending: {
    label: "Đang xử lý",
    icon: Clock,
    className: "text-amber-600 bg-amber-50 border-amber-100",
    spin: true,
  },
  failed: {
    label: "Thất bại",
    icon: AlertCircle,
    className: "text-red-600 bg-red-50 border-red-100",
  },
  rejected: {
    label: "Bị từ chối",
    icon: XCircle,
    className: "text-red-600 bg-red-50 border-red-100",
  },
};

const FILTER_OPTIONS = [
  { value: "all", label: "Tất cả" },
  { value: "deposit", label: "Nạp tiền" },
  { value: "withdraw", label: "Rút tiền" },
  { value: "pending", label: "Đang xử lý" },
];

export default function WalletTransactionList({ items = [], loading = false }) {
  const [filterType, setFilterType] = useState("all");

  if (loading)
    return (
      <div className="text-center py-6 text-[11px] text-gray-400 flex flex-col items-center gap-2">
        <Clock className="w-5 h-5 animate-spin text-gray-300" />
        Đang tải lịch sử giao dịch...
      </div>
    );

  // Sắp xếp mới nhất lên đầu
  const sorted = [...items].sort((a, b) => {
    const da = new Date(a.created_date || a.created_at || 0);
    const db = new Date(b.created_date || b.created_at || 0);
    return db - da;
  });

  // Lọc theo loại
  const filtered = sorted.filter((t) => {
    if (filterType === "all") return true;
    if (filterType === "deposit") return t.type === "deposit";
    if (filterType === "withdraw") return t.type === "withdraw";
    if (filterType === "pending") return (t.status || "completed") === "pending";
    return true;
  });

  // Tổng kết nhanh
  const totalDeposit = sorted.filter(t => t.type === "deposit" && t.status !== "rejected").reduce((s, t) => s + (t.amount || 0), 0);
  const totalWithdraw = sorted.filter(t => t.type === "withdraw" && t.status === "completed").reduce((s, t) => s + (t.amount || 0), 0);
  const pendingCount = sorted.filter(t => (t.status || "completed") === "pending").length;

  return (
    <div className="space-y-3">
      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-emerald-50 rounded-xl p-2.5 border border-emerald-100 text-center">
          <p className="text-[9px] text-emerald-600 font-bold uppercase tracking-wide">Đã nạp</p>
          <p className="text-[12px] font-extrabold text-emerald-700">+{fmt(totalDeposit)}</p>
        </div>
        <div className="bg-orange-50 rounded-xl p-2.5 border border-orange-100 text-center">
          <p className="text-[9px] text-orange-600 font-bold uppercase tracking-wide">Đã rút</p>
          <p className="text-[12px] font-extrabold text-orange-700">−{fmt(totalWithdraw)}</p>
        </div>
        <div className="bg-amber-50 rounded-xl p-2.5 border border-amber-100 text-center">
          <p className="text-[9px] text-amber-600 font-bold uppercase tracking-wide">Đang xử lý</p>
          <p className="text-[12px] font-extrabold text-amber-700">{pendingCount}</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setFilterType(opt.value)}
            className={`text-[10px] font-semibold px-3 py-1.5 rounded-full whitespace-nowrap transition-all border ${
              filterType === opt.value
                ? "bg-black text-white border-black"
                : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Transaction list */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl p-5 text-center text-[11px] text-gray-400 shadow-xs border border-gray-100">
          Không có giao dịch nào phù hợp
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((t) => {
            const isDeposit = t.type === "deposit";
            const status = t.status || "completed";
            const statusCfg = STATUS_CONFIG[status] || STATUS_CONFIG.completed;
            const StatusIcon = statusCfg.icon;
            const isRejected = status === "rejected" || status === "failed";

            return (
              <div
                key={t.id}
                className={`bg-white rounded-2xl p-3 shadow-2xs border transition-all ${
                  isRejected
                    ? "border-red-100 opacity-70"
                    : status === "pending"
                    ? "border-amber-100"
                    : "border-gray-100 hover:border-gray-200"
                }`}
              >
                <div className="flex items-center gap-3">
                  {/* Icon */}
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-2xs ${
                      isRejected
                        ? "bg-red-50 text-red-400 border border-red-100"
                        : isDeposit
                        ? "bg-emerald-50 text-emerald-600 border border-emerald-100"
                        : "bg-orange-50 text-orange-600 border border-orange-100"
                    }`}
                  >
                    {isDeposit ? (
                      <ArrowDownToLine className="w-4 h-4" />
                    ) : (
                      <ArrowUpFromLine className="w-4 h-4" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className={`text-[11.5px] font-bold truncate ${isRejected ? "text-gray-400 line-through" : "text-black"}`}>
                        {isDeposit ? "Nạp tiền vào ví" : "Rút tiền về ngân hàng"}
                      </p>
                      {t.code && (
                        <span className="text-[8px] font-mono font-bold bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded shrink-0">
                          {t.code}
                        </span>
                      )}
                    </div>
                    {t.description && (
                      <p className="text-[9px] text-gray-400 truncate mt-0.5 italic">{t.description}</p>
                    )}
                    <p className="text-[9px] text-gray-400 mt-0.5">
                      {t.bank_name ? `${t.bank_name} · ` : ""}{formatDateTimeSeconds(t.created_date || t.created_at)}
                    </p>
                    {/* Rejection reason */}
                    {isRejected && t.rejection_reason && (
                      <p className="text-[9px] text-red-500 mt-0.5 font-medium">
                        Lý do: {t.rejection_reason}
                      </p>
                    )}
                  </div>

                  {/* Amount + Status */}
                  <div className="text-right shrink-0 space-y-1">
                    <p className={`text-[12px] font-extrabold ${
                      isRejected ? "text-gray-400 line-through" : isDeposit ? "text-emerald-600" : "text-orange-600"
                    }`}>
                      {isDeposit ? "+" : "−"}{fmt(t.amount)} <span className="text-[9px] font-semibold">VNĐ</span>
                    </p>
                    <span className={`inline-flex items-center gap-0.5 text-[8px] font-bold px-1.5 py-0.5 rounded-full border ${statusCfg.className}`}>
                      <StatusIcon className={`w-2.5 h-2.5 ${statusCfg.spin ? "animate-spin" : ""}`} />
                      {statusCfg.label}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
