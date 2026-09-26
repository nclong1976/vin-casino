import React, { useRef, useCallback, useEffect } from "react";
import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react";

const MIN_SCALE = 1;
const MAX_SCALE = 4;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Ảnh cho phép kéo (pan) và phóng to/thu nhỏ (zoom) bằng tay/chuột - dùng
 * cho "bản đồ/phối cảnh dự án" ở ValuationModal.jsx. Tự viết bằng Pointer
 * Events + CSS transform thay vì thêm thư viện bản đồ (leaflet) - dự án
 * này KHÔNG cần toạ độ địa lý thật (lat/lng), chỉ cần kéo/phóng 1 ảnh tĩnh,
 * nên 1 component nhỏ tự viết nhẹ hơn nhiều so với kéo cả bộ máy bản đồ vào
 * chỉ để hiển thị 1 ảnh.
 *
 * Quy ước toạ độ: transform-origin ở CHÍNH GIỮA khung, transform =
 * "translate(tx,ty) scale(s)" - 1 điểm nội dung tại content offset (cx,cy)
 * (tính từ tâm ảnh gốc, chưa phóng to) sẽ hiện ra ở vị trí màn hình
 * (tx + s*cx, ty + s*cy) so với tâm khung. Toàn bộ công thức pinch-zoom/
 * wheel-zoom bên dưới đều suy ra từ đẳng thức này để giữ đúng điểm nội dung
 * đang chạm/trỏ chuột đứng yên khi phóng to, không bị "nhảy" hình.
 */
