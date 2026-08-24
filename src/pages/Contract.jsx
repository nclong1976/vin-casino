import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { useAuth } from "@/lib/AuthContext";
import ContractDocument from "@/components/projects/ContractDocument";
import SignaturePicker from "@/components/signature/SignaturePicker";
import BottomNav from "@/components/BottomNav";

export default function Contract() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tx, setTx] = useState(null);
  const [signature, setSignature] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    base44.entities.Transaction.get(id)
      .then((t) => {
        setTx(t);
        if (t.signature_content) {
          setSignature({ type: t.signature_type, content: t.signature_content });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const signed = !!tx?.signature_content;

  const handleSign = async () => {
    if (!signature?.content) {
      toast.error("Vui lòng ký hợp đồng");
      return;
    }
    setSaving(true);
    try {
      await base44.entities.Transaction.update(id, {
        signature_type: signature.type,
        signature_content: signature.content,
      });
      setTx({
        ...tx,
        signature_type: signature.type,
        signature_content: signature.content,
      });
      toast.success("Đã ký hợp đồng thành công");
    } catch (e) {
      toast.error("Không thể lưu chữ ký");
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return (
      <main className="relative w-full min-h-screen bg-[#f5f5f5] font-heading flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-gray-200 border-t-[#948154] rounded-full animate-spin" />
      </main>
    );

  if (!tx)
    return (
      <main className="relative w-full min-h-screen bg-[#f5f5f5] font-heading flex flex-col items-center justify-center gap-2">
        <p className="text-[12px] text-gray-500">Không tìm thấy hợp đồng</p>
        <Link to="/profile" className="text-[11px] text-[#948154]">
          Quay lại
        </Link>
      </main>
    );

  return (
    <main className="relative w-full min-h-screen bg-[#f5f5f5] overflow-x-hidden font-heading">
      <header className="sticky top-0 z-40 w-full bg-white border-b border-gray-100">
        <div className="max-w-4xl mx-auto flex items-center justify-center px-4 py-3">
          <h1 className="text-[14px] sm:text-base font-bold text-black text-center">Hợp đồng đầu tư</h1>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-4 pb-24 space-y-4">
        {signed && (() => {
          // Trạng thái duyệt thật của Admin (ContractsTab.jsx) - trước đây
          // trang này chỉ báo "đã ký" mà không nói gì tới việc Admin đã
          // duyệt hay từ chối, dù đây chính là trang "Xem chi tiết hợp đồng"
          // người dùng bấm vào từ danh sách để xem tình trạng.
          const status = tx.contract_status || "pending";
          const cfg = {
            approved: { icon: CheckCircle2, bg: "bg-green-50", text: "text-green-700", label: "Hợp đồng đã được ký và Admin đã DUYỆT" },
            rejected: { icon: XCircle, bg: "bg-rose-50", text: "text-rose-700", label: "Hợp đồng bị Admin TỪ CHỐI" },
            pending: { icon: Clock, bg: "bg-amber-50", text: "text-amber-700", label: "Hợp đồng đã được ký - đang chờ Admin duyệt" },
          }[status] || { icon: Clock, bg: "bg-amber-50", text: "text-amber-700", label: "Hợp đồng đã được ký - đang chờ Admin duyệt" };
          const StatusIcon = cfg.icon;
          return (
            <div className={`flex items-center gap-2 ${cfg.bg} rounded-xl p-2.5`}>
              <StatusIcon className={`w-4 h-4 ${cfg.text} shrink-0`} />
              <span className={`text-[11px] font-medium ${cfg.text}`}>{cfg.label}</span>
            </div>
          );
        })()}

        <ContractDocument
          project={{ title: tx.project_title }}
          amount={tx.amount}
          method={tx.method}
          rate={tx.rate || 0}
          days={tx.duration_days || 0}
          profit={tx.profit || 0}
          total={tx.total || 0}
          user={user}
          signature={signature}
        />

        {!signed && (
          <div className="bg-white rounded-2xl p-3 shadow-sm space-y-2">
            <p className="text-[11px] font-medium text-gray-700">Ký hợp đồng (Bên B)</p>
            <SignaturePicker value={signature} onChange={setSignature} />
            <button
              onClick={handleSign}
              disabled={saving}
              className="w-full py-2.5 rounded-lg bg-[#948154] hover:bg-[#837046] disabled:opacity-50 text-white text-[12px] font-semibold"
            >
              {saving ? "Đang lưu..." : "Ký và lưu hợp đồng"}
            </button>
          </div>
        )}
      </div>
      <BottomNav />
    </main>
  );
}