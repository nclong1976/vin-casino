import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, FileText, CheckCircle2, Clock, XCircle } from "lucide-react";

const fmt = (n) => (n || 0).toLocaleString("vi-VN");

// contract_status do Admin set qua ContractsTab.jsx ("pending"/"approved"/
// "rejected") - trước đây badge LUÔN tô xanh + icon check bất kể giá trị
// thật (chỉ đổi phần chữ), khiến hợp đồng bị TỪ CHỐI vẫn trông như đã duyệt.
const CONTRACT_STATUS_CONFIG = {
  approved: { label: "Đã duyệt", icon: CheckCircle2, className: "bg-emerald-50 text-emerald-700 border-emerald-200/60" },
  pending: { label: "Chờ duyệt", icon: Clock, className: "bg-amber-50 text-amber-700 border-amber-200/60" },
  rejected: { label: "Từ chối", icon: XCircle, className: "bg-rose-50 text-rose-700 border-rose-200/60" },
};

const formatCompactDate = (dateStr) => {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch (e) {
    return dateStr;
  }
};

export default function TransactionList({ txs = [], loading = false }) {
  const [showAll, setShowAll] = useState(false);

  if (loading) {
    return (
      <div className="bg-white rounded-xl p-4 text-center text-[11px] text-gray-400 border border-gray-100">
        Đang tải danh sách hợp đồng...
      </div>
    );
  }

  if (txs.length === 0) {
    return (
      <div className="bg-white rounded-xl p-4 text-center text-[11px] text-gray-400 border border-gray-100">
        Chưa có giao dịch đầu tư nào
      </div>
    );
  }

  const displayList = showAll ? txs : txs.slice(0, 4);

  return (
    <div className="space-y-2 font-heading">
      <div className="bg-white rounded-xl shadow-xs border border-gray-100 divide-y divide-gray-50 overflow-hidden">
        {displayList.map((t) => (
          <div key={t.id} className="p-3 hover:bg-gray-50/80 transition-colors">
            {/* Header: Project name & status */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <FileText className="w-3.5 h-3.5 text-[#948154] shrink-0" />
                <p className="text-[11.5px] font-bold text-gray-900 truncate">
                  {t.project_title || "Hợp đồng đầu tư"}
                </p>
              </div>
              {(() => {
                // Mặc định "pending" khi thiếu contract_status - khớp đúng
                // cách ContractsTab.jsx (nơi Admin duyệt) tự diễn giải field
                // này (`tx.contract_status || "pending"`), tránh 2 nơi hiểu
                // khác nhau về cùng 1 giao dịch.
                const sc = CONTRACT_STATUS_CONFIG[t.contract_status] || CONTRACT_STATUS_CONFIG.pending;
                const StatusIcon = sc.icon;
                return (
                  <span className={`inline-flex items-center gap-0.5 text-[8.5px] font-bold px-1.5 py-0.2 rounded-full border shrink-0 ${sc.className}`}>
                    <StatusIcon className="w-2.5 h-2.5" />
                    {sc.label}
                  </span>
                );
              })()}
            </div>

            {/* Compact grid stats */}
            <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-dashed border-gray-100 text-[10.5px]">
              <div>
                <span className="text-[9.5px] text-gray-400 block">Đầu tư</span>
                <span className="font-extrabold text-gray-900">{fmt(t.amount)} đ</span>
              </div>
              <div className="text-center">
                <span className="text-[9.5px] text-gray-400 block">Lợi nhuận</span>
                <span className="font-extrabold text-rose-600">+{fmt(t.profit)} đ</span>
              </div>
              <div className="text-right">
                <span className="text-[9.5px] text-gray-400 block">Thời hạn</span>
                <span className="font-semibold text-gray-700">{t.duration_days || 0} ngày</span>
              </div>
            </div>

            {/* Daily payout progress - chỉ giao dịch payout_model DAILY_ACCRUAL
                (VinHomes/Đầu tư nghỉ dưỡng tạo sau khi bật cơ chế trả lãi hàng
                ngày) mới có 2 field này khác 0/null. Giao dịch LUMP_SUM
                (Dự Án/Chứng khoán + hợp đồng VinHomes cũ) không hiện gì thêm. */}
            {t.payout_model === "DAILY_ACCRUAL" && (
              <div className="mt-2 pt-1.5 border-t border-dashed border-gray-100">
                <div className="flex items-center justify-between text-[9.5px] text-gray-400 mb-1">
                  <span>Giải ngân lãi hàng ngày</span>
                  <span className="font-bold text-emerald-600">
                    Đã nhận {t.daily_payout_days_paid || 0}/{t.duration_days || 0} ngày
                  </span>
                </div>
                <div className="h-1 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{
                      width: `${t.duration_days ? Math.min(100, ((t.daily_payout_days_paid || 0) / t.duration_days) * 100) : 0}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {/* Footer action */}
            <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-gray-50">
              <span className="text-[9.5px] text-gray-400">
                {formatCompactDate(t.created_date)}
              </span>
              <Link
                to={`/contract/${t.id}`}
                className="inline-flex items-center gap-1 text-[10px] font-bold text-[#948154] hover:text-[#7d6d45] transition-colors"
              >
                Xem chi tiết hợp đồng <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </div>
        ))}
      </div>

      {txs.length > 4 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="w-full py-1.5 text-center text-[10px] font-bold text-[#948154] hover:text-[#7d6d45] transition-colors"
        >
          {showAll ? "Thu gọn danh sách ▲" : `Xem thêm ${txs.length - 4} hợp đồng khác ▼`}
        </button>
      )}
    </div>
  );
}