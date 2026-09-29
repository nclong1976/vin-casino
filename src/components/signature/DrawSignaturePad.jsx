import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Eraser, Undo2 } from "lucide-react";

/**
 * Khung vẽ chữ ký (spec 7.3 - "Vẽ tay"): Pointer Events (ngón tay / bút /
 * chuột), nét mượt bằng đường cong bậc 2, nét dày hơn khi bút có lực ấn,
 * hoàn tác từng nét, nét vẽ sắc theo devicePixelRatio. Canvas nền trong suốt
 * để ảnh xuất ra đặt thẳng lên văn bản.
 *
 * ref: { getCanvas(), clear(), isEmpty() }. onChange(hasInk) mỗi khi đổi nét.
 */
const DrawSignaturePad = forwardRef(function DrawSignaturePad({ color = "#16100b", onChange, className = "" }, ref) {
  const canvasRef = useRef(null);
  const strokes = useRef([]);
  const current = useRef(null);
  const [count, setCount] = useState(0);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const ratio = canvas.width / (canvas.clientWidth || 1);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const s of strokes.current) drawStroke(ctx, s);
    if (current.current) drawStroke(ctx, current.current);
  }, []);

  // Canvas theo kích thước hiển thị × DPR; vẽ lại khi đổi kích thước (xoay máy).
  useEffect(() => {
    const canvas = canvasRef.current;
    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.round(canvas.clientWidth * ratio);
      canvas.height = Math.round(canvas.clientHeight * ratio);
      redraw();
    };
    resize();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    ro?.observe(canvas);
    return () => ro?.disconnect();
  }, [redraw]);

  const notify = (n) => {
    setCount(n);
    onChange?.(n > 0);
  };

  const clearLocal = () => {
    strokes.current = [];
    redraw();
    notify(0);
  };

  useImperativeHandle(ref, () => ({
    getCanvas: () => canvasRef.current,
    isEmpty: () => strokes.current.length === 0,
    clear: clearLocal,
  }));

  const point = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    const pressure = e.pointerType === "pen" && e.pressure > 0 ? e.pressure : 0.5;
    return { x: e.clientX - r.left, y: e.clientY - r.top, p: pressure };
  };

  const onPointerDown = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    canvasRef.current.setPointerCapture?.(e.pointerId);
    current.current = { color, points: [point(e)] };
    redraw();
  };

  const onPointerMove = (e) => {
    if (!current.current) return;
    e.preventDefault();
    const events = e.nativeEvent.getCoalescedEvents?.() || [e.nativeEvent];
    for (const ev of events) current.current.points.push(point(ev));
    redraw();
  };

  const onPointerUp = () => {
    if (!current.current) return;
    strokes.current = [...strokes.current, current.current];
    current.current = null;
    redraw();
    notify(strokes.current.length);
  };

  const undo = () => {
    strokes.current = strokes.current.slice(0, -1);
    redraw();
    notify(strokes.current.length);
  };

  return (
    <div className={className}>
      <div className="relative">
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          aria-label="Khung vẽ chữ ký"
          // Bảng ký là vaul Drawer: không để nét vẽ bị hiểu là vuốt đóng bảng.
          data-vaul-no-drag=""
          className="block w-full h-44 rounded-xl border-2 border-dashed border-gray-300 bg-white touch-none cursor-crosshair"
        />
        {count === 0 && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[11px] text-gray-300">
            Ký tên bằng ngón tay hoặc bút vào khung này
          </span>
        )}
        <span className="pointer-events-none absolute left-6 right-6 bottom-9 border-b border-gray-200" />
      </div>
      <div className="flex justify-end gap-3 mt-1.5">
        <button type="button" onClick={undo} disabled={count === 0} className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-[#948154] disabled:opacity-40">
          <Undo2 className="w-3.5 h-3.5" /> Hoàn tác
        </button>
        <button type="button" onClick={clearLocal} disabled={count === 0} className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-[#948154] disabled:opacity-40">
          <Eraser className="w-3.5 h-3.5" /> Xoá
        </button>
      </div>
    </div>
  );
});

function drawStroke(ctx, stroke) {
  const pts = stroke.points;
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  if (pts.length === 1) {
    ctx.beginPath();
    ctx.arc(pts[0].x, pts[0].y, width(pts[0]) / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  // Từng đoạn cong qua trung điểm → nét mượt; độ dày theo lực ấn.
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const prevMid = i > 1 ? mid(pts[i - 2], a) : a;
    const nextMid = mid(a, b);
    ctx.beginPath();
    ctx.lineWidth = width(b);
    ctx.moveTo(prevMid.x, prevMid.y);
    ctx.quadraticCurveTo(a.x, a.y, nextMid.x, nextMid.y);
    ctx.stroke();
  }
  const last = pts[pts.length - 1];
  const beforeLast = mid(pts[pts.length - 2], last);
  ctx.beginPath();
  ctx.moveTo(beforeLast.x, beforeLast.y);
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
}

const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const width = (p) => 1.6 + p.p * 2.4;

export default DrawSignaturePad;
