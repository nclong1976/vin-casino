import React, { useRef, useState } from "react";
import { PAGE_HEIGHT_MM, PAGE_WIDTH_MM, DEFAULT_THEME } from "@/shared/docLayout";
import { Field, Select, TextInput, Toggle } from "./ui";

/** Giới hạn chỉnh khung ký (mm). */
export const SLOT_LIMITS = { minW: 30, minH: 15, maxH: 60, maxOffsetX: 20, maxOffsetY: 20 };

export function columnWidthMm(theme) {
  const m = { ...DEFAULT_THEME.margins_mm, ...(theme?.margins_mm || {}) };
  return (PAGE_WIDTH_MM - m.left - m.right) / 2;
}

const round1 = (n) => Math.round(n);
const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);

/** Áp giới hạn cho cấu hình 1 khung ký. */
export function clampSlotBox(box, colW) {
  return {
    ...box,
    w_mm: clamp(round1(box.w_mm), SLOT_LIMITS.minW, Math.floor(colW)),
    h_mm: clamp(round1(box.h_mm), SLOT_LIMITS.minH, SLOT_LIMITS.maxH),
    offset_x_mm: clamp(round1(box.offset_x_mm || 0), -SLOT_LIMITS.maxOffsetX, SLOT_LIMITS.maxOffsetX),
    offset_y_mm: clamp(round1(box.offset_y_mm || 0), 0, SLOT_LIMITS.maxOffsetY),
  };
}

/**
 * Lớp phủ trên trang xem trước: kéo thân khung ký để đổi lệch X/Y, kéo góc
 * dưới-phải để đổi kích thước (snap 1 mm). Trong lúc kéo chỉ dịch "bóng"
 * của khung; thả tay mới ghi vào layout (bộ dàn trang chạy lại 1 lần).
 */
export function SlotDragOverlay({ page, slots, selectedId, onSelect, onChangeBox, colW }) {
  const containerRef = useRef(null);
  const [drag, setDrag] = useState(null); // { id, mode, startX, startY, dx, dy }

  const items = page.items.filter((i) => i.kind === "slot");
  if (!items.length) return null;

  const pxToMm = () => PAGE_WIDTH_MM / (containerRef.current?.getBoundingClientRect().width || PAGE_WIDTH_MM);

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
    const slot = slots.find((s) => s.id === drag.id);
    if (slot && (drag.dx || drag.dy)) {
      const box = { ...slot.box };
      if (drag.mode === "move") {
        box.offset_x_mm = (box.offset_x_mm || 0) + drag.dx;
        box.offset_y_mm = (box.offset_y_mm || 0) + drag.dy;
      } else {
        box.w_mm += drag.dx;
        box.h_mm += drag.dy;
      }
      onChangeBox(drag.id, clampSlotBox(box, colW));
    }
    setDrag(null);
  };

  return (
    <div ref={containerRef} className="absolute inset-0" onPointerMove={move} onPointerUp={end} onPointerCancel={end} style={{ pointerEvents: drag ? "auto" : "none" }}>
      {items.map((it) => {
        const active = drag?.id === it.slotId;
        const dx = active && drag.mode === "move" ? drag.dx : 0;
        const dy = active && drag.mode === "move" ? drag.dy : 0;
        const dw = active && drag.mode === "resize" ? drag.dx : 0;
        const dh = active && drag.mode === "resize" ? drag.dy : 0;
        const selected = selectedId === it.slotId;
        return (
          <div
            key={it.slotId}
            role="button"
            tabIndex={0}
            aria-label={`Khung ký ${it.slotId} - kéo để di chuyển`}
            onPointerDown={(e) => start(e, it.slotId, "move")}
            onKeyDown={(e) => e.key === "Enter" && onSelect(it.slotId)}
            className={`absolute cursor-move rounded-[3px] border-2 ${selected ? "border-[#948154] bg-[#948154]/10" : "border-dashed border-sky-400/80 bg-sky-400/5 hover:bg-sky-400/10"}`}
            style={{
              pointerEvents: "auto",
              touchAction: "none",
              left: `${((it.x + dx) / PAGE_WIDTH_MM) * 100}%`,
              top: `${((it.y + dy) / PAGE_HEIGHT_MM) * 100}%`,
              width: `${(Math.max(it.w + dw, SLOT_LIMITS.minW) / PAGE_WIDTH_MM) * 100}%`,
              height: `${(Math.max(it.h + dh, SLOT_LIMITS.minH) / PAGE_HEIGHT_MM) * 100}%`,
            }}
          >
            <span className="absolute -top-4 left-0 text-[9px] font-semibold text-[#7d6c45] bg-white/90 px-1 rounded whitespace-nowrap">
              {it.role === "issuer" ? "Bên phát hành" : "Người nhận"} · {Math.round(it.w + dw)}×{Math.round(it.h + dh)} mm
            </span>
            <span
              role="button"
              tabIndex={-1}
              aria-label="Kéo để đổi kích thước"
              onPointerDown={(e) => start(e, it.slotId, "resize")}
              className="absolute -right-1.5 -bottom-1.5 w-3.5 h-3.5 rounded-sm bg-[#948154] border-2 border-white cursor-nwse-resize"
              style={{ touchAction: "none" }}
            />
          </div>
        );
      })}
    </div>
  );
}

