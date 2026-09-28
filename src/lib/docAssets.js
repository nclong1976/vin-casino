import { supabase } from "@/lib/supabase";

/**
 * Tải ảnh của Khung văn bản (logo, con dấu, chữ ký đại diện) lên bucket
 * public "doc-assets" (chỉ Admin được ghi - xem migration
 * 20260928210000_esign_phase2_schema.sql). Trả về URL công khai để lưu vào
 * document_letterheads.header/issuer.
 */
export async function uploadDocAsset(blob, { folder = "letterheads", ext = "png" } = {}) {
  const contentType = blob.type || (ext === "png" ? "image/png" : `image/${ext}`);
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("doc-assets").upload(path, blob, { contentType, upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from("doc-assets").getPublicUrl(path);
  if (!data?.publicUrl) throw new Error("Không lấy được URL công khai sau khi upload");
  return data.publicUrl;
}
