import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { useAuth } from "@/lib/AuthContext";
import PageHeader from "@/components/shared/PageHeader";
import CustomDocumentView from "@/components/documents/CustomDocumentView";
import SignaturePicker from "@/components/signature/SignaturePicker";
import BottomNav from "@/components/BottomNav";

export default function Document() {
  const { id } = useParams();
  const { user } = useAuth();
  const [doc, setDoc] = useState(null);
  const [signature, setSignature] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    base44.entities.CustomDocument.get(id)
      .then((d) => {
        setDoc(d);
        if (d.signature_content) {
          setSignature({ type: d.signature_type, content: d.signature_content });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const signed = doc?.status !== "pending";

  const handleSign = async () => {
    if (!signature?.content) {
      toast.error("Vui lòng ký tài liệu");
      return;
    }
    setSaving(true);
    try {
      const updated = await base44.entities.CustomDocument.update(id, {
        signature_type: signature.type,
        signature_content: signature.content,
      });
      // Trigger phía Postgres (protect_custom_document_fields) tự suy ra
      // status="signed" khi có chữ ký - dùng thẳng bản ghi server trả về
      // thay vì tự đoán lại status ở client, tránh lệch nếu logic trigger
      // đổi khác đi sau này.
      setDoc((prev) => ({ ...prev, ...updated, status: updated?.status || "signed" }));
      toast.success("Đã ký tài liệu thành công");
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

  if (!doc)
    return (
      <main className="relative w-full min-h-screen bg-[#f5f5f5] font-heading flex flex-col items-center justify-center gap-2">
        <p className="text-[12px] text-gray-500">Không tìm thấy tài liệu</p>
        <Link to="/profile" className="text-[11px] text-[#948154]">
          Quay lại
        </Link>
      </main>
    );

  const status = doc.status || "pending";
  const cfg = {
    approved: { icon: CheckCircle2, bg: "bg-green-50", text: "text-green-700", label: "Tài liệu đã ký và Admin đã DUYỆT" },
    rejected: { icon: XCircle, bg: "bg-rose-50", text: "text-rose-700", label: "Tài liệu bị Admin TỪ CHỐI" },
    signed: { icon: Clock, bg: "bg-amber-50", text: "text-amber-700", label: "Đã ký - đang chờ Admin duyệt" },
    pending: { icon: Clock, bg: "bg-blue-50", text: "text-blue-700", label: "Vui lòng đọc kỹ và ký tài liệu bên dưới" },
  }[status] || { icon: Clock, bg: "bg-blue-50", text: "text-blue-700", label: "Vui lòng đọc kỹ và ký tài liệu bên dưới" };
  const StatusIcon = cfg.icon;

  return (
    <main className="relative w-full min-h-screen bg-[#f5f5f5] overflow-x-hidden font-heading">
      <PageHeader title={doc.document_type || "Tài liệu"} headerClassName="bg-white border-b border-gray-100" />

      <div className="max-w-4xl mx-auto px-4 py-4 pb-24 space-y-4">
        <div className={`flex items-center gap-2 ${cfg.bg} rounded-xl p-2.5`}>
          <StatusIcon className={`w-4 h-4 ${cfg.text} shrink-0`} />
          <span className={`text-[11px] font-medium ${cfg.text}`}>{cfg.label}</span>
        </div>

        <CustomDocumentView doc={doc} user={user} signature={signature} />

        {!signed && (
          <div className="bg-white rounded-2xl p-3 shadow-sm space-y-2">
            <p className="text-[11px] font-medium text-gray-700">Ký tài liệu (Bên B)</p>
            <SignaturePicker value={signature} onChange={setSignature} />
            <button
              onClick={handleSign}
              disabled={saving}
              className="w-full py-2.5 rounded-lg bg-[#948154] hover:bg-[#837046] disabled:opacity-50 text-white text-[12px] font-semibold"
            >
              {saving ? "Đang lưu..." : "Ký và lưu tài liệu"}
            </button>
          </div>
        )}
      </div>
      <BottomNav />
    </main>
  );
}
