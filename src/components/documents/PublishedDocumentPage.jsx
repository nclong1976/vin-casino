import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Download, FileCheck2, Loader2, PenLine, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import CustomDocumentView from "@/components/documents/CustomDocumentView";
import SignatureSheet, { CONSENT_TEXT } from "@/components/signature/SignatureSheet";
import { getDocumentPdfUrl, markDocumentViewed, signDocument, watchDocument } from "@/lib/esignApi";
import { newIdempotencyKey } from "@/lib/signatureImage";

const fmt = (iso) =>
  iso ? new Date(iso).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" }) : "";

const ERROR_TEXT = {
  ALREADY_SIGNED: "Văn bản đã được ký trước đó",
  REVOKED: "Văn bản đã bị thu hồi",
  EXPIRED: "Văn bản đã quá hạn ký",
  DOCUMENT_CHANGED: "Nội dung văn bản đã thay đổi, vui lòng xem lại",
  NOT_FOUND: "Không tìm thấy văn bản",
};
// Lỗi này nghĩa là trạng thái trên máy đã cũ - tải lại văn bản, đóng bảng ký.
const STALE_CODES = ["ALREADY_SIGNED", "REVOKED", "EXPIRED", "DOCUMENT_CHANGED", "NOT_FOUND"];

/**
 * Trang ký văn bản Giai đoạn 2 (spec mục 7): văn bản vẽ bằng bộ dàn trang
 * dùng chung, chạm khung "Chạm để ký" → bảng ký → Edge Function
 * sign-document. Sau khi ký, theo dõi realtime tới khi PDF sẵn sàng.
 */
export default function PublishedDocumentPage({ doc: initialDoc, reload }) {
  const [doc, setDoc] = useState(initialDoc);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null); // chữ ký lạc quan đang gửi
  const [ackConsent, setAckConsent] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const idemKey = useRef(null);

  useEffect(() => setDoc(initialDoc), [initialDoc]);

  useEffect(() => {
    markDocumentViewed(initialDoc.id).catch(() => {});
    return watchDocument(initialDoc.id, (row) => setDoc((d) => ({ ...d, ...row })));
  }, [initialDoc.id]);

  const overdue = doc.status === "pending" && doc.due_at && new Date(doc.due_at) < new Date();
  const canSign = doc.status === "pending" && !doc.locked_at && !overdue;
  const signed = !!doc.signed_at;

  const openSheet = () => {
    if (!canSign) return;
    idemKey.current ||= newIdempotencyKey();
    setSheetOpen(true);
  };

  const submit = async (payload) => {
    setBusy(true);
    idemKey.current ||= newIdempotencyKey();
    if (payload.dataUrl) setPending({ type: "draw", content: payload.dataUrl });
    try {
      const result = await signDocument({
        document_id: doc.id,
        idempotency_key: idemKey.current,
        method: payload.method,
        image_png_base64: payload.dataUrl || null,
        typed_text: payload.typedText || null,
        font: payload.font || null,
        saved_signature_id: payload.savedSignatureId || null,
        save_for_later: !!payload.saveForLater,
        consent: true,
        content_sha256: doc.content_sha256,
      });
      setDoc((d) => ({
        ...d,
        ...result,
        signature_type: payload.method === "acknowledge" ? "acknowledge" : "draw",
        signature_content: payload.dataUrl || null,
        locked_at: result.signed_at,
      }));
      idemKey.current = null;
      setSheetOpen(false);
      toast.success(payload.method === "acknowledge" ? "Đã xác nhận văn bản" : "Đã ký văn bản thành công");
    } catch (e) {
      const message = ERROR_TEXT[e.code] || e.message || "Không ký được, vui lòng thử lại";
      if (STALE_CODES.includes(e.code)) {
        idemKey.current = null;
        setSheetOpen(false);
        toast.error(message);
        reload?.();
        return;
      }
      throw new Error(message);
    } finally {
      setPending(null);
      setBusy(false);
    }
  };

  const acknowledge = async () => {
    try {
      await submit({ method: "acknowledge" });
    } catch (e) {
      toast.error(e.message);
    }
  };

  const download = async () => {
    setDownloading(true);
    try {
      const { url } = await getDocumentPdfUrl(doc.id);
      window.location.assign(url);
    } catch (e) {
      toast.error(e.code === "PURGED" ? "Bản PDF đã hết thời gian lưu trữ" : e.code === "NOT_READY" ? "Bản PDF đang được tạo, vui lòng đợi" : "Không tải được PDF");
    } finally {
      setDownloading(false);
    }
  };

  const banner = statusBanner(doc, overdue);

  return (
    <div className="space-y-3">
      <div className={`flex items-start gap-2 ${banner.bg} rounded-xl p-2.5`}>
        <banner.icon className={`w-4 h-4 ${banner.text} shrink-0 mt-px`} />
        <div className={`text-[11px] ${banner.text}`}>
          <p className="font-medium">{banner.label}</p>
          {banner.sub && <p className="opacity-80 mt-0.5">{banner.sub}</p>}
        </div>
      </div>

      <CustomDocumentView doc={doc} signature={pending} onSlotClick={canSign && doc.requires_signature !== false ? openSheet : undefined} />

      {canSign && doc.requires_signature !== false && (
        <div className="sticky bottom-20 z-10">
          <button
            type="button"
            onClick={openSheet}
            className="w-full h-11 rounded-xl bg-[#948154] hover:bg-[#837046] text-white text-[13px] font-semibold shadow-lg flex items-center justify-center gap-2"
          >
            <PenLine className="w-4 h-4" /> Ký văn bản
          </button>
        </div>
      )}

      {canSign && doc.requires_signature === false && (
        <div className="bg-white rounded-2xl p-3 shadow-sm space-y-2">
          <label className="flex items-start gap-2 text-[11.5px] text-gray-700">
            <Checkbox checked={ackConsent} onCheckedChange={(v) => setAckConsent(v === true)} className="mt-0.5 border-gray-400 data-[state=checked]:bg-[#948154] data-[state=checked]:border-[#948154] data-[state=checked]:text-white" />
            <span>{CONSENT_TEXT}</span>
          </label>
          <button
            type="button"
            onClick={acknowledge}
            disabled={!ackConsent || busy}
            className="w-full h-11 rounded-lg bg-[#948154] hover:bg-[#837046] disabled:opacity-50 text-white text-[13px] font-semibold flex items-center justify-center gap-2"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCheck2 className="w-4 h-4" />}
            Tôi đã đọc và xác nhận
          </button>
        </div>
      )}

      {signed && (
        <div className="bg-white rounded-2xl p-3 shadow-sm space-y-2">
          <PdfStatus doc={doc} />
          {doc.pdf_status === "ready" && (
            <button
              type="button"
              onClick={download}
              disabled={downloading}
              className="w-full h-10 rounded-lg border border-[#948154] text-[#948154] text-[12px] font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Tải bản PDF đã ký
            </button>
          )}
        </div>
      )}

      <SignatureSheet open={sheetOpen} onOpenChange={setSheetOpen} busy={busy} onConfirm={submit} />
    </div>
  );
}

