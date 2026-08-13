import React from "react";
import { Landmark, Plus, Star, ShieldCheck, Lock } from "lucide-react";
import { getBankLogo, BANK_MAP } from "@/constants/banks";

export default function BankAccountList({ accounts, loading, onAdd }) {
  return (
    <div className="space-y-2">
      {loading ? (
        <div className="text-center py-4 text-[11px] text-gray-400">Đang tải...</div>
      ) : accounts.length === 0 ? (
        <button
          onClick={onAdd}
          className="w-full bg-white rounded-xl p-4 text-center shadow-sm border border-dashed border-gray-200"
        >
          <Landmark className="w-6 h-6 text-gray-300 mx-auto mb-1" />
          <p className="text-[11px] text-gray-400">Chưa liên kết ngân hàng</p>
          <p className="text-[10px] text-[#948154] font-medium mt-0.5">Nhấn để thêm ngay</p>
        </button>
      ) : (
        <>
          {accounts.map((acc) => {
            const logo = getBankLogo(acc.bank_code);
            const bankColor = BANK_MAP[acc.bank_code?.toUpperCase()]?.color || "#948154";
            return (
              <div key={acc.id} className="bg-white rounded-xl p-3 shadow-sm flex items-center gap-3">
                {logo ? (
                  <img
                    src={logo}
                    alt={acc.bank_name}
                    className="w-10 h-10 rounded-lg object-contain bg-white border border-gray-100 p-0.5 shrink-0 shadow-2xs"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                ) : (
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                    style={{ backgroundColor: bankColor }}
                  >
                    {acc.bank_code || "BK"}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-[11px] font-semibold text-black truncate">{acc.bank_name}</p>
                    {acc.is_default && (
                      <Star className="w-3 h-3 text-[#e8c87a] fill-[#e8c87a] shrink-0" />
                    )}
                  </div>
                  <p className="text-[12px] font-mono font-bold text-gray-800 tracking-wider flex items-center gap-1">
                    <span className="text-gray-400">•••• •••• ••••</span>
                    <span className="text-[#948154]">{(String(acc.account_number || "").trim().slice(-4)) || "••••"}</span>
                  </p>
                  <p className="text-[9px] text-gray-400 uppercase font-medium">{acc.account_holder}</p>
                </div>
                <div className="flex items-center gap-1 text-[8.5px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full shrink-0 border border-emerald-100">
                  <ShieldCheck className="w-3 h-3 text-emerald-500" />
                  <span>Đã bảo mật</span>
                </div>
              </div>
            );
          })}
          <button
            onClick={onAdd}
            className="w-full py-2.5 rounded-xl border border-dashed border-[#948154]/30 text-[11px] font-medium text-[#948154] flex items-center justify-center gap-1.5 hover:bg-[#948154]/5 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Thêm tài khoản
          </button>
          <div className="flex items-center justify-center gap-1 text-[9px] text-gray-400 mt-1.5 pt-0.5">
            <Lock className="w-2.5 h-2.5 text-[#948154] shrink-0" />
            <span>Tài khoản đã liên kết không thể tự xóa. Vui lòng liên hệ CSKH khi cần hỗ trợ.</span>
          </div>
        </>
      )}
    </div>
  );
}