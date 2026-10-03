import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Viewer } from "@photo-sphere-viewer/core";
import { MarkersPlugin } from "@photo-sphere-viewer/markers-plugin";
import "@photo-sphere-viewer/core/index.css";
import "@photo-sphere-viewer/markers-plugin/index.css";
import "./pano.css";
import { AMENITY_ICONS, radToDeg } from "@/lib/vinhomesMap";

const escapeHtml = (s) => String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function markerHtml(h) {
  const label = escapeHtml(h.label);
  if (h.kind === "zone") {
    return `<div style="display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;background:rgba(148,129,84,.92);color:#fff;font:700 12px system-ui;box-shadow:0 2px 10px rgba(0,0,0,.35);border:2px solid #fff;white-space:nowrap;cursor:pointer">◉ ${label}</div>`;
  }
  if (h.kind === "link") {
    return `<div style="display:flex;align-items:center;gap:4px;padding:5px 10px;border-radius:999px;background:rgba(17,24,39,.75);color:#fff;font:600 11px system-ui;border:1px solid rgba(255,255,255,.6);white-space:nowrap;cursor:pointer">➜ ${label}</div>`;
  }
  const icon = AMENITY_ICONS[h.icon] || AMENITY_ICONS.pin;
  return `<div title="${label}" style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.92);display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 2px 8px rgba(0,0,0,.35);cursor:pointer">${icon}</div>`;
}

const toMarkers = (hotspots) =>
  (hotspots || []).map((h) => ({
    id: h.id,
    position: { yaw: Number(h.yaw), pitch: Number(h.pitch) },
    html: markerHtml(h),
    anchor: "center center",
    tooltip: h.kind === "amenity" ? { content: escapeHtml(h.label), position: "top center" } : undefined,
    data: h,
  }));

/**
 * Khung ảnh 360° (Photo Sphere Viewer trên three.js). Hiện ảnh xem trước
 * nhẹ trước rồi thay bằng ảnh đầy đủ. Đêm "mô phỏng" = làm tối ảnh ngày khi
 * dự án chưa có ảnh chụp đêm thật.
 *
 * ref: zoomIn(), zoomOut(), setAutorotate(bool), resetNorth().
 * onHeading(độ so với hướng Bắc) để vẽ la bàn; onPick({yaw, pitch}) cho Admin đặt điểm.
 */
const PanoViewer = forwardRef(function PanoViewer({ pano, hotspots, simulatedNight, onHotspot, onPick, onHeading, onError, className = "" }, ref) {
  const box = useRef(null);
  const viewer = useRef(null);
  const markers = useRef(null);
  const spin = useRef(null);
  const handlers = useRef({});
  const [loading, setLoading] = useState(true);
  handlers.current = { onHotspot, onPick, onHeading, onError, north: Number(pano?.north_offset_deg) || 0, hotspots };

  useEffect(() => {
    if (!box.current) return undefined;
    const v = new Viewer({
      container: box.current,
      navbar: false,
      loadingTxt: "",
      defaultZoomLvl: 20,
      mousewheelCtrlKey: false,
      touchmoveTwoFingers: false,
      plugins: [[MarkersPlugin, { markers: [] }]],
    });
    viewer.current = v;
    markers.current = v.getPlugin(MarkersPlugin);
    markers.current.addEventListener("select-marker", ({ marker }) => handlers.current.onHotspot?.(marker.data));
    v.addEventListener("click", ({ data }) => {
      if (!data.rightclick && Number.isFinite(data.yaw)) handlers.current.onPick?.({ yaw: data.yaw, pitch: data.pitch });
    });
    v.addEventListener("position-updated", ({ position }) => handlers.current.onHeading?.(radToDeg(position.yaw) - handlers.current.north));
    v.addEventListener("panorama-error", () => handlers.current.onError?.());
    // Điểm chỉ gắn được khi đã có ảnh - gắn lại mỗi lần ảnh tải xong.
    v.addEventListener("panorama-loaded", () => markers.current?.setMarkers(toMarkers(handlers.current.hotspots)));
    return () => {
      clearInterval(spin.current);
      v.destroy();
      viewer.current = null;
    };
  }, []);

  // Đổi ảnh: ảnh xem trước (nếu có) rồi ảnh đầy đủ.
  useEffect(() => {
    const v = viewer.current;
    if (!v || !pano) return;
    let alive = true;
    setLoading(true);
    const full = () => v.setPanorama(pano.image_url, { transition: 400, showLoader: false });
    const first = pano.preview_url ? v.setPanorama(pano.preview_url, { transition: 300, showLoader: false }) : Promise.resolve();
    first
      .then(() => alive && full())
      .catch(() => alive && handlers.current.onError?.())
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [pano?.id]);

  useEffect(() => {
    const v = viewer.current;
    if (v?.state?.ready) markers.current?.setMarkers(toMarkers(hotspots));
  }, [hotspots, pano?.id]);

  useImperativeHandle(ref, () => ({
    zoomIn: () => viewer.current?.zoomIn(10),
    zoomOut: () => viewer.current?.zoomOut(10),
    setAutorotate(on) {
      clearInterval(spin.current);
      if (!on || !viewer.current) return;
      spin.current = setInterval(() => {
        const v = viewer.current;
        if (!v) return;
        const p = v.getPosition();
        v.rotate({ yaw: p.yaw + 0.004, pitch: p.pitch });
      }, 33);
    },
    resetNorth() {
      const v = viewer.current;
      if (v) v.animate({ yaw: `${handlers.current.north}deg`, pitch: v.getPosition().pitch, speed: "4rpm" });
    },
  }));

  return (
    <div className={`vh-pano ${simulatedNight ? "vh-pano--night" : ""} isolate overflow-hidden ${/\b(absolute|fixed|relative)\b/.test(className) ? "" : "relative"} ${className}`}>
      <div ref={box} className="absolute inset-0" />
      {loading && <div className="absolute top-0 left-0 right-0 h-0.5 bg-[#d4af37] animate-pulse pointer-events-none" />}
    </div>
  );
});

export default PanoViewer;
