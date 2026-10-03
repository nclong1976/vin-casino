import React, { useMemo, useRef, useState } from "react";
import { normalizePlanMarkers, zoneColor, AMENITY_ICONS } from "@/lib/vinhomesMap";

/** Đường cong mềm quanh tâm (cx, cy) - hình "lô đất" / mặt hồ cho sa bàn minh hoạ. */
function blobPath(cx, cy, r, seed = 1, wobble = 0.16, n = 9) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + wobble * Math.sin(seed * 3.1 + i * 2.3);
    pts.push([cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * k * 0.82]);
  }
  const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  let d = `M ${mid(pts[n - 1], pts[0]).join(" ")}`;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const m = mid(p, pts[(i + 1) % n]);
    d += ` Q ${p[0]} ${p[1]} ${m[0]} ${m[1]}`;
  }
  return `${d} Z`;
}

/** Ô nhà nhỏ xếp lưới bên trong phân khu cho cảm giác sa bàn. */
function Houses({ cx, cy, r, color }) {
  const cells = [];
  const step = Math.max(2.2, r / 4);
  for (let x = cx - r * 0.7; x <= cx + r * 0.7; x += step) {
    for (let y = cy - r * 0.55; y <= cy + r * 0.55; y += step) {
      const dx = (x - cx) / (r * 0.75);
      const dy = (y - cy) / (r * 0.6);
      if (dx * dx + dy * dy <= 1) cells.push([x, y]);
    }
  }
  return cells.map(([x, y], i) => (
    <g key={i}>
      <rect x={x - step * 0.32 + 0.25} y={y - step * 0.32 + 0.35} width={step * 0.64} height={step * 0.64} rx="0.3" fill="rgba(0,0,0,.18)" />
      <rect x={x - step * 0.32} y={y - step * 0.32} width={step * 0.64} height={step * 0.64} rx="0.3" fill="#fffaf0" stroke={color} strokeWidth="0.25" />
    </g>
  ));
}

/**
 * Sa bàn dự án. Có ảnh mặt bằng thật (image_url) thì vẽ ảnh + điểm; không có
 * thì vẽ sơ đồ minh hoạ từ các điểm (phân khu, hồ, công viên, tiện ích,
 * đường). Toạ độ điểm theo % (0–100).
 *
 * Người dùng: chạm phân khu → onZone(marker); chạm tiện ích → onAmenity(marker).
 * Admin: onPick({x, y}) khi bấm vào chỗ trống, editing = điểm đang sửa.
 */
