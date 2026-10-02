import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

/**
 * Giao diện hợp đồng đầu tư dự án lấy từ Khung văn bản mặc định (tab Văn bản
 * của Admin) qua RPC get_contract_letterhead. Khi chưa có khung / lỗi mạng thì
 * dùng FALLBACK - đúng các giá trị hợp đồng vẫn hiển thị trước đây.
 */
export const FALLBACK_CONTRACT_LETTERHEAD = {
  header: { org_name: "VinClub", org_sub: "", logo_url: null, logo_size_mm: null, place: "Hà Nội", show_national_motto: true },
  issuer: {
    name: "Nguyễn Việt Quang",
    title: "Giám đốc điều hành",
    seal_url: "https://media.base44.com/images/public/6a37d9fdaf7a9d14d5fd8c01/0b8fe1b71_image-Photoroom8.png",
    signature_url: null,
  },
  footer: { lines: [] },
  theme: { primary: "#948154" },
};

let cache = null; // Promise<letterhead | null>

function load() {
  if (!cache) {
    cache = supabase
      .rpc("get_contract_letterhead")
      .then(({ data, error }) => (error || !data ? null : data))
      .catch(() => null);
    // Lỗi tạm thời: cho phép thử lại ở lần mở sau.
    cache.then((lh) => {
      if (!lh) cache = null;
    });
  }
  return cache;
}

/** Ghép khung đọc được với giá trị dự phòng (trường trống → giá trị cũ). */
export function mergeContractLetterhead(lh) {
  const f = FALLBACK_CONTRACT_LETTERHEAD;
  if (!lh) return { ...f, loaded: false };
  const pick = (v, d) => (v === null || v === undefined || v === "" ? d : v);
  return {
    loaded: true,
    header: {
      ...f.header,
      ...(lh.header || {}),
      org_name: pick(lh.header?.org_name, f.header.org_name),
      place: pick(lh.header?.place, f.header.place),
    },
    issuer: {
      name: pick(lh.issuer?.name, f.issuer.name),
      title: pick(lh.issuer?.title, f.issuer.title),
      // Khung đã có ảnh riêng thì dùng ảnh đó; không có con dấu thì giữ con dấu cũ.
      seal_url: pick(lh.issuer?.seal_url, f.issuer.seal_url),
      signature_url: lh.issuer?.signature_url || null,
    },
    footer: { lines: (lh.footer?.lines || []).filter((l) => String(l || "").trim()) },
    theme: { ...f.theme, ...(lh.theme || {}) },
  };
}

/** { letterhead, ready } - ready=false khi đang tải lần đầu. */
export function useContractLetterhead() {
  const [state, setState] = useState({ letterhead: null, ready: false });
  useEffect(() => {
    let alive = true;
    load().then((lh) => alive && setState({ letterhead: lh, ready: true }));
    return () => {
      alive = false;
    };
  }, []);
  return { letterhead: mergeContractLetterhead(state.letterhead), ready: state.ready };
}