/** Inspector cho khung ký đang chọn (spec 6.2, cột phải). */
export function SlotInspector({ slot, onChange, colW }) {
  if (!slot) return <p className="text-[11px] text-gray-400">Chọn một khung ký trên bản xem trước để chỉnh.</p>;
  const set = (patch) => onChange({ ...slot, ...patch });
  const setBox = (patch) => onChange({ ...slot, box: clampSlotBox({ ...slot.box, ...patch }, colW) });
  const num = (e) => Number(e.target.value) || 0;

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold text-gray-700">{slot.role === "issuer" ? "Khung bên phát hành (tự chèn chữ ký + con dấu)" : "Khung ký của người nhận"}</p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Cột">
          <Select value={slot.column} onChange={(e) => set({ column: e.target.value })}>
            <option value="left">Trái</option>
            <option value="right">Phải</option>
          </Select>
        </Field>
        <Field label="Căn">
          <Select value={slot.align || "center"} onChange={(e) => set({ align: e.target.value })}>
            <option value="left">Trái</option>
            <option value="center">Giữa</option>
            <option value="right">Phải</option>
          </Select>
        </Field>
        <Field label="Rộng (mm)">
          <TextInput type="number" value={slot.box.w_mm} onChange={(e) => setBox({ w_mm: num(e) })} />
        </Field>
        <Field label="Cao (mm)">
          <TextInput type="number" value={slot.box.h_mm} onChange={(e) => setBox({ h_mm: num(e) })} />
        </Field>
        <Field label="Lệch X (mm)">
          <TextInput type="number" value={slot.box.offset_x_mm || 0} onChange={(e) => setBox({ offset_x_mm: num(e) })} />
        </Field>
        <Field label="Lệch Y (mm)">
          <TextInput type="number" value={slot.box.offset_y_mm || 0} onChange={(e) => setBox({ offset_y_mm: num(e) })} />
        </Field>
      </div>
      <Field label="Tiêu đề khung">
        <TextInput value={slot.heading || ""} onChange={(e) => set({ heading: e.target.value })} />
      </Field>
      <Field label="Gợi ý">
        <TextInput value={slot.hint || ""} onChange={(e) => set({ hint: e.target.value })} />
      </Field>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        <Toggle checked={!!slot.show_name} onChange={(v) => set({ show_name: v })} label="Hiện tên" />
        {slot.role === "recipient" && <Toggle checked={!!slot.show_signed_at} onChange={(v) => set({ show_signed_at: v })} label="Hiện giờ ký" />}
      </div>
    </div>
  );
}
