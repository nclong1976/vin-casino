import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowDown, CheckCircle2, Clock, Download, FileCheck2, Info, Loader2, PenLine, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { normalizeFields } from "@/shared/docLayout";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import CustomDocumentView from "@/components/documents/CustomDocumentView";
import SignatureSheet, { CONSENT_TEXT } from "@/components/signature/SignatureSheet";
import { getDocumentPdfUrl, markDocumentRead, markDocumentViewed, signDocument, watchDocument } from "@/lib/esignApi";
import { newIdempotencyKey } from "@/lib/signatureImage";
import { SLOT_TARGET as SLOT, buildSignRequest, missingTargets, requiredCount } from "@/lib/signingFlow";

const fmt = (iso) =>
  iso ? new Date(iso).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" }) : "";

const ERROR_TEXT = {
  ALREADY_SIGNED: "Văn bản đã được ký trước đó",
  REVOKED: "Văn bản đã bị thu hồi",
  EXPIRED: "Văn bản đã quá hạn ký",
  DOCUMENT_CHANGED: "Nội dung văn bản đã thay đổi, vui lòng xem lại",
  NOT_FOUND: "Không tìm thấy văn bản",
  READ_REQUIRED: "Vui lòng đọc hết văn bản trước khi ký",
  FIELD_REQUIRED: "Còn mục bắt buộc chưa điền",
  INVALID_FIELD_VALUE: "Có mục điền chưa hợp lệ",
  RATE_LIMITED: "Bạn thao tác quá nhanh, vui lòng thử lại sau 1 phút",
};
// Spec 6.3: báo trước dữ liệu được ghi nhận khi ký (Nghị định 13/2023/NĐ-CP).
const PRIVACY_NOTICE =
  "Khi xác nhận, hệ thống ghi lại thời điểm, địa chỉ IP, thông tin thiết bị và hình chữ ký/các mục bạn điền để lưu vào nhật ký văn bản này. Dữ liệu chỉ dùng để quản lý văn bản và chỉ bạn cùng quản trị viên xem được.";
// Lỗi này nghĩa là trạng thái trên máy đã cũ - tải lại văn bản.
const STALE_CODES = ["ALREADY_SIGNED", "REVOKED", "EXPIRED", "DOCUMENT_CHANGED", "NOT_FOUND"];

const FIELD_TITLES = { signature: "Chữ ký", initials: "Ký nháy", text: "Nhập thông tin" };

/**
 * Trang ký văn bản (spec hợp đồng mục 3): đọc hết văn bản → điền lần lượt
 * khung ký và các trường (ký nháy, ô xác nhận, ô nhập; ngày ký do server
 * điền) → tick đồng ý → gửi 1 lần tới Edge Function sign-document. Sau khi
 * ký, theo dõi realtime tới khi PDF sẵn sàng.
 */
