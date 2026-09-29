/**
 * Chuẩn hoá ảnh chữ ký trước khi gửi lên sign-document (spec mục 7.3): luôn
 * là PNG nền trong suốt, đã cắt sát nét, không quá MAX_W×MAX_H và 500 KB.
 * Phần tính toán thuần (fitWithin, trimPadding) tách riêng để test ngoài
 * trình duyệt; phần canvas chỉ chạy trên web.
 */
import { opaqueBounds } from "@/lib/imageBackground";

export const MAX_W = 1200;
export const MAX_H = 600;
export const MAX_BYTES = 480 * 1024;

/** Font cho kiểu "Gõ tên" - đều có bộ ký tự tiếng Việt trên Google Fonts. */
export const TYPED_FONTS = [
  { id: "Great Vibes", label: "Great Vibes" },
  { id: "Dancing Script", label: "Dancing Script" },
  { id: "Allura", label: "Allura" },
  { id: "Pacifico", label: "Pacifico" },
];

export const INK_COLORS = [
  { id: "#16100b", label: "Đen" },
  { id: "#1d3b8b", label: "Xanh" },
];

/** Tỉ lệ thu nhỏ để (w,h) nằm trong (maxW,maxH), không phóng to. */
export function fitWithin(w, h, maxW = MAX_W, maxH = MAX_H) {
  const scale = Math.min(1, maxW / w, maxH / h);
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)), scale };
}

/** Nới khung bao thêm `pad` px mỗi phía, không vượt ra ngoài ảnh. */
export function trimPadding(bounds, width, height, pad) {
  const x = Math.max(0, bounds.x - pad);
  const y = Math.max(0, bounds.y - pad);
  return {
    x,
    y,
    width: Math.min(width, bounds.x + bounds.width + pad) - x,
    height: Math.min(height, bounds.y + bounds.height + pad) - y,
  };
}

/** Số byte thật của data URL base64. */
export function dataUrlBytes(dataUrl) {
  const b64 = String(dataUrl).split(",")[1] || "";
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

/**
 * Cắt sát nét của canvas (bỏ vùng trong suốt), thu nhỏ trong giới hạn rồi
 * xuất PNG. Trả null nếu canvas trống.
 */
export function canvasToSignaturePng(source, { pad = 8 } = {}) {
  const ctx = source.getContext("2d", { willReadFrequently: true });
  const { data } = ctx.getImageData(0, 0, source.width, source.height);
  const bounds = opaqueBounds(data, source.width, source.height);
  if (!bounds) return null;
  const box = trimPadding(bounds, source.width, source.height, pad);

  let limitW = MAX_W;
  let limitH = MAX_H;
  for (let attempt = 0; attempt < 4; attempt++) {
    const size = fitWithin(box.width, box.height, limitW, limitH);
    const out = document.createElement("canvas");
    out.width = size.width;
    out.height = size.height;
    const octx = out.getContext("2d");
    octx.imageSmoothingQuality = "high";
    octx.drawImage(source, box.x, box.y, box.width, box.height, 0, 0, size.width, size.height);
    const dataUrl = out.toDataURL("image/png");
    if (dataUrlBytes(dataUrl) <= MAX_BYTES || attempt === 3) {
      return { dataUrl, width: size.width, height: size.height };
    }
    limitW = Math.round(limitW * 0.7);
    limitH = Math.round(limitH * 0.7);
  }
  return null;
}

const loadedFonts = new Set();

/** Nạp font viết tay từ Google Fonts khi người dùng mở tab "Gõ tên". */
export async function ensureSignatureFonts() {
  if (typeof document === "undefined") return;
  const id = "esign-signature-fonts";
  if (!document.getElementById(id)) {
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Allura&family=Dancing+Script:wght@600&family=Great+Vibes&family=Pacifico&display=swap&subset=vietnamese";
    document.head.appendChild(link);
  }
  await Promise.all(
    TYPED_FONTS.map(async (f) => {
      if (loadedFonts.has(f.id)) return;
      try {
        await document.fonts.load(`64px '${f.id}'`, "Nguyễn Ưng Ẩn");
        loadedFonts.add(f.id);
      } catch {
        // font lỗi mạng → trình duyệt dùng font dự phòng, vẫn ký được
      }
    }),
  );
}

/** Vẽ tên đã gõ bằng font viết tay thành PNG (spec 7.3 - kiểu "Gõ tên"). */
export function renderTypedSignature(text, font = TYPED_FONTS[0].id, color = INK_COLORS[0].id) {
  const value = String(text || "").trim();
  if (!value) return null;
  const fontSize = 120;
  const fontCss = `${font === "Dancing Script" ? "600 " : ""}${fontSize}px '${font}', cursive`;
  const measure = document.createElement("canvas").getContext("2d");
  measure.font = fontCss;
  const textWidth = Math.ceil(measure.measureText(value).width);

  const canvas = document.createElement("canvas");
  canvas.width = Math.min(4000, textWidth + fontSize);
  canvas.height = Math.round(fontSize * 2);
  const ctx = canvas.getContext("2d");
  ctx.font = fontCss;
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.fillText(value, fontSize / 2, canvas.height / 2);
  return canvasToSignaturePng(canvas);
}

/** Đo kích thước ảnh từ data URL. */
export function imageSize(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("Không đọc được ảnh chữ ký"));
    img.src = src;
  });
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Tạo khoá chống gửi trùng cho một lần bấm "Xác nhận ký". */
export function newIdempotencyKey() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