function PdfStatus({ doc }) {
  const s = doc.pdf_status;
  if (s === "ready")
    return (
      <p className="flex items-center gap-1.5 text-[11px] text-green-700">
        <ShieldCheck className="w-4 h-4" /> Bản PDF đã sẵn sàng
        {doc.pdf_expires_at ? ` · lưu trữ đến ${fmt(doc.pdf_expires_at).split(" ").pop()}` : " · lưu trữ vĩnh viễn"}
      </p>
    );
  if (s === "failed") return <p className="text-[11px] text-rose-600">Tạo bản PDF lỗi - quản trị viên sẽ xử lý, bạn không cần ký lại.</p>;
  if (s === "purged") return <p className="text-[11px] text-gray-500">Bản PDF đã hết thời gian lưu trữ.</p>;
  return (
    <p className="flex items-center gap-1.5 text-[11px] text-gray-500">
      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang tạo bản PDF đã ký...
    </p>
  );
}

function statusBanner(doc, overdue) {
  const signedSub = doc.signed_at ? `${doc.signer_name || ""} ký lúc ${fmt(doc.signed_at)}`.trim() : undefined;
  if (doc.status === "revoked") return { icon: XCircle, bg: "bg-gray-100", text: "text-gray-600", label: "Văn bản đã bị thu hồi" };
  if (doc.status === "expired" || overdue) return { icon: AlertTriangle, bg: "bg-rose-50", text: "text-rose-700", label: "Văn bản đã quá hạn ký" };
  if (doc.status === "approved") return { icon: CheckCircle2, bg: "bg-green-50", text: "text-green-700", label: "Đã ký và được duyệt", sub: signedSub };
  if (doc.status === "rejected") return { icon: XCircle, bg: "bg-rose-50", text: "text-rose-700", label: "Văn bản bị từ chối", sub: signedSub };
  if (doc.signed_at)
    return { icon: CheckCircle2, bg: "bg-green-50", text: "text-green-700", label: doc.signature_type === "acknowledge" ? "Bạn đã xác nhận văn bản" : "Bạn đã ký văn bản", sub: signedSub };
  return {
    icon: Clock,
    bg: "bg-blue-50",
    text: "text-blue-700",
    label: doc.requires_signature === false ? "Vui lòng đọc và xác nhận văn bản" : "Vui lòng đọc kỹ và chạm vào khung ký để ký",
    sub: doc.due_at ? `Hạn ký: ${fmt(doc.due_at)}` : undefined,
  };
}
