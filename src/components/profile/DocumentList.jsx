import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, FileText, CheckCircle2, Clock, XCircle } from "lucide-react";

const STATUS_CONFIG = {
  pending: { label: "Chờ ký", icon: Clock, className: "bg-blue-50 text-blue-700 border-blue-200/60" },
  signed: { label: "Chờ duyệt", icon: Clock, className: "bg-amber-50 text-amber-700 border-amber-200/60" },
  approved: { label: "Đã duyệt", icon: CheckCircle2, className: "bg-emerald-50 text-emerald-700 border-emerald-200/60" },
  rejected: { label: "Từ chối", icon: XCircle, className: "bg-rose-50 text-rose-700 border-rose-200/60" },
  revoked: { label: "Đã thu hồi", icon: XCircle, className: "bg-gray-50 text-gray-500 border-gray-200/60" },
  expired: { label: "Quá hạn", icon: XCircle, className: "bg-gray-50 text-gray-500 border-gray-200/60" },
};
// Văn bản Giai đoạn 2 (ký điện tử) đã ký là xong, không chờ Admin duyệt.
const SIGNED_ESIGN = { label: "Đã ký", icon: CheckCircle2, className: "bg-emerald-50 text-emerald-700 border-emerald-200/60" };

const isOverdue = (d) => d.status === "pending" && d.due_at && new Date(d.due_at) < new Date();
const needsSigning = (d) => d.status === "pending" && !isOverdue(d);
const isSigned = (d) => !!d.signed_at || ["signed", "approved", "rejected"].includes(d.status);

function statusOf(d) {
  if (isOverdue(d)) return STATUS_CONFIG.expired;
  if (d.status === "signed" && d.rendered_model) return SIGNED_ESIGN;
  return STATUS_CONFIG[d.status] || STATUS_CONFIG.pending;
}

const TABS = [
  { id: "todo", label: "Cần ký", filter: needsSigning },
  { id: "signed", label: "Đã ký", filter: isSigned },
  { id: "all", label: "Tất cả", filter: () => true },
];

const formatCompactDate = (dateStr) => {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch (e) {
    return dateStr;
  }
};

/** Danh sách hợp đồng/giấy tờ TÙY Ý Admin đã gửi cho chính người dùng này
 * (bảng custom_documents) - mỗi dòng dẫn
 * tới /document/:id để đọc và ký, đúng mẫu TransactionList.jsx (hợp đồng
 * đầu tư tự sinh) nhưng đơn giản hơn (không có lãi/kỳ hạn để tính). */
export default function DocumentList({ docs = [], loading = false }) {
  const [showAll, setShowAll] = useState(false);
  const [tab, setTab] = useState(null);
  const counts = useMemo(() => Object.fromEntries(TABS.map((t) => [t.id, docs.filter(t.filter).length])), [docs]);
  // Mặc định mở "Cần ký" nếu còn văn bản chờ ký.
  const activeTab = tab || (counts.todo > 0 ? "todo" : "all");
  const filtered = docs.filter(TABS.find((t) => t.id === activeTab).filter);

  if (loading) {
    return (
      <div className="bg-white rounded-xl p-4 text-center text-[11px] text-gray-400 border border-gray-100">
        Đang tải danh sách tài liệu...
      </div>
    );
  }

  if (docs.length === 0) {
    return (
      <div className="bg-white rounded-xl p-4 text-center text-[11px] text-gray-400 border border-gray-100">
        Chưa có tài liệu nào được gửi
      </div>
    );
  }

  const displayList = showAll ? filtered : filtered.slice(0, 4);

  return (
    <div className="space-y-2 font-heading">
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={activeTab === t.id}
            onClick={() => {
              setTab(t.id);
              setShowAll(false);
            }}
            className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-[10.5px] font-semibold transition ${
              activeTab === t.id ? "bg-white text-[#948154] shadow-sm" : "text-gray-500"
            }`}
          >
            {t.label}
            {t.id === "todo" && counts.todo > 0 && (
              <span className="min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] leading-4">{counts.todo}</span>
            )}
          </button>
        ))}
      </div>
      {filtered.length === 0 && (
        <div className="bg-white rounded-xl p-4 text-center text-[11px] text-gray-400 border border-gray-100">
          {activeTab === "todo" ? "Không có văn bản nào cần ký" : "Chưa có văn bản"}
        </div>
      )}
      {filtered.length > 0 && (
      <div className="bg-white rounded-xl shadow-xs border border-gray-100 divide-y divide-gray-50 overflow-hidden">
        {displayList.map((d) => {
          const sc = statusOf(d);
          const StatusIcon = sc.icon;
          return (
            <div key={d.id} className="p-3 hover:bg-gray-50/80 transition-colors">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <FileText className="w-3.5 h-3.5 text-[#948154] shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[11.5px] font-bold text-gray-900 truncate">{d.title}</p>
                    <p className="text-[9.5px] text-gray-400 truncate">{d.doc_no || d.document_type}</p>
                  </div>
                </div>
                <span className={`inline-flex items-center gap-0.5 text-[8.5px] font-bold px-1.5 py-0.2 rounded-full border shrink-0 ${sc.className}`}>
                  <StatusIcon className="w-2.5 h-2.5" />
                  {sc.label}
                </span>
              </div>

              <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-gray-50">
                <span className="text-[9.5px] text-gray-400">{formatCompactDate(d.created_date)}</span>
                <Link
                  to={`/document/${d.id}`}
                  className="inline-flex items-center gap-1 text-[10px] font-bold text-[#948154] hover:text-[#7d6d45] transition-colors"
                >
                  {needsSigning(d) ? "Xem và ký ngay" : "Xem chi tiết"} <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          );
        })}
      </div>
      )}

      {filtered.length > 4 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="w-full py-1.5 text-center text-[10px] font-bold text-[#948154] hover:text-[#7d6d45] transition-colors"
        >
          {showAll ? "Thu gọn danh sách ▲" : `Xem thêm ${filtered.length - 4} tài liệu khác ▼`}
        </button>
      )}
    </div>
  );
}
