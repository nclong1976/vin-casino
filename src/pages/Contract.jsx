import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Home, CheckCircle2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import ContractDocument from "@/components/projects/ContractDocument";
import SignaturePicker from "@/components/signature/SignaturePicker";
import BottomNav from "@/components/BottomNav";

export default function Contract() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tx, setTx] = useState(null);
  const [user, setUser] = useState(null);
  const [signature, setSignature] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
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
      <main className="relative w-full max-w-[480px] mx-auto min-h-screen bg-[#f5f5f5] font-heading flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-gray-200 border-t-[#948154] rounded-full animate-spin" />
      </main>
    );

  if (!tx)
    return (
      <main className="relative w-full max-w-[480px] mx-auto min-h-screen bg-[#f5f5f5] font-heading flex flex-col items-center justify-center gap-2">
        <p className="text-[12px] text-gray-500">Không tìm thấy hợp đồng</p>
        <Link to="/profile" className="text-[11px] text-[#948154]">
          Quay lại
        </Link>
      </main>
    );

  return (
    <main className="relative w-full max-w-[480px] mx-auto min-h-screen bg-[#f5f5f5] overflow-clip font-heading">
      <header className="sticky top-0 z-40 flex items-center justify-between px-4 py-3 bg-white border-b border-gray-100">
        <button
          onClick={() => navigate(-1)}
          className="w-8 h-8 flex items-center justify-center rounded-full text-gray-600 hover:bg-gray-100"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="text-[14px] font-bold text-black">Hợp đồng đầu tư</h1>
        <Link
          to="/"
          className="w-8 h-8 flex items-center justify-center rounded-full text-gray-600 hover:bg-gray-100"
        >
          <Home className="w-4 h-4" />
        </Link>
      </header>

      <div className="px-3 py-4 pb-20 space-y-3">
        {signed && (
          <div className="flex items-center gap-2 bg-green-50 rounded-xl p-2.5">
            <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
            <span className="text-[11px] font-medium text-green-700">
              Hợp đồng đã được ký
            </span>
          </div>
        )}

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