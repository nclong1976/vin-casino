import React, { useRef, useState } from "react";
import { Anchor, CalendarDays, CheckSquare, PenLine, Signature, Trash2, Type } from "lucide-react";
import { FIELD_SIZE_LIMITS, PAGE_HEIGHT_MM, PAGE_WIDTH_MM } from "@/shared/docLayout";
import { Button, Field, Select, TextInput, Toggle } from "./ui";

/**
 * Trường người nhận điền khi ký (spec hợp đồng mục 2.1-2.3): danh sách +
 * thêm/xoá + Inspector, và lớp kéo-thả trên bản xem trước để đổi vị trí /
 * kích thước. Vị trí lưu dạng "điểm neo trong nội dung + độ lệch mm", bộ dàn
 * trang tính toạ độ thật cho từng người nhận.
 */

export const FIELD_TYPE_META = {
  signature: { label: "Chữ ký", icon: Signature },
  initials: { label: "Ký nháy", icon: PenLine },
  date: { label: "Ngày ký", icon: CalendarDays },
  checkbox: { label: "Ô xác nhận", icon: CheckSquare },
  text: { label: "Ô nhập chữ", icon: Type },
};

const DEFAULT_LABELS = {
  signature: "Chữ ký",
  initials: "",
  date: "Ngày ký",
  checkbox: "Tôi đã đọc và đồng ý với điều khoản trên",
  text: "Thông tin bổ sung",
};

const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);

/** Tạo trường mới với mã chưa dùng. */
export function newField(type, existing) {
  const used = new Set(existing.map((f) => f.id));
  let n = 1;
  while (used.has(`${type}_${n}`)) n += 1;
  const lim = FIELD_SIZE_LIMITS[type];
  return {
    id: `${type}_${n}`,
    type,
    label: DEFAULT_LABELS[type],
    required: type !== "text",
    size_mm: { w: lim.def[0], h: lim.def[1] },
    anchor: type === "initials" ? { kind: "every_page_footer", align: "right", pages: "all_but_last" } : { kind: "flow" },
    offset_mm: { x: 0, y: 0 },
    ...(type === "checkbox" ? { options: { must_be_checked: true } } : {}),
  };
}

function clampSize(type, size) {
  const lim = FIELD_SIZE_LIMITS[type];
  let w = clamp(Math.round(size.w), lim.min[0], lim.max[0]);
  let h = clamp(Math.round(size.h), lim.min[1], lim.max[1]);
  if (type === "checkbox") w = h = Math.min(w, h);
  return { w, h };
}

