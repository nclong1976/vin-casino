import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, X, RotateCw, Plus, Minus, Plane, Footprints, Sun, Moon, Calculator, MapPin, Map as MapIcon, Compass } from "lucide-react";
import MapStage from "./MapStage";
import PanoViewer from "./PanoViewer";
import { loadMapOverview, loadProject360, choosePanorama, availableModes, hasGeo, MODE_LABELS, AMENITY_ICONS } from "@/lib/vinhomesMap";
import { fmtVnd } from "@/lib/vinhomesValuation";

const GUIDE_KEY = "vinclub.map360GuideSeen";
const reduceMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function ToolButton({ label, active, onClick, children, disabled }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`w-10 h-10 rounded-xl flex items-center justify-center backdrop-blur border cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed ${
        active ? "bg-[#d4af37] text-black border-[#d4af37]" : "bg-black/45 text-white border-white/15"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Bản đồ mô phỏng dự án 360° (mở từ nút "Định giá thử" ở mục Vinhomes).
 * Bản đồ 3D có ghim 5 dự án → bay tới dự án → ảnh 360° Flycam / Mặt đất,
 * Ngày / Đêm, điểm tương tác phân khu / tiện ích → nút "Định giá" mở
 * ValuationModal (onValuate(project, zoneId)).
 */
export default function ProjectMap360({ initialProjectId, onClose, onValuate }) {
  const [projects, setProjects] = useState([]);
  const [selectedId, setSelectedId] = useState(initialProjectId);
  const [stage, setStage] = useState("map");
  const [data, setData] = useState(null);
  const [mode, setMode] = useState("flycam");
  const [time, setTime] = useState("day");
  const [panoId, setPanoId] = useState(null);
  const [autorotate, setAutorotate] = useState(false);
  const [heading, setHeading] = useState(0);
  const [amenity, setAmenity] = useState(null);
  const [drawer, setDrawer] = useState("peek");
  const [mapFailed, setMapFailed] = useState(false);
  const [panoFailed, setPanoFailed] = useState(false);
  const [showGuide, setShowGuide] = useState(() => {
    try {
      return !localStorage.getItem(GUIDE_KEY);
    } catch {
      return false;
    }
  });
  const viewer = useRef(null);

  useEffect(() => {
    loadMapOverview()
      .then(setProjects)
      .catch(() => setMapFailed(true));
  }, []);

  const project = projects.find((p) => p.id === selectedId);

  // Đổi dự án: tải ảnh 360°; có ảnh thì sau khi bay tới (1,6 giây) tự vào chế độ 360°.
  useEffect(() => {
    if (!selectedId) return undefined;
    let alive = true;
    setData(null);
    setPanoId(null);
    setAmenity(null);
    setPanoFailed(false);
    setStage("map");
    let timer;
    loadProject360(selectedId)
      .then((d) => {
        if (!alive) return;
        setData(d);
        const modes = availableModes(d.panos);
        const m = modes.includes("flycam") ? "flycam" : modes[0] || "flycam";
        setMode(m);
        if (d.panos.length) timer = setTimeout(() => alive && setStage("pano"), reduceMotion() ? 0 : 1700);
      })
      .catch(() => alive && setData({ panos: [], hotspots: [], zones: [] }));
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [selectedId]);

  const chosen = useMemo(() => choosePanorama(data?.panos, { mode, time }), [data, mode, time]);
  const pano = (panoId && data?.panos.find((p) => p.id === panoId)) || chosen.pano;
  const simulatedNight = panoId ? time === "night" && pano?.time_of_day !== "night" : chosen.simulatedNight;
  const hotspots = useMemo(() => (data?.hotspots || []).filter((h) => h.pano_id === pano?.id), [data, pano?.id]);
  const modes = availableModes(data?.panos);

  useEffect(() => viewer.current?.setAutorotate(autorotate && stage === "pano"), [autorotate, stage, pano?.id]);

  const dismissGuide = () => {
    setShowGuide(false);
    try {
      localStorage.setItem(GUIDE_KEY, "1");
    } catch {
      /* trình duyệt chặn lưu - bỏ qua */
    }
  };

  const onHotspot = (h) => {
    setAutorotate(false);
    if (h.kind === "zone") onValuate(project, h.zone_id);
    else if (h.kind === "link") setPanoId(h.target_pano_id);
    else setAmenity(h);
  };

  const located = projects.filter((p) => hasGeo(p.geo));

  return (
    <div className="fixed inset-0 z-[90] bg-[#0d1117] text-white font-heading flex flex-col">
      {/* Thanh trên */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center gap-2 px-3 pt-[max(env(safe-area-inset-top),10px)] pb-2 bg-gradient-to-b from-black/70 to-transparent">
        <button
          onClick={stage === "pano" ? () => setStage("map") : onClose}
          aria-label={stage === "pano" ? "Về bản đồ" : "Đóng"}
          className="w-9 h-9 rounded-full bg-black/45 backdrop-blur flex items-center justify-center cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold truncate">{stage === "pano" && project ? project.title : "Bản đồ dự án 360°"}</p>
          <p className="text-[10px] text-white/70 truncate">
            {stage === "pano" && pano ? `${MODE_LABELS[pano.mode]}${pano.title ? ` · ${pano.title}` : ""}` : `${located.length} dự án trên bản đồ`}
          </p>
        </div>
        <button onClick={onClose} aria-label="Đóng" className="w-9 h-9 rounded-full bg-black/45 backdrop-blur flex items-center justify-center cursor-pointer">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Sân khấu: bản đồ / 360° */}
      <div className="relative flex-1">
        {!mapFailed ? (
          <MapStage
            projects={projects}
            selectedId={selectedId}
            onSelect={(p) => setSelectedId(p.id)}
            onError={() => setMapFailed(true)}
            className={`absolute inset-0 transition-opacity duration-500 ${stage === "pano" ? "opacity-0 pointer-events-none" : "opacity-100"}`}
          />
        ) : (
          stage === "map" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-8 text-center">
              <MapIcon className="w-8 h-8 text-white/40" />
              <p className="text-[12px] text-white/70">Không tải được bản đồ. Chọn dự án ở dải bên dưới để xem ảnh 360° và định giá.</p>
            </div>
          )
        )}

        {pano && stage === "pano" && !panoFailed && (
          <PanoViewer
            ref={viewer}
            pano={pano}
            hotspots={hotspots}
            simulatedNight={simulatedNight}
            onHotspot={onHotspot}
            onHeading={setHeading}
            onError={() => setPanoFailed(true)}
            className="absolute inset-0"
          />
        )}
        {stage === "pano" && panoFailed && (
          <div className="absolute inset-0 flex items-center justify-center px-8 text-center text-[12px] text-white/70">
            Không tải được ảnh 360°. Kiểm tra kết nối mạng rồi thử lại.
          </div>
        )}

        {/* Bộ công cụ 360° */}
        {stage === "pano" && pano && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-1.5">
            <ToolButton label="Tự xoay" active={autorotate} onClick={() => setAutorotate((v) => !v)}>
              <RotateCw className="w-4 h-4" />
            </ToolButton>
            <ToolButton label="Phóng to" onClick={() => viewer.current?.zoomIn()}>
              <Plus className="w-4 h-4" />
            </ToolButton>
            <ToolButton label="Thu nhỏ" onClick={() => viewer.current?.zoomOut()}>
              <Minus className="w-4 h-4" />
            </ToolButton>
            <ToolButton
              label={mode === "flycam" ? "Xem từ mặt đất" : "Xem từ trên cao (Flycam)"}
              disabled={modes.length < 2}
              onClick={() => {
                setPanoId(null);
                setMode((m) => (m === "flycam" ? "ground" : "flycam"));
              }}
            >
              {mode === "flycam" ? <Footprints className="w-4 h-4" /> : <Plane className="w-4 h-4" />}
            </ToolButton>
            <ToolButton label={time === "day" ? "Chế độ đêm" : "Chế độ ngày"} active={time === "night"} onClick={() => setTime((t) => (t === "day" ? "night" : "day"))}>
              {time === "day" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </ToolButton>
            <ToolButton label="Quay về hướng Bắc" onClick={() => viewer.current?.resetNorth()}>
              <Compass className="w-4 h-4 transition-transform" style={{ transform: `rotate(${-heading}deg)` }} />
            </ToolButton>
          </div>
        )}

        {stage === "pano" && simulatedNight && (
          <span className="absolute left-3 top-[calc(max(env(safe-area-inset-top),10px)+52px)] z-10 px-2 py-0.5 rounded-full bg-black/55 text-[10px] text-white/80">
            Đêm mô phỏng (chưa có ảnh chụp đêm)
          </span>
        )}

        {showGuide && stage === "pano" && (
          <button
            onClick={dismissGuide}
            className="absolute inset-x-6 top-1/3 z-20 rounded-2xl bg-black/70 backdrop-blur px-4 py-3 text-center text-[12px] leading-relaxed cursor-pointer"
          >
            Kéo để xoay · Chụm hai ngón để phóng to
            <br />
            Chạm <b className="text-[#d4af37]">◉ phân khu</b> để định giá, chạm biểu tượng để xem tiện ích
            <span className="block text-[10px] text-white/60 mt-1">(Chạm để đóng)</span>
          </button>
        )}

        {amenity && (
          <div className="absolute left-3 right-16 bottom-3 z-10 rounded-xl bg-white text-gray-900 p-3 shadow-xl">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[12.5px] font-bold">
                {AMENITY_ICONS[amenity.icon] || AMENITY_ICONS.pin} {amenity.label}
              </p>
              <button onClick={() => setAmenity(null)} aria-label="Đóng" className="p-0.5 cursor-pointer">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            {amenity.description && <p className="text-[11px] text-gray-600 mt-1 leading-relaxed">{amenity.description}</p>}
          </div>
        )}
      </div>

      {/* Ngăn kéo thông tin + dải dự án */}
      <div className="relative z-20 bg-[#151b24] rounded-t-2xl border-t border-white/10 pb-[env(safe-area-inset-bottom)]">
        <button onClick={() => setDrawer((d) => (d === "peek" ? "open" : "peek"))} className="w-full pt-2 pb-1 flex justify-center cursor-pointer" aria-label="Mở / thu thông tin">
          <span className="w-10 h-1 rounded-full bg-white/25" />
        </button>

        {project && (
          <div className="px-4 pb-2 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[14px] font-bold truncate">{project.title}</p>
                <p className="text-[10.5px] text-white/60 flex items-center gap-1 truncate">
                  <MapPin className="w-3 h-3 shrink-0" /> {project.location}
                </p>
              </div>
              <button
                onClick={() => onValuate(project, null)}
                className="shrink-0 px-3 py-2 rounded-xl bg-[#d4af37] text-black text-[11.5px] font-extrabold flex items-center gap-1 cursor-pointer"
              >
                <Calculator className="w-3.5 h-3.5" /> Định giá
              </button>
            </div>
            {drawer === "open" && (
              <div className="grid grid-cols-3 gap-1.5 text-center text-[10px]">
                <div className="rounded-lg bg-white/5 py-1.5">
                  <p className="text-white/50">Đơn giá từ</p>
                  <p className="font-bold text-[11px]">{project.price_per_m2 ? `${fmtVnd(project.price_per_m2)}/m²` : "—"}</p>
                </div>
                <div className="rounded-lg bg-white/5 py-1.5">
                  <p className="text-white/50">Quy mô</p>
                  <p className="font-bold text-[11px]">{project.geo?.area_ha ? `${Number(project.geo.area_ha).toLocaleString("vi-VN")} ha` : "—"}</p>
                </div>
                <div className="rounded-lg bg-white/5 py-1.5">
                  <p className="text-white/50">Trạng thái</p>
                  <p className={`font-bold text-[11px] ${project.is_active ? "text-emerald-400" : "text-amber-300"}`}>{project.is_active ? "Đang mở" : "Tạm khoá"}</p>
                </div>
                {project.geo?.highlights?.length > 0 && (
                  <p className="col-span-3 text-left text-[10.5px] text-white/70 leading-relaxed">• {project.geo.highlights.join(" • ")}</p>
                )}
              </div>
            )}
            {data && !data.panos.length && <p className="text-[10.5px] text-white/50">Ảnh 360° của dự án sẽ được cập nhật.</p>}
            {data?.panos.length > 0 && stage === "map" && (
              <button onClick={() => setStage("pano")} className="text-[11px] font-bold text-[#d4af37] cursor-pointer">
                Xem ảnh 360° →
              </button>
            )}
            {!hasGeo(project.geo) && <p className="text-[10.5px] text-white/50">Dự án chưa có vị trí trên bản đồ.</p>}
          </div>
        )}

        <div className="flex gap-2 overflow-x-auto px-4 pb-3 scrollbar-hide">
          {projects.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              className={`shrink-0 flex items-center gap-2 pl-1 pr-3 py-1 rounded-full border text-[11px] font-bold cursor-pointer ${
                p.id === selectedId ? "bg-[#d4af37] text-black border-[#d4af37]" : "bg-white/5 text-white/80 border-white/10"
              }`}
            >
              <span className="w-7 h-7 rounded-full bg-cover bg-center bg-white/10" style={p.image ? { backgroundImage: `url("${encodeURI(p.image)}")` } : undefined} />
              {(p.title || "").replace(/^vinhomes\s*/i, "")}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
