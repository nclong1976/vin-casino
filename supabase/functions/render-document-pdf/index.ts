/**
 * Edge Function tạo PDF văn bản đã ký (spec mục 8.4).
 *
 * POST { document_id } với X-Internal-Secret (gọi từ sign-document hoặc
 * pg_cron esign_kick_pdf_jobs). Font lấy từ ESIGN_FONT_BASE_URL (mặc định
 * <APP_PUBLIC_URL>/fonts/noto-serif/ - đúng file web đang dùng), cache trong
 * bộ nhớ của instance.
 */

import { renderDocumentPdf, type DocumentForPdf, type RenderRepo } from "./core.ts";
import type { PdfFontBytes } from "../_shared/docLayout/pdf.ts";
import { APP_PUBLIC_URL, CORS, isInternalRequest, json, serviceClient } from "../_shared/esign/http.ts";

const FONT_BASE_URL = (Deno.env.get("ESIGN_FONT_BASE_URL") ?? (APP_PUBLIC_URL ? `${APP_PUBLIC_URL}/fonts/noto-serif/` : "")).replace(/\/?$/, "/");
const FONT_FILES: Record<keyof PdfFontBytes, string> = {
  regular: "NotoSerif-Regular.ttf",
  bold: "NotoSerif-Bold.ttf",
  italic: "NotoSerif-Italic.ttf",
  boldItalic: "NotoSerif-BoldItalic.ttf",
};

let fontCache: Promise<PdfFontBytes> | null = null;

async function fetchBytes(url: string, timeoutMs = 10_000): Promise<Uint8Array> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`Tải ${url} lỗi ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

function loadFonts(): Promise<PdfFontBytes> {
  if (!FONT_BASE_URL || FONT_BASE_URL === "/") return Promise.reject(new Error("Chưa cấu hình APP_PUBLIC_URL hoặc ESIGN_FONT_BASE_URL"));
  fontCache ??= (async () => {
    const entries = await Promise.all(
      Object.entries(FONT_FILES).map(async ([k, f]) => [k, await fetchBytes(FONT_BASE_URL + f)] as const),
    );
    return Object.fromEntries(entries) as unknown as PdfFontBytes;
  })().catch((e) => {
    fontCache = null;
    throw e;
  });
  return fontCache;
}

function repo(): RenderRepo {
  const db = serviceClient();
  return {
    async claim(id) {
      const { data, error } = await db.rpc("esign_claim_pdf_job", { p_document_id: id });
      if (error) throw new Error(error.message);
      return data === null ? null : Number(data);
    },
    async loadDocument(id) {
      const { data, error } = await db.from("custom_documents").select("*").eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return data as DocumentForPdf | null;
    },
    async loadEvents(id) {
      const { data, error } = await db.from("document_events").select("event, created_at, ip, data").eq("document_id", id).order("created_at");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    async loadSignature(doc) {
      if (!doc.signature_path) return null;
      const { data, error } = await db.storage.from("signed-documents").download(doc.signature_path);
      if (error || !data) return null;
      return new Uint8Array(await data.arrayBuffer());
    },
    async fetchImage(url) {
      try {
        return await fetchBytes(url, 8_000);
      } catch {
        return null;
      }
    },
    fonts: loadFonts,
    async upload(path, pdf) {
      const { error } = await db.storage.from("signed-documents").upload(path, pdf, { contentType: "application/pdf", upsert: true });
      if (error) throw new Error(`Upload PDF lỗi: ${error.message}`);
    },
    async finish(id, path, sha256) {
      const { error } = await db.rpc("esign_finish_pdf_job", { p_document_id: id, p_path: path, p_sha256: sha256 });
      if (error) throw new Error(error.message);
    },
    async fail(id, message) {
      await db.rpc("esign_fail_pdf_job", { p_document_id: id, p_error: message });
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!isInternalRequest(req)) return json({ error: "Forbidden" }, 403);

  let documentId = "";
  try {
    documentId = String((await req.json())?.document_id ?? "");
  } catch {
    // body sai định dạng
  }
  if (!documentId) return json({ error: "document_id is required" }, 400);

  const result = await renderDocumentPdf(repo(), documentId, {
    verifyBaseUrl: APP_PUBLIC_URL ? `${APP_PUBLIC_URL}/verify/` : undefined,
  });
  return json(result, result.outcome === "failed" ? 500 : 200);
});