export function FieldsPanel({ fields, selectedId, anchoredIds, onSelect, onAdd, onChange, onRemove, onInsertAnchor }) {
  const field = fields.find((f) => f.id === selectedId);
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-5 gap-1">
        {Object.entries(FIELD_TYPE_META).map(([type, meta]) => (
          <button
            key={type}
            type="button"
            onClick={() => onAdd(type)}
            title={`Thêm ${meta.label.toLowerCase()}`}
            className="flex flex-col items-center gap-0.5 rounded-md border border-dashed border-gray-300 py-1.5 text-[9.5px] text-gray-600 hover:border-[#948154] hover:text-[#7d6c45]"
          >
            <meta.icon className="w-3.5 h-3.5" />
            {meta.label}
          </button>
        ))}
      </div>

      {fields.length === 0 ? (
        <p className="text-[10.5px] text-gray-400">Chưa có trường. Khung ký người nhận ở trên luôn có sẵn; thêm ký nháy, ô xác nhận... nếu cần.</p>
      ) : (
        <div className="space-y-1">
          {fields.map((f) => {
            const meta = FIELD_TYPE_META[f.type];
            const footer = f.anchor?.kind === "every_page_footer";
            const anchored = footer || anchoredIds.includes(f.id);
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => onSelect(f.id)}
                className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md border text-left ${selectedId === f.id ? "border-[#948154] bg-[#948154]/10" : "border-gray-200 hover:bg-gray-50"}`}
              >
                <meta.icon className="w-3.5 h-3.5 text-[#948154] shrink-0" />
                <span className="flex-1 min-w-0 truncate text-[11px] text-gray-800">{f.label || meta.label}</span>
                <span className={`text-[9px] shrink-0 ${anchored ? "text-sky-600" : "text-orange-600"}`}>{footer ? "chân trang" : anchored ? "đã neo" : "chưa neo"}</span>
              </button>
            );
          })}
        </div>
      )}

      {field && <FieldInspector field={field} anchored={anchoredIds.includes(field.id)} onChange={onChange} onRemove={onRemove} onInsertAnchor={onInsertAnchor} />}
    </div>
  );
}

function FieldInspector({ field, anchored, onChange, onRemove, onInsertAnchor }) {
  const set = (patch) => onChange({ ...field, ...patch });
  const num = (e) => Number(e.target.value) || 0;
  const footer = field.anchor?.kind === "every_page_footer";

  return (
    <div className="rounded-lg border border-gray-200 p-2 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold text-gray-700">
          {FIELD_TYPE_META[field.type].label} · <span className="font-mono text-gray-400">{field.id}</span>
        </p>
        <button type="button" onClick={() => onRemove(field.id)} className="text-rose-500 hover:text-rose-600" aria-label="Xoá trường">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <Field label={field.type === "checkbox" ? "Nội dung xác nhận" : "Nhãn"}>
        <TextInput value={field.label || ""} onChange={(e) => set({ label: e.target.value.slice(0, 160) })} />
      </Field>

      {field.type !== "date" && <Toggle checked={field.required !== false} onChange={(v) => set({ required: v })} label="Bắt buộc" />}

      {field.type === "initials" && (
        <Field label="Vị trí">
          <Select
            value={footer ? field.anchor.pages || "all_but_last" : "flow"}
            onChange={(e) =>
              set({ anchor: e.target.value === "flow" ? { kind: "flow" } : { kind: "every_page_footer", align: field.anchor?.align || "right", pages: e.target.value } })
            }
          >
            <option value="all_but_last">Chân mọi trang (trừ trang cuối)</option>
            <option value="all">Chân mọi trang</option>
            <option value="flow">Một chỗ trong nội dung</option>
          </Select>
        </Field>
      )}

      {field.type === "text" && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Tối đa (ký tự)">
            <TextInput type="number" value={field.options?.max_length || 200} onChange={(e) => set({ options: { ...field.options, max_length: clamp(num(e), 1, 200) } })} />
          </Field>
          <Field label="Gợi ý">
            <TextInput value={field.options?.placeholder || ""} onChange={(e) => set({ options: { ...field.options, placeholder: e.target.value.slice(0, 80) } })} />
          </Field>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Field label="Rộng (mm)">
          <TextInput type="number" value={field.size_mm.w} onChange={(e) => set({ size_mm: clampSize(field.type, { ...field.size_mm, w: num(e) }) })} />
        </Field>
        <Field label="Cao (mm)">
          <TextInput type="number" value={field.size_mm.h} onChange={(e) => set({ size_mm: clampSize(field.type, { ...field.size_mm, h: num(e) }) })} />
        </Field>
        {!footer && (
          <>
            <Field label="Lệch trái (mm)">
              <TextInput type="number" value={field.offset_mm?.x || 0} onChange={(e) => set({ offset_mm: { ...field.offset_mm, x: clamp(num(e), 0, 170) } })} />
            </Field>
            <Field label="Lệch xuống (mm)">
              <TextInput type="number" value={field.offset_mm?.y || 0} onChange={(e) => set({ offset_mm: { ...field.offset_mm, y: clamp(num(e), 0, 30) } })} />
            </Field>
          </>
        )}
      </div>

      {!footer && (
        <Button variant="secondary" className="w-full h-8 text-[11px]" onClick={() => onInsertAnchor(field.id)}>
          <Anchor className="w-3.5 h-3.5" /> {anchored ? "Đặt lại điểm neo tại con trỏ" : "Neo vào dòng đang chọn"}
        </Button>
      )}
      {!footer && (
        <p className="text-[10px] text-gray-400">
          Đặt con trỏ ở đoạn văn trong khung Soạn rồi bấm nút trên - trường sẽ nằm ngay dưới đoạn đó với mọi người nhận. Ở chế độ "Xem trước bản in" có thể kéo trường để chỉnh lệch.
        </p>
      )}
    </div>
  );
}

/**
 * Kéo trường trên bản xem trước: kéo thân đổi lệch trái/xuống (trường trong
 * nội dung), kéo góc dưới-phải đổi kích thước. Thả tay mới ghi vào layout.
 */
export function FieldDragOverlay({ page, fields, selectedId, onSelect, onChangeField }) {
  const ref = useRef(null);
  const [drag, setDrag] = useState(null);
  const items = page.items.filter((i) => i.kind === "field");
  if (!items.length) return null;
  const byId = new Map(fields.map((f) => [f.id, f]));
  const pxToMm = () => PAGE_WIDTH_MM / (ref.current?.getBoundingClientRect().width || PAGE_WIDTH_MM);

  const start = (e, id, mode) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect(id);
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag({ id, mode, startX: e.clientX, startY: e.clientY, dx: 0, dy: 0 });
  };
  const move = (e) => {
    if (!drag) return;
    const k = pxToMm();
    setDrag((d) => ({ ...d, dx: Math.round((e.clientX - d.startX) * k), dy: Math.round((e.clientY - d.startY) * k) }));
  };
  const end = () => {
    if (!drag) return;
    const field = byId.get(drag.id);
    if (field && (drag.dx || drag.dy)) {
      if (drag.mode === "move" && field.anchor?.kind !== "every_page_footer") {
        onChangeField({
          ...field,
          offset_mm: { x: clamp((field.offset_mm?.x || 0) + drag.dx, 0, 170), y: clamp((field.offset_mm?.y || 0) + drag.dy, 0, 30) },
        });
      } else if (drag.mode === "resize") {
        onChangeField({ ...field, size_mm: clampSize(field.type, { w: field.size_mm.w + drag.dx, h: field.size_mm.h + drag.dy }) });
      }
    }
    setDrag(null);
  };

  return (
    <div ref={ref} className="absolute inset-0" onPointerMove={move} onPointerUp={end} onPointerCancel={end} style={{ pointerEvents: drag ? "auto" : "none" }}>
      {items.map((it) => {
        const field = byId.get(it.fieldId);
        if (!field) return null;
        const active = drag?.id === it.fieldId;
        const movable = field.anchor?.kind !== "every_page_footer";
        const dx = active && drag.mode === "move" && movable ? drag.dx : 0;
        const dy = active && drag.mode === "move" && movable ? drag.dy : 0;
        const dw = active && drag.mode === "resize" ? drag.dx : 0;
        const dh = active && drag.mode === "resize" ? drag.dy : 0;
        const selected = selectedId === it.fieldId;
        return (
          <div
            key={`${it.fieldId}-${it.occurrence}`}
            role="button"
            tabIndex={0}
            aria-label={`Trường ${field.label || field.id}`}
            onPointerDown={(e) => start(e, it.fieldId, "move")}
            onKeyDown={(e) => e.key === "Enter" && onSelect(it.fieldId)}
            className={`absolute rounded-[2px] border-2 ${movable ? "cursor-move" : "cursor-pointer"} ${selected ? "border-[#948154] bg-[#948154]/10" : "border-dashed border-violet-400/80 bg-violet-400/5 hover:bg-violet-400/10"}`}
            style={{
              pointerEvents: "auto",
              touchAction: "none",
              left: `${((it.x + dx) / PAGE_WIDTH_MM) * 100}%`,
              top: `${((it.y + dy) / PAGE_HEIGHT_MM) * 100}%`,
              width: `${(Math.max(it.w + dw, 3) / PAGE_WIDTH_MM) * 100}%`,
              height: `${(Math.max(it.h + dh, 3) / PAGE_HEIGHT_MM) * 100}%`,
            }}
          >
            {it.occurrence === 0 && (
              <span className="absolute -top-4 left-0 text-[9px] font-semibold text-violet-700 bg-white/90 px-1 rounded whitespace-nowrap pointer-events-none">
                {FIELD_TYPE_META[field.type].label}
              </span>
            )}
            <span
              role="button"
              tabIndex={-1}
              aria-label="Kéo để đổi kích thước"
              onPointerDown={(e) => start(e, it.fieldId, "resize")}
              className="absolute -right-1.5 -bottom-1.5 w-3 h-3 rounded-sm bg-violet-500 border-2 border-white cursor-nwse-resize"
              style={{ touchAction: "none" }}
            />
          </div>
        );
      })}
    </div>
  );
}

