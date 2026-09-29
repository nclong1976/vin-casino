import React, { useEffect, useMemo, useRef, useState } from "react";
import { ImageUp, Loader2, PenLine, Type, Bookmark } from "lucide-react";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { base44 } from "@/api/base44Client";
import { removeBackgroundFromFile } from "@/lib/imageBackground";
import DrawSignaturePad from "@/components/signature/DrawSignaturePad";
import {
  INK_COLORS,
  TYPED_FONTS,
  blobToDataUrl,
  canvasToSignaturePng,
  ensureSignatureFonts,
  imageSize,
  renderTypedSignature,
} from "@/lib/signatureImage";

export const CONSENT_TEXT = "Tôi đã đọc, hiểu và đồng ý với toàn bộ nội dung văn bản trên.";

const TABS = [
  { id: "draw", label: "Vẽ tay", icon: PenLine },
  { id: "upload", label: "Tải ảnh", icon: ImageUp },
  { id: "typed", label: "Gõ tên", icon: Type },
  { id: "saved", label: "Đã lưu", icon: Bookmark },
];

/**
 * Bảng ký (spec 7.3): mở từ đáy màn hình khi chạm vào khung "Chạm để ký".
 * Mọi kiểu ký đều ra 1 ảnh PNG nền trong suốt; người dùng thấy đúng ảnh sẽ
 * đặt lên văn bản trước khi xác nhận. Bắt buộc tick câu đồng ý.
 *
 * onConfirm({ method, dataUrl, width, height, typedText?, font?,
 *             savedSignatureId?, saveForLater }) - trả Promise; lỗi thì bảng
 * giữ nguyên để người dùng thử lại.
 */
