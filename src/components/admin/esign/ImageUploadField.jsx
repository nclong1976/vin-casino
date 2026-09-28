import React, { useRef, useState } from "react";
import { ImagePlus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { removeBackgroundFromFile } from "@/lib/imageBackground";
import { uploadDocAsset } from "@/lib/docAssets";
import { Button, checkerboardStyle } from "./ui";

const MAX_FILE_BYTES = 5 * 1024 * 1024;

/**
 * Chọn ảnh → (tuỳ chọn) xoá nền sáng → cắt viền → tải lên bucket doc-assets.
 * Ảnh JPG luôn có nền đặc nên mặc định bật xoá nền; Admin chỉnh ngưỡng và xem
 * lại trên nền caro trước khi bấm "Dùng ảnh này".
 */
export default function ImageUploadField({ label, hint, value, onChange, removeBackgroundByDefault = true, folder = "letterheads" }) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [removeBg, setRemoveBg] = useState(removeBackgroundByDefault);
  const [threshold, setThreshold] = useState(200);
  const [draft, setDraft] = useState(null); // { blob, url }
  const [busy, setBusy] = useState(false);

  const process = async (f, opts) => {
    setBusy(true);
    try {
      const { blob } = await removeBackgroundFromFile(f, { removeBackground: opts.removeBg, threshold: opts.threshold });
      setDraft((prev) => {
        if (prev?.url) URL.revokeObjectURL(prev.url);
        return { blob, url: URL.createObjectURL(blob) };
      });
    } catch (e) {
      toast.error(e.message || "Không xử lý được ảnh");
    } finally {
      setBusy(false);
    }
  };

  const onPick = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(f.type)) {
      toast.error("Chỉ nhận ảnh PNG, JPG hoặc WEBP");
      return;
    }
    if (f.size > MAX_FILE_BYTES) {
      toast.error("Ảnh tối đa 5 MB");
      return;
    }
    // PNG thường đã có nền trong suốt; JPG/WEBP luôn có nền đặc.
    const bg = f.type === "image/png" ? false : removeBackgroundByDefault;
    setFile(f);
    setRemoveBg(bg);
    process(f, { removeBg: bg, threshold });
  };

  const confirm = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      const url = await uploadDocAsset(draft.blob, { folder, ext: "png" });
      onChange(url);
      cancel();
      toast.success("Đã tải ảnh lên");
    } catch (e) {
      toast.error(`Tải ảnh thất bại: ${e.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    if (draft?.url) URL.revokeObjectURL(draft.url);
    setDraft(null);
    setFile(null);
  };

  return (
    <div>
      <span className="block text-[10.5px] font-semibold text-gray-600 mb-1">{label}</span>
      <div className="flex items-center gap-2">
        <div className="w-20 h-14 rounded-lg border border-gray-200 flex items-center justify-center overflow-hidden shrink-0" style={checkerboardStyle}>
          {value ? <img src={value} alt={label} className="max-w-full max-h-full object-contain" /> : <span className="text-[9px] text-gray-400">Chưa có</span>}
        </div>
        <div className="flex gap-1.5">
          <Button variant="secondary" onClick={() => inputRef.current?.click()} disabled={busy}>
            <ImagePlus className="w-3.5 h-3.5" /> {value ? "Đổi ảnh" : "Chọn ảnh"}
          </Button>
          {value && (
            <Button variant="ghost" onClick={() => onChange(null)} disabled={busy} aria-label={`Xoá ${label}`}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onPick} />
      </div>
      {hint && <p className="text-[9.5px] text-gray-400 mt-1">{hint}</p>}

      {file && (
        <div className="mt-2 p-2 rounded-lg border border-[#948154]/30 bg-[#948154]/5 space-y-2">
          <div className="h-28 rounded-md border border-gray-200 flex items-center justify-center overflow-hidden" style={checkerboardStyle}>
            {busy && !draft ? <Loader2 className="w-5 h-5 animate-spin text-gray-400" /> : draft && <img src={draft.url} alt="Xem trước" className="max-h-full max-w-full object-contain" />}
          </div>
          <label className="flex items-center gap-2 text-[11px] text-gray-700">
            <input
              type="checkbox"
              checked={removeBg}
              onChange={(e) => {
                setRemoveBg(e.target.checked);
                process(file, { removeBg: e.target.checked, threshold });
              }}
            />
            Xoá nền trắng
          </label>
          {removeBg && (
            <label className="block text-[10.5px] text-gray-600">
              Ngưỡng xoá nền: {threshold}
              <input
                type="range"
                min="120"
                max="250"
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                onPointerUp={() => process(file, { removeBg, threshold })}
                onKeyUp={() => process(file, { removeBg, threshold })}
                className="w-full accent-[#948154]"
              />
            </label>
          )}
          <div className="flex justify-end gap-1.5">
            <Button variant="ghost" onClick={cancel} disabled={busy}>Huỷ</Button>
            <Button onClick={confirm} disabled={busy || !draft}>
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Dùng ảnh này
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
