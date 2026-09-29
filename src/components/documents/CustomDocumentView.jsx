import React, { useMemo } from "react";
import { COMPANY_SEAL_URL } from "@/lib/brandAssets";
import { buildLayoutInput, isPublishedDocument, layoutDocument } from "@/shared/docLayout";
import LetterheadRenderer from "@/components/documents/LetterheadRenderer";

/**
 * Hiển thị 1 tài liệu/hợp đồng TÙY Ý do Admin tự soạn (bảng custom_documents)
 * - khác ContractDocument.jsx (mẫu hợp đồng đầu tư CỐ ĐỊNH, tự sinh từ dữ
 * liệu 1 giao dịch) ở chỗ tiêu đề/nội dung hoàn toàn do Admin gõ tự do, nên
 * không có "Điều 1, 2, 3..." cứng - chỉ giữ đúng khung sườn Quốc hiệu/2 bên
 * ký tên cho đúng tinh thần văn bản, còn phần nội dung hiển thị nguyên văn
 * (whitespace-pre-wrap) những gì Admin đã gõ.
 */
export default function CustomDocumentView({ doc, user, signature, adminName, onSlotClick }) {
  if (!doc) return null;
  // Văn bản Giai đoạn 2 (phát hành từ mẫu trên Khung văn bản, đã có snapshot
  // dàn trang) vẽ bằng bộ dàn trang dùng chung - khớp bản PDF. Văn bản Giai
  // đoạn 1 (chỉ có content plain-text) giữ nguyên khung hiển thị cũ bên dưới.
  if (isPublishedDocument(doc)) {
    return <PublishedDocumentView doc={doc} signature={signature} onSlotClick={onSlotClick} />;
  }

  // signature (đang chọn, CHƯA lưu) ưu tiên hơn chữ ký đã lưu trong doc - để
  // xem trước ngay khi khách đang chọn kiểu ký, trước khi bấm "Ký tài liệu".
  const activeSignature = signature || (doc.signature_content ? { type: doc.signature_type, content: doc.signature_content } : null);

  const docDate = doc.signed_at || doc.created_date ? new Date(doc.signed_at || doc.created_date) : new Date();
  const today = docDate.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  const [dd, mm, yyyy] = today.split("/");

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      {/* Header */}
      <div className="text-center border-b border-dashed border-gray-300 pb-2 mb-3">
        <p className="text-[9px] font-semibold tracking-widest text-[#948154]">
          CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
        </p>
        <p className="text-[8px] text-gray-400">Độc lập - Tự do - Hạnh phúc</p>
        <div className="w-6 border-t border-gray-300 mx-auto my-1" />
        {doc.document_type && (
          <p className="text-[8.5px] font-bold text-[#948154] uppercase tracking-wide mt-1">{doc.document_type}</p>
        )}
        <h2 className="text-[14px] font-bold text-black mt-0.5 tracking-wide uppercase">{doc.title || "Văn bản"}</h2>
        <p className="text-[9px] text-gray-400">
          Số: VC/{docDate.getTime().toString().slice(-6)}/{(doc.document_type || "VB").slice(0, 6).toUpperCase().replace(/\s/g, "")}
        </p>
      </div>

      {/* Parties */}
      <div className="space-y-1.5 text-[10px] text-gray-700 mb-3">
        <p>
          <b>Bên A (Bên soạn thảo):</b> VinClub — đại diện bởi {adminName || "Ban điều hành"}.
        </p>
        <p>
          <b>Bên B (Bên nhận):</b> {user?.full_name || user?.name || "…"}
          {user?.email ? ` — ${user.email}` : ""}
        </p>
      </div>

      {/* Nội dung tự do do Admin soạn - giữ nguyên xuống dòng, không ép theo
          khuôn "Điều X" cố định như ContractDocument.jsx. */}
      <div className="text-[10px] text-gray-700 leading-relaxed whitespace-pre-wrap mb-3 min-h-[60px]">
        {doc.content || <span className="text-gray-300 italic">Chưa có nội dung</span>}
      </div>

      {/* Date */}
      <p className="text-[10px] text-gray-600 text-right mb-3">
        Hà Nội, ngày {dd} tháng {mm} năm {yyyy}
      </p>

      {/* Signatures */}
      <div className="grid grid-cols-2 gap-2 pt-3 mt-1 border-t border-gray-100">
        {/* BÊN A */}
        <div className="flex flex-col items-center justify-between text-center min-h-[130px]">
          <div>
            <p className="text-[10px] font-bold text-black uppercase tracking-wide">BÊN A</p>
            <p className="text-[8px] text-gray-400 h-4 flex items-center justify-center">(Ký, đóng dấu, ghi rõ họ tên)</p>
          </div>
          <div className="h-16 flex items-center justify-center my-1">
            <img
              src={COMPANY_SEAL_URL}
              alt="Con dấu Vinpearl"
              className="h-14 w-auto object-contain"
            />
          </div>
          <div>
            <p className="text-[10px] font-bold text-gray-800 leading-tight">{adminName || "Đại diện VinClub"}</p>
            <p className="text-[8.5px] text-gray-400 mt-0.5">Đại diện VinClub</p>
          </div>
        </div>

        {/* BÊN B */}
        <div className="flex flex-col items-center justify-between text-center min-h-[130px]">
          <div>
            <p className="text-[10px] font-bold text-black uppercase tracking-wide">BÊN B</p>
            <p className="text-[8px] text-gray-400 h-4 flex items-center justify-center">(Ký, ghi rõ họ tên)</p>
          </div>
          <div className="h-16 flex items-center justify-center my-1">
            {activeSignature?.content ? (
              activeSignature.type === "draw" ? (
                <img src={activeSignature.content} alt="Chữ ký" className="h-10 max-w-full object-contain" />
              ) : (
                <span style={{ fontFamily: "'Great Vibes', cursive" }} className="text-[18px] text-[#16100b] leading-none">
                  {activeSignature.content}
                </span>
              )
            ) : (
              <span className="text-[8.5px] text-gray-300 italic">Chưa ký</span>
            )}
          </div>
          <div>
            <p className="text-[10px] font-bold text-gray-800 leading-tight">{user?.full_name || user?.name || "…"}</p>
            <p className="text-[8.5px] text-gray-400 mt-0.5">Bên nhận</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function PublishedDocumentView({ doc, signature, onSlotClick }) {
  const layout = useMemo(() => {
    const verifyBaseUrl = typeof window !== "undefined" ? `${window.location.origin}${import.meta.env.BASE_URL}verify/` : undefined;
    return layoutDocument(buildLayoutInput(doc, { verifyBaseUrl }));
  }, [doc]);

  // Chữ ký đang chọn (chưa lưu) ưu tiên hơn chữ ký đã lưu - xem trước ngay
  // trong khung trước khi bấm ký. Chỉ ảnh (PNG/data URL) mới đặt vào khung.
  const active = signature || (doc.signature_content ? { type: doc.signature_type, content: doc.signature_content } : null);
  const signatureImages = active?.content && active.type !== "typed" ? { recipient: { src: active.content } } : {};
  const canSign = doc.status === "pending" && !doc.locked_at && !!onSlotClick;

  return (
    <LetterheadRenderer
      layout={layout}
      signatureImages={signatureImages}
      interactiveSlots={canSign && !signatureImages.recipient ? ["recipient"] : []}
      onSlotClick={onSlotClick}
    />
  );
}
