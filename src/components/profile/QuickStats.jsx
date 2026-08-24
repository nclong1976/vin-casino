import React from "react";
import { TrendingUp, TrendingDown, Receipt } from "lucide-react";

const fmt = (n) => (n || 0).toLocaleString("vi-VN");

export default function QuickStats({ invested, profit, count }) {
  // border-gray-100 thêm vào đây - trang Thẻ Thành Viên (nơi cụm này giờ
  // được mount) dùng nhất quán border-gray-100 trên MỌI card trắng, khác
  // với Profile.jsx (nơi cụm này ở trước đây) chỉ dùng shadow-sm trơn.
  // Đặt trong component vì sau khi di dời, QuickStats chỉ còn 1 nơi dùng.
  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="bg-white rounded-xl p-2.5 shadow-sm border border-gray-100 text-center">
        <div className="w-7 h-7 rounded-full bg-[#948154]/10 flex items-center justify-center mx-auto mb-1">
          <Receipt className="w-3.5 h-3.5 text-[#948154]" />
        </div>
        <p className="text-[8px] text-gray-400">Giao dịch</p>
        <p className="text-[13px] font-bold text-black">{count}</p>
      </div>
      <div className="bg-white rounded-xl p-2.5 shadow-sm border border-gray-100 text-center">
        <div className="w-7 h-7 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-1">
          <TrendingUp className="w-3.5 h-3.5 text-blue-500" />
        </div>
        <p className="text-[8px] text-gray-400">Đã đầu tư</p>
        <p className="text-[11px] font-bold text-black leading-tight">{fmt(invested)}</p>
      </div>
      <div className="bg-white rounded-xl p-2.5 shadow-sm border border-gray-100 text-center">
        <div className="w-7 h-7 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-1">
          <TrendingDown className="w-3.5 h-3.5 text-[#D32F2F]" />
        </div>
        <p className="text-[8px] text-gray-400">Lãi dự kiến</p>
        <p className="text-[11px] font-bold text-[#D32F2F] leading-tight">{fmt(profit)}</p>
      </div>
    </div>
  );
}