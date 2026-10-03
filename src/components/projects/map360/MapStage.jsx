import React, { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MAP_STYLE_URL, VIETNAM_VIEW, hasGeo } from "@/lib/vinhomesMap";

const reduceMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function pinElement(p, onClick) {
  const el = document.createElement("button");
  el.type = "button";
  el.setAttribute("aria-label", p.title);
  el.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:2px;background:none;border:0;cursor:pointer;padding:0";
  const dot = document.createElement("span");
  dot.style.cssText = `width:40px;height:40px;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,.4);background:#948154 center/cover no-repeat;${
    p.image ? `background-image:url("${encodeURI(p.image)}")` : ""
  }`;
  const label = document.createElement("span");
  label.textContent = (p.title || "").replace(/^vinhomes\s*/i, "");
  label.style.cssText = "padding:2px 8px;border-radius:999px;background:rgba(17,24,39,.85);color:#fff;font:700 10.5px system-ui;white-space:nowrap;max-width:140px;overflow:hidden;text-overflow:ellipsis";
  el.append(dot, label);
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick(p);
  });
  return { el, dot };
}

/**
 * Bản đồ 3D (MapLibre GL, nền OpenFreeMap) với ghim từng dự án. Chọn dự án
 * thì camera bay tới, nghiêng 60° để thấy khối nhà 3D. Không tải được bản đồ
 * (mất mạng / máy không hỗ trợ) thì báo onError để màn chính đổi sang danh sách.
 */
export default function MapStage({ projects, selectedId, onSelect, onError, className = "" }) {
  const box = useRef(null);
  const map = useRef(null);
  const pins = useRef({});
  const [ready, setReady] = useState(false);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  useEffect(() => {
    let m;
    try {
      m = new maplibregl.Map({
        container: box.current,
        style: MAP_STYLE_URL,
        center: VIETNAM_VIEW.center,
        zoom: VIETNAM_VIEW.zoom,
        pitch: 0,
        attributionControl: { compact: true },
        cooperativeGestures: false,
      });
    } catch {
      onError?.();
      return undefined;
    }
    map.current = m;
    m.on("load", () => {
      setReady(true);
      m.resize();
    });
    const ro = new ResizeObserver(() => m.resize());
    ro.observe(box.current);
    m.on("error", (e) => {
      if (!m.loaded() && e?.error) onError?.();
    });
    return () => {
      ro.disconnect();
      m.remove();
      map.current = null;
      pins.current = {};
    };
  }, []);

  // Ghim dự án (chỉ dự án đã có toạ độ).
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    Object.values(pins.current).forEach(({ marker }) => marker.remove());
    pins.current = {};
    projects.filter((p) => hasGeo(p.geo)).forEach((p) => {
      const { el, dot } = pinElement(p, (x) => selectRef.current?.(x));
      const marker = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([Number(p.geo.lng), Number(p.geo.lat)]).addTo(m);
      pins.current[p.id] = { marker, dot };
    });
  }, [projects]);

  // Bay tới dự án đang chọn.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    Object.entries(pins.current).forEach(([id, { dot }]) => {
      dot.style.outline = id === selectedId ? "3px solid #d4af37" : "none";
      dot.style.transform = id === selectedId ? "scale(1.15)" : "none";
    });
    const p = projects.find((x) => x.id === selectedId);
    if (!p || !hasGeo(p.geo)) return;
    const target = { center: [Number(p.geo.lng), Number(p.geo.lat)], zoom: Number(p.geo.zoom) || 15, pitch: 60, bearing: -20 };
    if (reduceMotion()) m.jumpTo(target);
    else m.flyTo({ ...target, duration: 1600, essential: true });
  }, [selectedId, projects, ready]);

  return (
    <div className={`${/\b(absolute|fixed|relative)\b/.test(className) ? "" : "relative"} ${className}`}>
      {/* MapLibre tự gán position: relative cho khung - dùng w/h-full thay vì absolute. */}
      <div className="absolute inset-0">
        <div ref={box} className="w-full h-full" />
      </div>
      {!ready && <div className="absolute inset-0 flex items-center justify-center text-[11px] text-white/70 pointer-events-none">Đang tải bản đồ...</div>}
    </div>
  );
}