export default function PublishedDocumentPage({ doc: initialDoc, reload }) {
  const [doc, setDoc] = useState(initialDoc);
  const [busy, setBusy] = useState(false);
  const [main, setMain] = useState(null); // chữ ký ở khung ký người nhận
  const [draft, setDraft] = useState({}); // fieldId → giá trị đang điền
  const [sheet, setSheet] = useState(null); // { target, title }
  const [textEdit, setTextEdit] = useState(null); // { field, value }
  const [consent, setConsent] = useState(false);
  const [readDone, setReadDone] = useState(!!initialDoc.read_completed_at);
  const [downloading, setDownloading] = useState(false);
  const idemKey = useRef(null);
  const sentinelRef = useRef(null);
  const openedAt = useRef(Date.now());

  useEffect(() => setDoc(initialDoc), [initialDoc]);

  useEffect(() => {
    markDocumentViewed(initialDoc.id).catch(() => {});
    return watchDocument(initialDoc.id, (row) => setDoc((d) => ({ ...d, ...row })));
  }, [initialDoc.id]);

  const overdue = doc.status === "pending" && doc.due_at && new Date(doc.due_at) < new Date();
  const canSign = doc.status === "pending" && !doc.locked_at && !overdue;
  const signed = !!doc.signed_at;
  const needSlot = doc.requires_signature !== false;
  const illustrative = doc.layout_snapshot?.illustrative_label !== false;
  const fields = useMemo(() => normalizeFields(doc.layout_snapshot?.fields), [doc.layout_snapshot]);

  // Đọc hết: mốc cuối văn bản hiện trên màn hình → ghi read_completed_at.
  useEffect(() => {
    if (!canSign || readDone || !sentinelRef.current) return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        setReadDone(true);
        markDocumentRead(doc.id, null, Date.now() - openedAt.current).catch(() => {});
      },
      { threshold: 0.1 },
    );
    io.observe(sentinelRef.current);
    return () => io.disconnect();
  }, [canSign, readDone, doc.id]);

  // Các mục bắt buộc còn trống, theo thứ tự cần điền.
  const missing = useMemo(() => missingTargets(fields, draft, { needSlot, mainSignature: main }), [fields, draft, needSlot, main]);

  const fieldById = useMemo(() => new Map(fields.map((f) => [f.id, f])), [fields]);
  const pendingFields = missing.filter((id) => id !== SLOT);

  const openTarget = (id) => {
    if (!canSign) return;
    idemKey.current ||= newIdempotencyKey();
    if (id === SLOT) {
      setSheet({ target: SLOT, title: "Ký văn bản" });
      return;
    }
    const field = fieldById.get(id);
    if (!field) return;
    if (field.type === "checkbox") {
      setDraft((d) => ({ ...d, [id]: { type: "checkbox", value_bool: !(d[id]?.value_bool === true) } }));
    } else if (field.type === "text") {
      setTextEdit({ field, value: draft[id]?.value_text || "" });
    } else if (field.type === "date") {
      toast.info("Ngày ký được điền tự động khi bạn ký");
    } else {
      setSheet({ target: id, title: FIELD_TITLES[field.type] });
    }
  };

  const scrollTo = (id) => {
    const el = document.getElementById(id === SLOT ? "esign-slot-recipient" : `esign-field-${id}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const next = () => {
    if (!readDone) {
      window.scrollBy({ top: window.innerHeight * 0.8, behavior: "smooth" });
      return;
    }
    const id = missing[0];
    if (!id) return;
    scrollTo(id);
    setTimeout(() => openTarget(id), 350);
  };

  const onCaptured = async (payload) => {
    if (sheet?.target === SLOT) {
      setMain(payload);
    } else if (sheet) {
      const field = fieldById.get(sheet.target);
      setDraft((d) => ({ ...d, [sheet.target]: { type: field?.type, dataUrl: payload.dataUrl, width: payload.width, height: payload.height } }));
    }
    setSheet(null);
  };

  const submit = async () => {
    if (!readDone || missing.length || !consent) return;
    setBusy(true);
    idemKey.current ||= newIdempotencyKey();
    try {
      const result = await signDocument(buildSignRequest({ doc, idempotencyKey: idemKey.current, needSlot, mainSignature: main, draft }));
      setDoc((d) => ({
        ...d,
        ...result,
        signature_type: needSlot ? "draw" : "acknowledge",
        signature_content: main?.dataUrl || null,
        locked_at: result.signed_at,
      }));
      idemKey.current = null;
      toast.success(needSlot ? "Đã ký văn bản thành công" : "Đã xác nhận văn bản");
    } catch (e) {
      const message = ERROR_TEXT[e.code] || e.message || "Không ký được, vui lòng thử lại";
      toast.error(message);
      if (STALE_CODES.includes(e.code)) {
        idemKey.current = null;
        reload?.();
      }
      if (e.code === "READ_REQUIRED") setReadDone(false);
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    setDownloading(true);
    try {
      const { url } = await getDocumentPdfUrl(doc.id);
      window.location.assign(url);
    } catch (e) {
      toast.error(e.code === "PURGED" ? "Bản PDF đã hết thời gian lưu trữ" : e.code === "NOT_READY" ? "Bản PDF đang được tạo, vui lòng đợi" : e.code === "DOWNLOAD_DISABLED" ? "Văn bản này không cho phép tải PDF" : "Không tải được PDF");
    } finally {
      setDownloading(false);
    }
  };

  const banner = statusBanner(doc, overdue);
  const total = requiredCount(fields, needSlot);

  return (
    <div className="space-y-3">
      <div className={`flex items-start gap-2 ${banner.bg} rounded-xl p-2.5`}>
        <banner.icon className={`w-4 h-4 ${banner.text} shrink-0 mt-px`} />
        <div className={`text-[11px] ${banner.text}`}>
          <p className="font-medium">{banner.label}</p>
          {banner.sub && <p className="opacity-80 mt-0.5">{banner.sub}</p>}
        </div>
      </div>

      <CustomDocumentView
        doc={doc}
        signature={main?.dataUrl ? { type: "draw", content: main.dataUrl } : null}
        onSlotClick={canSign && needSlot ? () => openTarget(SLOT) : undefined}
        fieldDraft={draft}
        pendingFields={readDone ? pendingFields : []}
        onFieldClick={canSign ? openTarget : undefined}
      />
      <div ref={sentinelRef} aria-hidden="true" className="h-1" />

      {canSign && (
        <div className="sticky bottom-20 z-10">
          {!readDone ? (
            <button type="button" onClick={next} className="w-full h-11 rounded-xl bg-white border border-[#948154] text-[#7d6c45] text-[12.5px] font-semibold shadow-lg flex items-center justify-center gap-2">
              <ArrowDown className="w-4 h-4" /> Đọc hết văn bản để ký
            </button>
          ) : missing.length ? (
            <button type="button" onClick={next} className="w-full h-11 rounded-xl bg-[#948154] hover:bg-[#837046] text-white text-[13px] font-semibold shadow-lg flex items-center justify-center gap-2">
              <PenLine className="w-4 h-4" /> {needSlot ? "Ký" : "Điền"} mục tiếp theo · {total - missing.length}/{total}
            </button>
          ) : (
            <div className="bg-white rounded-2xl p-3 shadow-lg ring-1 ring-gray-200 space-y-2">
              <label className="flex items-start gap-2 text-[11.5px] text-gray-700">
                <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5 border-gray-400 data-[state=checked]:bg-[#948154] data-[state=checked]:border-[#948154] data-[state=checked]:text-white" />
                <span>{CONSENT_TEXT}</span>
              </label>
              <p className="text-[10px] leading-snug text-gray-500">{PRIVACY_NOTICE}</p>
              {illustrative && (
                <p className="flex items-center gap-1.5 text-[10.5px] text-gray-500">
                  <Info className="w-3.5 h-3.5" /> Chữ ký mang tính minh hoạ
                </p>
              )}
              <button
                type="button"
                onClick={submit}
                disabled={!consent || busy}
                className="w-full h-11 rounded-lg bg-[#948154] hover:bg-[#837046] disabled:opacity-50 text-white text-[13px] font-semibold flex items-center justify-center gap-2"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCheck2 className="w-4 h-4" />}
                {needSlot ? "Ký và hoàn tất" : "Tôi đã đọc và xác nhận"}
              </button>
            </div>
          )}
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

      <SignatureSheet
        open={!!sheet}
        onOpenChange={(v) => !v && setSheet(null)}
        mode="capture"
        title={sheet?.title}
        description={sheet?.target === SLOT ? "Chữ ký sẽ được đặt vào khung ký của bạn." : "Chữ ký sẽ được đặt vào ô bạn vừa chọn."}
        signerName={doc.signer_name || ""}
        onConfirm={onCaptured}
      />

      <Dialog open={!!textEdit} onOpenChange={(v) => !v && setTextEdit(null)}>
        <DialogContent className="z-[70] max-w-sm rounded-2xl font-heading">
          <DialogHeader>
            <DialogTitle className="text-[15px]">{textEdit?.field.label || "Nhập thông tin"}</DialogTitle>
            <DialogDescription className="text-[11px]">Nội dung sẽ được in vào văn bản khi bạn ký.</DialogDescription>
          </DialogHeader>
          <input
            autoFocus
            value={textEdit?.value || ""}
            maxLength={textEdit?.field.options?.max_length || 200}
            placeholder={textEdit?.field.options?.placeholder || ""}
            onChange={(e) => setTextEdit((t) => ({ ...t, value: e.target.value }))}
            className="w-full h-10 px-3 rounded-lg border border-gray-300 outline-none text-[13px] focus:border-[#948154]"
          />
          <DialogFooter>
            <button
              type="button"
              onClick={() => {
                setDraft((d) => ({ ...d, [textEdit.field.id]: { type: "text", value_text: textEdit.value.trim() } }));
                setTextEdit(null);
              }}
              className="w-full h-10 rounded-lg bg-[#948154] text-white text-[12.5px] font-semibold"
            >
              Lưu
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
  if (doc.status === "revoked") return { icon: XCircle, bg: "bg-gray-100", text: "text-gray-600", label: "Văn bản đã bị thu hồi", sub: doc.revoked_reason ? `Lý do: ${doc.revoked_reason}` : undefined };
  if (doc.status === "expired" || overdue) return { icon: AlertTriangle, bg: "bg-rose-50", text: "text-rose-700", label: "Văn bản đã quá hạn ký" };
  if (doc.status === "approved") return { icon: CheckCircle2, bg: "bg-green-50", text: "text-green-700", label: "Đã ký và được duyệt", sub: signedSub };
  if (doc.status === "rejected") return { icon: XCircle, bg: "bg-rose-50", text: "text-rose-700", label: "Văn bản bị từ chối", sub: signedSub };
  if (doc.signed_at)
    return { icon: CheckCircle2, bg: "bg-green-50", text: "text-green-700", label: doc.signature_type === "acknowledge" ? "Bạn đã xác nhận văn bản" : "Bạn đã ký văn bản", sub: signedSub };
  return {
    icon: Clock,
    bg: "bg-blue-50",
    text: "text-blue-700",
    label: doc.requires_signature === false ? "Vui lòng đọc hết và xác nhận văn bản" : "Vui lòng đọc hết văn bản, rồi điền và ký các mục được đánh dấu",
    sub: doc.due_at ? `Hạn ký: ${fmt(doc.due_at)}` : undefined,
  };
}