export default function SignatureSheet({ open, onOpenChange, signerName = "", busy = false, onConfirm }) {
  const [tab, setTab] = useState("draw");
  const [color, setColor] = useState(INK_COLORS[0].id);
  const [hasInk, setHasInk] = useState(false);
  const [upload, setUpload] = useState(null); // {file, dataUrl, width, height}
  const [threshold, setThreshold] = useState(200);
  const [uploadError, setUploadError] = useState("");
  const [typedText, setTypedText] = useState(signerName);
  const [font, setFont] = useState(TYPED_FONTS[0].id);
  const [fontsReady, setFontsReady] = useState(false);
  const [saved, setSaved] = useState(null);
  const [savedPick, setSavedPick] = useState(null);
  const [consent, setConsent] = useState(false);
  const [saveForLater, setSaveForLater] = useState(false);
  const [error, setError] = useState("");
  const padRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setConsent(false);
    setError("");
    setTypedText((t) => t || signerName);
  }, [open, signerName]);

  useEffect(() => {
    if (!open || tab !== "typed" || fontsReady) return;
    ensureSignatureFonts().finally(() => setFontsReady(true));
  }, [open, tab, fontsReady]);

  useEffect(() => {
    if (!open || tab !== "saved" || saved) return;
    base44.entities.Signature.list("-created_date", 12)
      .then((rows) => setSaved((rows || []).filter((s) => typeof s.content === "string" && s.content)))
      .catch(() => setSaved([]));
  }, [open, tab, saved]);

  // Xoá nền ảnh tải lên lại mỗi khi đổi ngưỡng.
  useEffect(() => {
    if (!upload?.file) return undefined;
    let cancelled = false;
    setUploadError("");
    removeBackgroundFromFile(upload.file, { threshold, maxWidth: 1200, maxHeight: 600 })
      .then(async ({ blob, width, height }) => {
        const dataUrl = await blobToDataUrl(blob);
        if (!cancelled) setUpload((u) => (u?.file === upload.file ? { ...u, dataUrl, width, height } : u));
      })
      .catch((e) => {
        if (!cancelled) setUploadError(e.message || "Không xử lý được ảnh");
      });
    return () => {
      cancelled = true;
    };
  }, [upload?.file, threshold]);

  const typedPreview = useMemo(() => {
    if (tab !== "typed" || !fontsReady || !typedText.trim()) return null;
    try {
      return renderTypedSignature(typedText, font, color);
    } catch {
      return null;
    }
  }, [tab, fontsReady, typedText, font, color]);

  const ready =
    (tab === "draw" && hasInk) ||
    (tab === "upload" && !!upload?.dataUrl) ||
    (tab === "typed" && !!typedPreview) ||
    (tab === "saved" && !!savedPick);

  const confirm = async () => {
    setError("");
    if (!consent) {
      setError("Vui lòng tick xác nhận đã đọc và đồng ý");
      return;
    }
    let payload = null;
    try {
      if (tab === "draw") {
        const png = canvasToSignaturePng(padRef.current.getCanvas());
        if (!png) throw new Error("Vui lòng ký vào khung");
        payload = { method: "draw", ...png };
      } else if (tab === "upload") {
        payload = { method: "upload", dataUrl: upload.dataUrl, width: upload.width, height: upload.height };
      } else if (tab === "typed") {
        payload = { method: "typed", ...typedPreview, typedText: typedText.trim(), font };
      } else if (tab === "saved") {
        if (savedPick.content.startsWith("data:image/png")) {
          const size = await imageSize(savedPick.content);
          payload = { method: "saved", dataUrl: savedPick.content, ...size, savedSignatureId: savedPick.id };
        } else if (savedPick.content.startsWith("data:image")) {
          // Ảnh cũ không phải PNG → chuyển sang PNG như ảnh tải lên.
          const blob = await (await fetch(savedPick.content)).blob();
          const out = await removeBackgroundFromFile(blob, { maxWidth: 1200, maxHeight: 600 });
          payload = { method: "upload", dataUrl: await blobToDataUrl(out.blob), width: out.width, height: out.height };
        } else {
          // Chữ ký kiểu cũ lưu dạng chữ → vẽ lại thành PNG bằng font viết tay.
          await ensureSignatureFonts();
          const png = renderTypedSignature(savedPick.content, TYPED_FONTS[0].id, color);
          if (!png) throw new Error("Chữ ký đã lưu không hợp lệ");
          payload = { method: "typed", ...png, typedText: savedPick.content, font: TYPED_FONTS[0].id };
        }
      }
      await onConfirm?.({ ...payload, saveForLater: saveForLater && tab !== "saved" });
    } catch (e) {
      setError(e?.message || "Không ký được, vui lòng thử lại");
    }
  };

  return (
    <Drawer open={open} onOpenChange={(v) => !busy && onOpenChange?.(v)} shouldScaleBackground={false}>
      <DrawerContent className="max-h-[92vh] font-heading">
        <div className="mx-auto w-full max-w-lg overflow-y-auto">
          <DrawerHeader className="pb-2 text-left">
            <DrawerTitle className="text-[15px]">Ký văn bản</DrawerTitle>
            <DrawerDescription className="text-[11px]">Chữ ký sẽ được đặt vào khung ký của bạn và khoá cùng văn bản.</DrawerDescription>
          </DrawerHeader>

          <div className="px-4 space-y-3">
            <div className="grid grid-cols-4 gap-1 bg-gray-100 rounded-lg p-1" role="tablist">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex flex-col items-center gap-0.5 py-1.5 rounded-md text-[10px] font-medium transition ${
                    tab === t.id ? "bg-white text-[#948154] shadow-sm" : "text-gray-500"
                  }`}
                >
                  <t.icon className="w-3.5 h-3.5" />
                  {t.label}
                </button>
              ))}
            </div>

            {(tab === "draw" || tab === "typed") && (
              <div className="flex items-center gap-2 text-[11px] text-gray-500">
                Màu mực:
                {INK_COLORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    aria-label={c.label}
                    onClick={() => setColor(c.id)}
                    className={`w-5 h-5 rounded-full ring-offset-1 ${color === c.id ? "ring-2 ring-[#948154]" : ""}`}
                    style={{ background: c.id }}
                  />
                ))}
              </div>
            )}

            {tab === "draw" && <DrawSignaturePad ref={padRef} color={color} onChange={setHasInk} />}

            {tab === "upload" && (
              <div className="space-y-2">
                <label className="flex items-center justify-center h-11 rounded-lg border border-dashed border-gray-300 text-[11px] text-gray-600 cursor-pointer hover:border-[#948154]">
                  <ImageUp className="w-4 h-4 mr-1.5" />
                  {upload ? "Chọn ảnh khác" : "Chọn ảnh chữ ký (chụp trên giấy trắng)"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      if (file.size > 10 * 1024 * 1024) {
                        setUploadError("Ảnh quá 10 MB");
                        return;
                      }
                      setUpload({ file });
                    }}
                  />
                </label>
                {upload && (
                  <>
                    <Preview src={upload.dataUrl} loading={!upload.dataUrl && !uploadError} />
                    <div>
                      <p className="text-[10px] text-gray-500 mb-1">Độ xoá nền: {threshold}</p>
                      <Slider min={120} max={250} step={5} value={[threshold]} onValueChange={([v]) => setThreshold(v)} />
                    </div>
                  </>
                )}
                {uploadError && <p className="text-[11px] text-rose-600">{uploadError}</p>}
              </div>
            )}

            {tab === "typed" && (
              <div className="space-y-2">
                <input
                  value={typedText}
                  onChange={(e) => setTypedText(e.target.value.slice(0, 60))}
                  placeholder="Nhập họ tên của bạn"
                  className="w-full h-10 px-3 rounded-lg border border-gray-300 outline-none text-[13px] focus:border-[#948154]"
                />
                <div className="grid grid-cols-2 gap-1.5">
                  {TYPED_FONTS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFont(f.id)}
                      className={`h-12 rounded-lg border bg-white px-2 truncate text-[20px] ${font === f.id ? "border-[#948154] ring-1 ring-[#948154]" : "border-gray-200"}`}
                      style={{ fontFamily: `'${f.id}', cursive`, color }}
                    >
                      {typedText.trim() || "Chữ ký"}
                    </button>
                  ))}
                </div>
                <Preview src={typedPreview?.dataUrl} loading={!fontsReady} />
              </div>
            )}

            {tab === "saved" && (
              <div>
                {saved === null ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                  </div>
                ) : saved.length === 0 ? (
                  <p className="text-[11px] text-gray-400 text-center py-6">Chưa có chữ ký đã lưu.</p>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {saved.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSavedPick(s)}
                        className={`h-16 rounded-lg border bg-white flex items-center justify-center overflow-hidden ${
                          savedPick?.id === s.id ? "border-[#948154] ring-1 ring-[#948154]" : "border-gray-200"
                        }`}
                      >
                        {s.content.startsWith("data:image") ? (
                          <img src={s.content} alt="Chữ ký đã lưu" className="w-full h-full object-contain p-1" />
                        ) : (
                          <span style={{ fontFamily: "'Great Vibes', cursive" }} className="text-[16px] text-[#16100b] truncate px-1">
                            {s.content}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab !== "saved" && (
              <label className="flex items-center gap-2 text-[11px] text-gray-600">
                <Checkbox checked={saveForLater} onCheckedChange={(v) => setSaveForLater(v === true)} />
                Lưu chữ ký này để dùng lần sau
              </label>
            )}

            <label className="flex items-start gap-2 rounded-lg bg-amber-50 p-2.5 text-[11.5px] text-amber-900">
              <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5 border-amber-700" />
              <span>{CONSENT_TEXT}</span>
            </label>

            {error && <p className="text-[11px] text-rose-600">{error}</p>}
          </div>

          <DrawerFooter className="pt-3">
            <button
              type="button"
              onClick={confirm}
              disabled={!ready || !consent || busy}
              className="w-full h-11 rounded-lg bg-[#948154] hover:bg-[#837046] disabled:opacity-50 text-white text-[13px] font-semibold flex items-center justify-center gap-2"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {busy ? "Đang ký..." : "Xác nhận ký"}
            </button>
            <button type="button" onClick={() => onOpenChange?.(false)} disabled={busy} className="w-full h-9 text-[12px] text-gray-500">
              Huỷ
            </button>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function Preview({ src, loading }) {
  return (
    <div
      className="h-24 rounded-lg border border-gray-200 flex items-center justify-center"
      style={{ backgroundImage: "repeating-conic-gradient(#f3f4f6 0% 25%, #ffffff 0% 50%)", backgroundSize: "14px 14px" }}
    >
      {loading ? <Loader2 className="w-5 h-5 animate-spin text-gray-400" /> : src ? <img src={src} alt="Xem trước chữ ký" className="max-h-20 max-w-[90%] object-contain" /> : null}
    </div>
  );
}
