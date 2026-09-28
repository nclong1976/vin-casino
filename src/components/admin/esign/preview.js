import { useEffect, useMemo, useState } from "react";
import { buildPublishedDocument, formatDocNo } from "@/shared/docLayout";

/** Người nhận giả lập cho bản xem trước khi Admin chưa chọn user thật. */
export const SAMPLE_RECIPIENT = {
  id: "sample",
  full_name: "Nguyễn Văn Mẫu",
  email: "hoivien@example.com",
  phone: "0900000000",
  identifier: "VC000001",
  id_card_number: "001203004789",
  membership_tier: "VIP 1 - Gold",
  vip_level: "VIP 1",
};

/** Thân văn bản mẫu dùng để xem trước Khung văn bản. */
export const SAMPLE_TEMPLATE = {
  name: "Văn bản mẫu",
  title_template: "Thông báo V/v văn bản mẫu",
  body_delta: {
    ops: [
      { insert: "Kính gửi: " },
      { insert: { variable: "user_name" }, attributes: { bold: true } },
      { insert: "\n" },
      {
        insert:
          "Đây là nội dung minh hoạ để xem trước Khung văn bản. Phần thân văn bản thật do Admin soạn trong từng Mẫu; Header, Quốc hiệu, Footer và khung ký của bên phát hành lấy từ Khung văn bản này.",
      },
      { insert: "\n", attributes: { align: "justify" } },
      { insert: "Trân trọng cảm ơn!" },
      { insert: "\n" },
    ],
  },
  variables: [],
};

export function verifyBaseUrl() {
  return typeof window !== "undefined" ? `${window.location.origin}${import.meta.env.BASE_URL}verify/` : undefined;
}

/** Giá trị mẫu cho biến chưa được nhập - để bản xem trước không bị trống. */
export function sampleValuesFor(variables = []) {
  const out = {};
  for (const v of variables) {
    const label = v.label || v.key;
    switch (v.type) {
      case "date":
        out[v.key] = new Date().toISOString().slice(0, 10);
        break;
      case "money":
        out[v.key] = "1000000";
        break;
      case "number":
        out[v.key] = "1";
        break;
      case "richtext":
        out[v.key] = { ops: [{ insert: `[${label}]\n` }] };
        break;
      default:
        out[v.key] = `[${label}]`;
    }
  }
  return out;
}

/**
 * Dựng bản xem trước bằng đúng hàm mà Edge Function phát hành dùng
 * (buildPublishedDocument). Chạy lại sau `delay` ms kể từ lần đổi đầu vào
 * cuối cùng để không dàn trang lại theo từng phím gõ.
 */
export function usePublishedPreview({ template, letterhead, recipient, campaignValues, recipientValues, dueAt, docSeq = 1 }, delay = 300) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const key = useMemo(
    () => JSON.stringify({ template, letterhead, recipient, campaignValues, recipientValues, dueAt, docSeq }),
    [template, letterhead, recipient, campaignValues, recipientValues, dueAt, docSeq],
  );

  useEffect(() => {
    if (!template || !letterhead) {
      setResult(null);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      const issuedAt = new Date();
      buildPublishedDocument({
        template,
        letterhead,
        recipient: recipient || SAMPLE_RECIPIENT,
        campaignValues,
        recipientValues,
        dueAt,
        issuedAt,
        docNo: formatDocNo(letterhead?.header?.doc_no_pattern, docSeq, issuedAt),
        docId: "preview",
        verifyBaseUrl: verifyBaseUrl(),
      })
        .then((r) => {
          if (!cancelled) {
            setResult(r);
            setError(null);
          }
        })
        .catch((e) => {
          if (!cancelled) setError(e);
        });
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // key gom toàn bộ đầu vào - tránh chạy lại khi object mới nhưng nội dung không đổi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, delay]);

  return { preview: result, error };
}