export default function MasterplanStage({ plan, zones, selectedId, tilt = false, zoom = 1, onZone, onAmenity, onPick, className = "" }) {
  const svg = useRef(null);
  const drag = useRef(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const markers = useMemo(() => normalizePlanMarkers(plan?.markers), [plan]);
  const byKind = (k) => markers.filter((m) => m.kind === k);
  const image = plan?.image_url;

  const toPct = (e) => {
    const s = svg.current;
    if (!s) return null;
    const pt = s.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(s.getScreenCTM().inverse());
    return { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 };
  };

  const onPointerDown = (e) => {
    if (onPick) return;
    drag.current = { x: e.clientX, y: e.clientY, pan, moved: false };
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d || zoom <= 1) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    setPan({ x: d.pan.x + dx, y: d.pan.y + dy });
  };
  const endDrag = () => {
    setTimeout(() => (drag.current = null), 0);
  };
  const tap = (fn, m) => (e) => {
    e.stopPropagation();
    if (drag.current?.moved) return;
    fn?.(m);
  };

  const transform = `translate(${zoom > 1 ? pan.x : 0}px, ${zoom > 1 ? pan.y : 0}px) scale(${zoom})${tilt ? " perspective(1200px) rotateX(42deg)" : ""}`;

  return (
    <div
      className={`overflow-hidden touch-none select-none ${/\b(absolute|fixed|relative)\b/.test(className) ? "" : "relative"} ${className}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
    >
      <div className="absolute inset-0 flex items-center justify-center transition-transform duration-500" style={{ transform, transformOrigin: "50% 55%" }}>
        <svg
          ref={svg}
          viewBox="0 0 100 100"
          preserveAspectRatio="xMidYMid meet"
          className="w-full h-full max-w-[720px] max-h-full"
          onClick={(e) => {
            if (!onPick) return;
            const p = toPct(e);
            if (p) onPick(p);
          }}
          role="img"
          aria-label="Sa bàn dự án"
        >
          <defs>
            <pattern id="plan-grass" width="2" height="2" patternUnits="userSpaceOnUse">
              <rect width="2" height="2" fill="#7fb069" />
              <circle cx="0.6" cy="0.6" r="0.35" fill="#6a9e57" />
              <circle cx="1.5" cy="1.4" r="0.3" fill="#8cc075" />
            </pattern>
            <linearGradient id="plan-water" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#7cc0e8" />
              <stop offset="1" stopColor="#3f88c5" />
            </linearGradient>
            <filter id="plan-shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0.4" dy="0.8" stdDeviation="0.6" floodOpacity="0.35" />
            </filter>
          </defs>

          {image ? (
            <image href={image} x="0" y="0" width="100" height="100" preserveAspectRatio="xMidYMid meet" />
          ) : (
            <>
              {/* Nền đất + lưới đường nội khu */}
              <rect x="1.5" y="1.5" width="97" height="97" rx="4" fill="#efe8d6" stroke="#d4af37" strokeWidth="0.5" strokeDasharray="1.5 1" filter="url(#plan-shadow)" />
              {[14, 38, 62, 86].map((v) => (
                <g key={v} stroke="#fdfaf2" strokeWidth="1.2" strokeLinecap="round">
                  <line x1="4" y1={v} x2="96" y2={v} />
                  <line x1={v} y1="4" x2={v} y2="96" />
                </g>
              ))}
              {byKind("park").map((m, i) => (
                <g key={m.id || `p${i}`} onClick={tap(onAmenity, m)} className={onAmenity ? "cursor-pointer" : ""}>
                  <path d={blobPath(m.x, m.y, m.r, i + 3, 0.22)} fill="url(#plan-grass)" stroke="#5c8f49" strokeWidth="0.3" />
                  {[0, 1, 2, 3].map((t) => (
                    <circle key={t} cx={m.x + Math.cos(t * 1.7 + i) * m.r * 0.45} cy={m.y + Math.sin(t * 1.7 + i) * m.r * 0.35} r={m.r * 0.13} fill="#3e7a3a" opacity="0.8" />
                  ))}
                </g>
              ))}
              {byKind("lake").map((m, i) => (
                <g key={m.id || `l${i}`}>
                  <path d={blobPath(m.x, m.y, m.r + 2.4, i + 7, 0.18)} fill="url(#plan-grass)" />
                  <path d={blobPath(m.x, m.y, m.r, i + 7, 0.18)} fill="url(#plan-water)" stroke="#e8f4fb" strokeWidth="0.5" />
                  <path d={blobPath(m.x - m.r * 0.2, m.y - m.r * 0.15, m.r * 0.35, i + 9, 0.3)} fill="#bfe3f7" opacity="0.45" />
                </g>
              ))}
            </>
          )}

          {/* Phân khu */}
          {byKind("zone").map((m, i) => {
            const color = zoneColor(m.zone_id, zones);
            const active = selectedId && (selectedId === m.id || selectedId === m.zone_id);
            return (
              <g key={m.id || `z${i}`} onClick={tap(onZone, m)} className={onZone ? "cursor-pointer" : ""} filter="url(#plan-shadow)">
                {!image && (
                  <>
                    <path d={blobPath(m.x, m.y, m.r, i + 1, 0.12)} fill={color} fillOpacity="0.55" stroke={active ? "#b8860b" : "#fff"} strokeWidth={active ? 1.1 : 0.5} />
                    <Houses cx={m.x} cy={m.y} r={m.r} color={color} />
                  </>
                )}
                {image && <circle cx={m.x} cy={m.y} r="2.2" fill={color} stroke="#fff" strokeWidth="0.6" />}
                <g transform={`translate(${m.x} ${m.y + (image ? -4.5 : 0)})`}>
                  <rect x={-(m.label.length * 1.32 + 2.6) / 2} y="-2.4" width={m.label.length * 1.32 + 2.6} height="4.8" rx="2.4" fill={active ? "#b8860b" : "rgba(17,24,39,.85)"} />
                  <text textAnchor="middle" y="1.1" fontSize="2.4" fontWeight="700" fill="#fff" style={{ fontFamily: "system-ui, sans-serif" }}>
                    {m.label}
                  </text>
                </g>
              </g>
            );
          })}

          {/* Tiện ích */}
          {byKind("amenity").map((m, i) => (
            <g key={m.id || `a${i}`} onClick={tap(onAmenity, m)} className={onAmenity ? "cursor-pointer" : ""} filter="url(#plan-shadow)">
              <circle cx={m.x} cy={m.y} r="2.6" fill="#fff" stroke={selectedId === m.id ? "#b8860b" : "#d4af37"} strokeWidth="0.45" />
              <text x={m.x} y={m.y + 1.05} textAnchor="middle" fontSize="2.8">
                {AMENITY_ICONS[m.icon] || AMENITY_ICONS.pin}
              </text>
              <text x={m.x} y={m.y + 5.2} textAnchor="middle" fontSize="1.9" fontWeight="700" fill="#1f2937" stroke="#fff" strokeWidth="0.5" paintOrder="stroke" style={{ fontFamily: "system-ui, sans-serif" }}>
                {m.label}
              </text>
            </g>
          ))}

          {/* Nhãn hồ / công viên */}
          {[...byKind("lake"), ...byKind("park")].map((m, i) => (
            <text key={`t${i}`} x={m.x} y={m.y + (m.kind === "lake" ? 0.8 : m.r * 0.95 + 1.6)} textAnchor="middle" fontSize={m.kind === "lake" ? 2.2 : 1.9} fontWeight="700" fill={m.kind === "lake" ? "#fff" : "#2f5d2a"} stroke={m.kind === "lake" ? "none" : "#fff"} strokeWidth="0.45" paintOrder="stroke" style={{ fontFamily: "system-ui, sans-serif", pointerEvents: "none" }}>
              {m.label}
            </text>
          ))}

          {/* Hướng kết nối ở mép sa bàn */}
          {byKind("road").map((m, i) => {
            const horizontal = m.y < 10 || m.y > 90;
            return (
              <g key={m.id || `r${i}`} style={{ pointerEvents: "none" }}>
                <text x={m.x} y={m.y} textAnchor={horizontal ? "middle" : m.x > 50 ? "end" : "start"} fontSize="2" fontWeight="700" fill="#7c5e10" stroke="#fff" strokeWidth="0.5" paintOrder="stroke" style={{ fontFamily: "system-ui, sans-serif" }}>
                  {m.y < 10 ? "▲ " : m.y > 90 ? "▼ " : m.x > 50 ? "" : "◀ "}
                  {m.label}
                  {!horizontal && m.x > 50 ? " ▶" : ""}
                </text>
              </g>
            );
          })}

          {/* Chỉ hướng Bắc */}
          {!image && (
            <g transform="translate(93 9)" style={{ pointerEvents: "none" }}>
              <circle r="3" fill="#fff" stroke="#d4af37" strokeWidth="0.4" />
              <path d="M0 -2.2 L1 0.6 L0 0 L-1 0.6 Z" fill="#b91c1c" />
              <text y="2.4" textAnchor="middle" fontSize="1.6" fontWeight="700" fill="#374151">
                B
              </text>
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}
