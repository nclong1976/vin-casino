import React from "react";
import { ArrowDownToLine, ArrowUpFromLine, Clock, CheckCircle2, AlertCircle } from "lucide-react";

const fmt = (n) => (n || 0).toLocaleString("vi-VN");

const formatDateTimeSeconds = (dateStr) => {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    const datePart = d.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
    const timePart = d.toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
    return `${datePart} ${timePart}`;
  } catch (e) {
    return dateStr;
  }
};

export default function WalletTransactionList({ items = [], loading = false }) {
  if (loading)
    return <div className="text-center py-4 text-[11px] text-gray-400">Đang tải lịch sử giao dịch...</div>;

  if (items.length === 0)
    return (
      <div className="bg-white rounded-2xl p-5 text-center text-[11px] text-gray-400 shadow-xs border border-gray-100">
        Chưa có giao dịch ví nào được ghi nhận
      </div>
    );

  return (
    <div className="space-y-2">
      {items.map((t) => {
        const isDeposit = t.type === "deposit";
        const status = t.status || "completed";

        return (
          <div
            key={t.id}
            className="bg-white rounded-2xl p-3 shadow-2xs border border-gray-100 flex items-center gap-3 hover:border-gray-200 transition-all"
          >
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-2xs ${
                isDeposit ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-orange-50 text-orange-600 border border-orange-100"
              }`}
            >
              {isDeposit ? (
                <ArrowDownToLine className="w-4.5 h-4.5" />
              ) : (
                <ArrowUpFromLine className="w-4.5 h-4.5" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-[11.5px] font-bold text-black truncate">
                  {isDeposit ? "Nạp tiền vào ví" : "Rút tiền về ngân hàng"}
                </p>
                {t.code && (
                  <span className="text-[8px] font-mono font-bold bg-gray-100 text-gray-500 px-1.5 py-0.2 rounded shrink-0">
                    {t.code}
                  </span>
                )}
              </div>

              <p className="text-[9.5px] text-gray-500 truncate mt-0.5">
                {t.bank_name ? `${t.bank_name} · ` : ""}{formatDateTimeSeconds(t.created_date)}
              </p>
            </div>

            <div className="text-right shrink-0 space-y-0.5">
              <p className={`text-[12px] font-extrabold ${isDeposit ? "text-emerald-600" : "text-orange-600"}`}>
                {isDeposit ? "+" : "−"}{fmt(t.amount)} <span className="text-[9px] font-semibold">VNĐ</span>
              </p>

              <div>
                {status === "completed" && (
                  <span className="inline-flex items-center gap-0.5 text-[8.5px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.2 rounded-full border border-emerald-100">
                    <CheckCircle2 className="w-2.5 h-2.5" /> Hoàn tất
                  </span>
                )}
                {status === "pending" && (
                  <span className="inline-flex items-center gap-0.5 text-[8.5px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.2 rounded-full border border-amber-100">
                    <Clock className="w-2.5 h-2.5 animate-spin" /> Đang xử lý
                  </span>
                )}
                {status === "failed" && (
                  <span className="inline-flex items-center gap-0.5 text-[8.5px] font-bold text-red-600 bg-red-50 px-1.5 py-0.2 rounded-full border border-red-100">
                    <AlertCircle className="w-2.5 h-2.5" /> Thất bại
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
