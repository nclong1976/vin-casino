import React, { useEffect, useMemo, useState } from "react";
import { NOTO_SERIF, PT_PER_MM, placeSignatureImage, qrRects } from "@/shared/docLayout";

const FONT_FAMILY = "'Noto Serif Doc', 'Noto Serif', serif";

/**
 * Vẽ kết quả của bộ dàn trang (layoutDocument - src/shared/docLayout) thành
 * các trang A4 bằng SVG, đơn vị mm (viewBox 210×297). Mọi toạ độ lấy nguyên
 * từ layout nên bản xem trên web khớp bản PDF do Edge Function vẽ từ cùng
 * layout đó:
 * - Chữ đặt theo baseline (<text y>) và ép đúng độ rộng đã đo bằng
 *   textLength, nên dù trình duyệt có kerning khác đôi chút, vị trí từng
 *   dòng vẫn trùng.
 * - Ảnh chữ ký đặt theo placeSignatureImage (spec 7.4), dùng chung với PDF.
 *
 * Props:
 * - layout: LayoutResult.
 * - signatureImages: { [slotId]: { src, width?, height? } } - ảnh chữ ký
 *   người dùng (width/height px; thiếu thì tự đo khi ảnh tải xong).
 * - interactiveSlots: slotId được phép chạm để ký (hiện khung nét đứt).
 * - onSlotClick(slotId).
 * - renderPageOverlay(page): phần tử phủ lên từng trang (định vị tuyệt đối).
 */
export default function LetterheadRenderer({ layout, signatureImages = {}, interactiveSlots = [], onSlotClick, renderPageOverlay, className = "" }) {
  if (!layout?.pages?.length) return null;
  return (
    <div className={`space-y-3 ${className}`}>
      {layout.pages.map((page) => (
        <div key={page.index} className="relative rounded-lg bg-white shadow-sm ring-1 ring-gray-200 overflow-hidden">
          <svg
            viewBox={`0 0 ${page.width} ${page.height}`}
            className="block w-full h-auto"
            role="img"
            aria-label={`Trang ${page.index + 1}/${layout.pages.length}`}
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect x="0" y="0" width={page.width} height={page.height} fill="#ffffff" />
            {page.items.map((item, i) => (
              <LayoutItem
                key={i}
                item={item}
                signatureImages={signatureImages}
                interactive={item.kind === "slot" && interactiveSlots.includes(item.slotId)}
                onSlotClick={onSlotClick}
              />
            ))}
          </svg>
          {/* Lớp phủ tuỳ chọn (vd kéo/đổi kích thước khung ký trong trình soạn
              mẫu) - toạ độ theo % của trang nên tự co giãn theo khung. */}
          {renderPageOverlay?.(page)}
        </div>
      ))}
    </div>
  );
}

function LayoutItem({ item, signatureImages, interactive, onSlotClick }) {
  switch (item.kind) {
    case "text":
      return <TextItem item={item} />;
    case "image":
      return (
        <image
          href={item.src}
          x={item.x}
          y={item.y}
          width={item.w}
          height={item.h}
          preserveAspectRatio={item.role === "issuer_signature" ? "xMidYMax meet" : "xMidYMid meet"}
        />
      );
    case "line":
      return <line x1={item.x1} y1={item.y1} x2={item.x2} y2={item.y2} stroke={item.color} strokeWidth={item.thickness} />;
    case "slot":
      return <SlotItem item={item} signature={signatureImages[item.slotId]} interactive={interactive} onSlotClick={onSlotClick} />;
    case "qr":
      return <QrItem item={item} />;
    default:
      return null;
  }
}

function TextItem({ item }) {
  const metrics = NOTO_SERIF.styles[item.font];
  const fontSize = item.sizePt / PT_PER_MM;
  const bold = item.font === "bold" || item.font === "boldItalic";
  const italic = item.font === "italic" || item.font === "boldItalic";
  const underlineOffset = (-metrics.underlinePosition / metrics.unitsPerEm) * fontSize;
  const underlineThickness = Math.max((metrics.underlineThickness / metrics.unitsPerEm) * fontSize, 0.15);
  const multiChar = [...item.text].length > 1;

  return (
    <g>
      {item.placeholder && <rect x={item.x - 0.4} y={item.y - fontSize * 0.85} width={item.width + 0.8} height={fontSize * 1.1} rx="0.6" fill="#fee2e2" />}
      <text
        x={item.x}
        y={item.y}
        fontFamily={FONT_FAMILY}
        fontSize={fontSize}
        fontWeight={bold ? 700 : 400}
        fontStyle={italic ? "italic" : "normal"}
        fill={item.color}
        textLength={multiChar ? item.width : undefined}
        lengthAdjust="spacingAndGlyphs"
        style={{ fontKerning: "none", fontVariantLigatures: "none", whiteSpace: "pre" }}
      >
        {item.text}
      </text>
      {item.underline && (
        <line x1={item.x} x2={item.x + item.width} y1={item.y + underlineOffset} y2={item.y + underlineOffset} stroke={item.color} strokeWidth={underlineThickness} />
      )}
    </g>
  );
}

/** Kích thước tự nhiên (px) của ảnh - dùng khi caller không truyền sẵn. */
function useImageSize(src, known) {
  const [size, setSize] = useState(known);
  useEffect(() => {
    if (known?.width && known?.height) {
      setSize(known);
      return undefined;
    }
    if (!src) {
      setSize(null);
      return undefined;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setSize({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src, known?.width, known?.height]);
  return size;
}

function SlotItem({ item, signature, interactive, onSlotClick }) {
  const known = useMemo(
    () => (signature?.width && signature?.height ? { width: signature.width, height: signature.height } : null),
    [signature?.width, signature?.height],
  );
  const size = useImageSize(signature?.src, known);
  const placed = signature?.src && size ? placeSignatureImage(item.imageArea, size.width, size.height) : null;
  const waiting = interactive && !signature?.src;

  const activate = () => onSlotClick?.(item.slotId);
  const interactiveProps = interactive
    ? {
        role: "button",
        tabIndex: 0,
        "aria-label": "Ký tên tại đây",
        style: { cursor: "pointer", outline: "none" },
        onClick: activate,
        onKeyDown: (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            activate();
          }
        },
      }
    : {};

  return (
    <g {...interactiveProps}>
      <rect
        x={item.x}
        y={item.y}
        width={item.w}
        height={item.h}
        rx="1.2"
        fill={waiting ? "rgba(148,129,84,0.06)" : "transparent"}
        stroke={waiting ? "#948154" : "none"}
        strokeWidth="0.35"
        strokeDasharray="1.6 1.2"
        className={waiting ? "animate-pulse" : undefined}
      />
      {waiting && (
        <text
          x={item.x + item.w / 2}
          y={item.y + item.h / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fontFamily="'Be Vietnam Pro', system-ui, sans-serif"
          fontSize="3.2"
          fontWeight="600"
          fill="#948154"
        >
          ✍ Chạm để ký
        </text>
      )}
      {placed && placed.w > 0 && (
        <image href={signature.src} x={placed.x} y={placed.y} width={placed.w} height={placed.h} preserveAspectRatio="none" />
      )}
    </g>
  );
}

function QrItem({ item }) {
  const qr = useMemo(() => qrRects(item.value), [item.value]);
  const cell = item.size / qr.moduleCount;
  return (
    <g aria-label="Mã QR kiểm tra văn bản">
      {qr.rects.map((r, i) => (
        <rect key={i} x={item.x + r.x * cell} y={item.y + r.y * cell} width={r.w * cell + 0.01} height={cell + 0.01} fill="#000000" />
      ))}
    </g>
  );
}
