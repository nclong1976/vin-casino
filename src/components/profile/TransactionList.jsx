import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

const fmt = (n) => (n || 0).toLocaleString("vi-VN");

export default function TransactionList({ txs, loading }) {
  if (loading)
    return (
      <div className="text-center py-4 text-[11px] text-gray-400">Đang tải...</div>
    );
  if (txs.length === 0)
    return (
      <div className="bg-white rounded-xl p-4 text-center text-[11px] text-gray-400 shadow-sm">
        Chưa có giao dịch nào
      </div>
    );

  const totalInvested = txs.reduce((s, t) => s + (t.amount || 0), 0);
  const totalProfit = txs.reduce((s, t) => s + (t.profit || 0), 0);

  return (
    <div className="space-y-2">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white rounded-xl p-2.5 shadow-sm text-center">
          <p className="text-[8px] text-gray-400">Giao dịch</p>
          <p className="text-[13px] font-bold text-black">{txs.length}</p>
        </div>
        <div className="bg-white rounded-xl p-2.5 shadow-sm text-center">
          <p className="text-[8px] text-gray-400">Đã đầu tư</p>
          <p className="text-[11px] font-bold text-black leading-tight">
            {fmt(totalInvested)}
          </p>
        </div>
        <div className="bg-white rounded-xl p-2.5 shadow-sm text-center">
          <p className="text-[8px] text-gray-400">Lãi dự kiến</p>
          <p className="text-[11px] font-bold text-[#D32F2F] leading-tight">
            {fmt(totalProfit)}
          </p>
        </div>
      </div>

      {txs.map((t) => (
        <div key={t.id} className="bg-white rounded-xl p-3 shadow-sm">
          <div className="flex justify-between items-start">
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-black truncate">
                {t.project_title}
              </p>
              <p className="text-[10px] text-gray-400">
                {new Date(t.created_date).toLocaleDateString("vi-VN")} · {t.method}
              </p>
            </div>
            <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-600 shrink-0">
              HOÀN TẤT
            </span>
          </div>

          <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2 text-[11px]">
            <div className="flex justify-between">
              <span className="text-gray-500">Số tiền</span>
              <span className="font-bold text-black">{fmt(t.amount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Lãi/ngày</span>
              <span className="font-semibold text-black">{t.rate?.toFixed(2)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Thời gian</span>
              <span className="font-semibold text-black">{t.duration_days} ngày</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Lãi dự kiến</span>
              <span className="font-bold text-[#D32F2F]">{fmt(t.profit)}</span>
            </div>
          </div>

          <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-100">
            <span className="text-[11px] text-gray-500">Tổng nhận</span>
            <span className="text-[13px] font-bold text-[#948154]">
              {fmt(t.total)} VNĐ
            </span>
          </div>

          {t.signature_content && (
            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100">
              <span className="text-[9px] text-gray-400 shrink-0">Chữ ký:</span>
              <div className="h-8 flex items-center">
                {t.signature_type === "draw" ? (
                  <img
                    src={t.signature_content}
                    alt="sig"
                    className="h-8 object-contain"
                  />
                ) : (
                  <span
                    style={{ fontFamily: "'Great Vibes', cursive" }}
                    className="text-[16px] text-[#16100b]"
                  >
                    {t.signature_content}
                  </span>
                )}
              </div>
            </div>
          )}
          <Link
            to={`/contract/${t.id}`}
            className="flex items-center justify-center gap-1 mt-2 pt-2 border-t border-gray-100 text-[10px] font-medium text-[#948154]"
          >
            Xem hợp đồng <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      ))}
    </div>
  );
}