export default function PanZoomImage({ src, alt, className = "" }) {
  const containerRef = useRef(null);
  const imgRef = useRef(null);
  const scaleRef = useRef(1);
  const txRef = useRef(0);
  const tyRef = useRef(0);
  // Map<pointerId, {x,y}> - theo dõi TẤT CẢ ngón tay/con trỏ đang chạm để
  // phân biệt kéo 1 ngón (pan) và chụm 2 ngón (pinch-zoom).
  const pointersRef = useRef(new Map());
  const gestureRef = useRef(null); // { mode: "pan" | "pinch", ...dữ liệu bắt đầu cử chỉ }

  const applyTransform = useCallback(() => {
    if (imgRef.current) {
      imgRef.current.style.transform = `translate(${txRef.current}px, ${tyRef.current}px) scale(${scaleRef.current})`;
    }
  }, []);

  const getContainerRect = () => containerRef.current?.getBoundingClientRect();

  const clampPan = useCallback(() => {
    const rect = getContainerRect();
    if (!rect) return;
    const s = scaleRef.current;
    const maxTx = Math.max(0, ((s - 1) * rect.width) / 2);
    const maxTy = Math.max(0, ((s - 1) * rect.height) / 2);
    txRef.current = clamp(txRef.current, -maxTx, maxTx);
    tyRef.current = clamp(tyRef.current, -maxTy, maxTy);
  }, []);

  const zoomAtPoint = useCallback((screenX, screenY, nextScale) => {
    const rect = getContainerRect();
    if (!rect) return;
    const px = screenX - (rect.left + rect.width / 2);
    const py = screenY - (rect.top + rect.height / 2);
    const s = scaleRef.current;
    // Điểm nội dung hiện đang nằm dưới (px, py) - giữ nguyên điểm này dưới
    // đúng vị trí đó sau khi đổi scale.
    const contentX = (px - txRef.current) / s;
    const contentY = (py - tyRef.current) / s;
    const clamped = clamp(nextScale, MIN_SCALE, MAX_SCALE);
    txRef.current = px - clamped * contentX;
    tyRef.current = py - clamped * contentY;
    scaleRef.current = clamped;
    clampPan();
    applyTransform();
  }, [applyTransform, clampPan]);

  const resetView = useCallback(() => {
    scaleRef.current = 1;
    txRef.current = 0;
    tyRef.current = 0;
    applyTransform();
  }, [applyTransform]);

  const handlePointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 1) {
      gestureRef.current = {
        mode: "pan",
        startX: e.clientX,
        startY: e.clientY,
        startTx: txRef.current,
        startTy: tyRef.current,
      };
    } else if (pointersRef.current.size === 2) {
      const [a, b] = Array.from(pointersRef.current.values());
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      const rect = getContainerRect();
      const px = midX - (rect.left + rect.width / 2);
      const py = midY - (rect.top + rect.height / 2);
      gestureRef.current = {
        mode: "pinch",
        startDist: dist || 1,
        startScale: scaleRef.current,
        // Điểm nội dung tại tâm 2 ngón lúc BẮT ĐẦU chụm - giữ cố định điểm
        // này trong suốt cử chỉ, kể cả khi 2 ngón vừa chụm vừa lê tay.
        contentX: (px - txRef.current) / scaleRef.current,
        contentY: (py - tyRef.current) / scaleRef.current,
      };
    }
  };

  const handlePointerMove = (e) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const gesture = gestureRef.current;
    if (!gesture) return;

    if (gesture.mode === "pan" && pointersRef.current.size === 1) {
      txRef.current = gesture.startTx + (e.clientX - gesture.startX);
      tyRef.current = gesture.startTy + (e.clientY - gesture.startY);
      clampPan();
      applyTransform();
    } else if (gesture.mode === "pinch" && pointersRef.current.size === 2) {
      const [a, b] = Array.from(pointersRef.current.values());
      const dist = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      const rect = getContainerRect();
      const px = midX - (rect.left + rect.width / 2);
      const py = midY - (rect.top + rect.height / 2);
      const nextScale = clamp(gesture.startScale * (dist / gesture.startDist), MIN_SCALE, MAX_SCALE);
      txRef.current = px - nextScale * gesture.contentX;
      tyRef.current = py - nextScale * gesture.contentY;
      scaleRef.current = nextScale;
      clampPan();
      applyTransform();
    }
  };

  const endPointer = (e) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size === 1) {
      // Còn lại đúng 1 ngón sau khi bỏ bớt (vd vừa nhả 1 trong 2 ngón đang
      // chụm) - bắt đầu lại 1 cử chỉ "pan" mới từ vị trí hiện tại, tránh
      // ảnh bị giật do lấy nhầm mốc cũ của cử chỉ chụm trước đó.
      const [remaining] = Array.from(pointersRef.current.values());
      gestureRef.current = {
        mode: "pan",
        startX: remaining.x,
        startY: remaining.y,
        startTx: txRef.current,
        startTy: tyRef.current,
      };
    } else if (pointersRef.current.size === 0) {
      gestureRef.current = null;
    }
  };

  // KHÔNG dùng prop onWheel của React ở JSX bên dưới - React 18 gắn listener
  // "wheel" ở gốc dưới dạng passive để tối ưu hiệu năng cuộn trang, khiến
  // e.preventDefault() bên trong bị trình duyệt ÂM THẦM bỏ qua (chỉ in cảnh
  // báo ở console, không báo lỗi) - lăn chuột để phóng to ảnh vẫn chạy, NHƯNG
  // trang phía sau modal cũng bị cuộn theo cùng lúc. Phải tự gắn listener gốc
  // với { passive: false } qua useEffect thì preventDefault() mới có tác dụng.
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2;
    zoomAtPoint(e.clientX, e.clientY, scaleRef.current * factor);
  }, [zoomAtPoint]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  const handleDoubleClick = (e) => {
    const rect = getContainerRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    if (scaleRef.current > 1) {
      resetView();
    } else {
      zoomAtPoint(e.clientX ?? centerX, e.clientY ?? centerY, 2.2);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden touch-none select-none bg-gray-100 ${className}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onDoubleClick={handleDoubleClick}
    >
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        draggable={false}
        className="w-full h-full object-contain pointer-events-none will-change-transform"
        style={{ transformOrigin: "center center" }}
      />

      {/* Nút zoom rõ ràng cho khách chưa quen kéo/chụm ngón tay - chặn
          pointerdown nổi bọt lên container ở trên (onPointerDown của toàn
          khung ảnh), nếu không mỗi lần bấm nút sẽ bị hiểu nhầm thành bắt đầu
          1 cử chỉ "kéo" (pan) 1 ngón, khiến nút bấm không phản hồi. */}
      <div
        className="absolute bottom-2 right-2 flex flex-col gap-1"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => zoomAtPoint(getContainerRect().left + getContainerRect().width / 2, getContainerRect().top + getContainerRect().height / 2, scaleRef.current * 1.4)}
          className="w-7 h-7 rounded-full bg-black/50 backdrop-blur text-white flex items-center justify-center hover:bg-black/70 transition-colors"
          aria-label="Phóng to"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => zoomAtPoint(getContainerRect().left + getContainerRect().width / 2, getContainerRect().top + getContainerRect().height / 2, scaleRef.current / 1.4)}
          className="w-7 h-7 rounded-full bg-black/50 backdrop-blur text-white flex items-center justify-center hover:bg-black/70 transition-colors"
          aria-label="Thu nhỏ"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={resetView}
          className="w-7 h-7 rounded-full bg-black/50 backdrop-blur text-white flex items-center justify-center hover:bg-black/70 transition-colors"
          aria-label="Về vị trí ban đầu"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <span className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded bg-black/50 backdrop-blur text-white text-[7.5px] font-medium pointer-events-none">
        Kéo để di chuyển · Chụm/lăn chuột để phóng to
      </span>
    </div>
  );
}
