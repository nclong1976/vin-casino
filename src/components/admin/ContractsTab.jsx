import React, { useState, useEffect } from "react";
import { Check, X, FileSignature } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

const fmt = (n) => (n || 0).toLocaleString("vi-VN");

const STATUS_CONFIG = {
  pending: { label: "Chờ duyệt", color: "bg-orange-100 text-orange-600" },
  approved: { label: "Đã duyệt", color: "bg-green-100 text-green-600" },
  rejected: { label: "Từ chối", color: "bg-red-100 text-red-600" },
};

export default function ContractsTab() {
  const [txs, setTxs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending");

  const fetch = () => {
    base44.entities.Transaction
      .filter({ signature_content: { $exists: true } }, "-created_date", 50)
      .then(setTxs)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetch();
  }, []);

  const handleAction = async (tx, action) => {
    try {
      await base44.entities.Transaction.update(tx.id, { contract_status: action });
      if (action === "approved" && tx.created_by_id) {
        await base44.entities.Notification.create({
          title: "Hợp đồng đã được duyệt",
          content: `Hợp đồng đầu tư "${tx.project_title}" (${(tx.amount || 0).toLocaleString("vi-VN")} VNĐ) đã được Admin phê duyệt. Tổng nhận dự kiến: ${(tx.total || 0).toLocaleString("vi-VN")} VNĐ.`,
          type: "contract",
          user_id: tx.created_by_id,
          is_read: false,
        });
      }
      toast.success(action === "approved" ? "Đã duyệt hợp đồng" : "Đã từ chối hợp đồng");
      fetch();
    } catch (e) {
      toast.error("Không thể cập nhật");
    }
  };

  const filtered = txs.filter((t) => {
    const status = t.contract_status || "pending";
    return filter === "all" || status === filter;
  });

  if (loading)
    return <div className="text-center py-8 text-[13px] text-gray-400">Đang tải...</div>;

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {["pending", "approved", "rejected", "all"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
              filter === f ? "bg-[#948154] text-white" : "bg-white text-gray-400 shadow-sm"
            }`}
          >
            {f === "all" ? "Tất cả" : STATUS_CONFIG[f].label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center text-[13px] text-gray-400 shadow-sm">
          <FileSignature className="w-8 h-8 text-gray-200 mx-auto mb-2" />
          Không có hợp đồng nào
        </div>
      ) : (
        filtered.map((tx) => {
          const status = tx.contract_status || "pending";
          const sc = STATUS_CONFIG[status];
          return (
            <div key={tx.id} className="bg-white rounded-xl p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[13px] font-bold text-black">{tx.project_title}</p>
                  <p className="text-[10px] text-gray-400">
                    {new Date(tx.created_date).toLocaleString("vi-VN")}
                  </p>
                </div>
                <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full ${sc.color} shrink-0`}>
                  {sc.label}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-3 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-gray-500">Số tiền</span>
                  <span className="font-bold text-black">{fmt(tx.amount)} VNĐ</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Phương thức</span>
                  <span className="font-medium text-black">{tx.method || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Lãi/ngày</span>
                  <span className="font-medium text-black">{tx.rate?.toFixed(2)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Tổng nhận</span>
                  <span className="font-bold text-[#948154]">{fmt(tx.total)} VNĐ</span>
                </div>
              </div>

              {tx.signature_content && (
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                  <span className="text-[9px] text-gray-400 shrink-0">Chữ ký:</span>
                  <div className="h-10 flex items-center">
                    {tx.signature_type === "draw" ? (
                      <img src={tx.signature_content} alt="sig" className="h-10 object-contain" />
                    ) : (
                      <span style={{ fontFamily: "'Great Vibes', cursive" }} className="text-[18px] text-[#16100b]">
                        {tx.signature_content}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {status === "pending" && (
                <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                  <button
                    onClick={() => handleAction(tx, "approved")}
                    className="flex-1 py-2 rounded-lg bg-green-500 hover:bg-green-600 text-white text-[11px] font-semibold flex items-center justify-center gap-1"
                  >
                    <Check className="w-3.5 h-3.5" /> Duyệt
                  </button>
                  <button
                    onClick={() => handleAction(tx, "rejected")}
                    className="flex-1 py-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 text-[11px] font-semibold flex items-center justify-center gap-1"
                  >
                    <X className="w-3.5 h-3.5" /> Từ chối
                  </button>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}