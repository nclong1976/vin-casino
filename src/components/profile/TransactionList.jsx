import React, { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, FileText, CheckCircle2, Clock, XCircle, TrendingUp } from "lucide-react";
import { computeInterestReceivedSoFar } from "@/lib/investmentTerms";

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

  // Tổng quan toàn bộ lịch sử đầu tư - trả lời trực tiếp "đầu tư bao nhiêu
  // tiền, lãi bao nhiêu tiền" ở NGAY đầu danh sách thay vì phải cộng tay
  // từng hợp đồng. totalReceived dùng computeInterestReceivedSoFar() (khớp
  // đúng số tiền lãi THẬT đã cộng vào ví tới hiện tại, không phải ước lượng)
  // - khác totalExpected (tổng lãi dự kiến cho TRỌN kỳ hạn mọi hợp đồng).
  // Đặt TRƯỚC mọi early-return bên dưới - Hooks không được gọi có điều kiện.
  const { totalInvested, totalReceived, totalExpected } = useMemo(() => {
    return txs.reduce(
      (acc, t) => ({
        totalInvested: acc.totalInvested + (Number(t.amount) || 0),
        totalReceived: acc.totalReceived + computeInterestReceivedSoFar(t),
        totalExpected: acc.totalExpected + (Number(t.profit) || 0),
      }),
      { totalInvested: 0, totalReceived: 0, totalExpected: 0 }
    );
  }, [txs]);

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
      {/* Tổng quan đầu tư */}
      <div className="bg-gradient-to-br from-[#948154] to-[#7d6c43] rounded-xl p-3 text-white shadow-xs">
        <div className="flex items-center gap-1.5 mb-2">
          <TrendingUp className="w-3.5 h-3.5" />
          <h3 className="text-[11px] font-bold">Tổng quan đầu tư của bạn</h3>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <div>
            <span className="text-[9px] text-white/70 block">Tổng đã đầu tư</span>
            <span className="text-[12px] font-extrabold block">{fmt(totalInvested)} đ</span>
          </div>
          <div>
            <span className="text-[9px] text-white/70 block">Lãi đã nhận</span>
            <span className="text-[12px] font-extrabold block text-emerald-200">+{fmt(totalReceived)} đ</span>
          </div>
          <div>
            <span className="text-[9px] text-white/70 block">Lãi dự kiến toàn kỳ</span>
            <span className="text-[12px] font-extrabold block text-amber-200">{fmt(totalExpected)} đ</span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-xs border border-gray-100 divide-y divide-gray-50 overflow-hidden">
        {displayList.map((t) => {
          const received = computeInterestReceivedSoFar(t);
          const expected = Number(t.profit) || 0;
          return (
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

            {/* Compact grid stats - "Lãi đã nhận" là số tiền lãi THẬT đã
                cộng vào ví tới hiện tại (computeInterestReceivedSoFar),
                khác với t.profit (lãi dự kiến cho TRỌN kỳ hạn) - hiện thêm
                dòng "Dự kiến toàn kỳ" bên dưới khi 2 số này còn lệch nhau,
                để người dùng thấy rõ đã nhận bao nhiêu / sẽ nhận thêm bao nhiêu. */}
            <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-dashed border-gray-100 text-[10.5px]">
              <div>
                <span className="text-[9.5px] text-gray-400 block">Đầu tư</span>
                <span className="font-extrabold text-gray-900">{fmt(t.amount)} đ</span>
              </div>
              <div className="text-center">
                <span className="text-[9.5px] text-gray-400 block">Lãi đã nhận</span>
                <span className="font-extrabold text-rose-600">+{fmt(received)} đ</span>
              </div>
              <div className="text-right">
                <span className="text-[9.5px] text-gray-400 block">Thời hạn</span>
                <span className="font-semibold text-gray-700">{t.duration_days || 0} ngày</span>
              </div>
            </div>
            {received < expected && (
              <p className="text-[9.5px] text-gray-400 mt-1 text-right">
                Lãi dự kiến toàn kỳ: <span className="font-semibold text-gray-600">{fmt(expected)} đ</span>
              </p>
            )}

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
          );
        })}
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