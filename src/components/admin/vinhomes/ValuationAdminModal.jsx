import React, { useCallback, useEffect, useState } from "react";
import { X, Calculator, Loader2 } from "lucide-react";
import { TYPE_LABELS, DIRECTION_LABELS, DIRECTION_ORDER, fmtVnd, fmtMoney, valuateUnit, vhErrorMessage } from "@/lib/vinhomesValuation";
import { TYPE_ORDER, loadProjectValuationData } from "@/lib/vinhomesValuationAdmin";
import ConfigEditor from "./ConfigEditor";
import ZonesEditor from "./ZonesEditor";
import UnitsEditor from "./UnitsEditor";
import PriceHistoryEditor from "./PriceHistoryEditor";
import LoansEditor from "./LoansEditor";
import LeadsList from "./LeadsList";
import { NumInput } from "./ui";

const TABS = [
  ["config", "Hệ số & tiến độ"],
  ["zones", "Phân khu & mã căn"],
  ["prices", "Lịch sử giá"],
  ["loans", "Gói vay"],
  ["leads", "Khách quan tâm"],
];

/** Thử định giá ngay trong màn Admin để kiểm tra cấu hình vừa lưu. */
function TryPanel({ projectId, config, version }) {
  const types = TYPE_ORDER.filter((t) => config?.k_type?.[t] !== undefined);
  const [type, setType] = useState(types[0] || "apartment");
  const [area, setArea] = useState("");
  const [dir, setDir] = useState("DN");
  const [res, setRes] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const r = config?.area_ranges?.[type];
    if (r) setArea(String(Math.round((Number(r[0]) + Number(r[1])) / 2)));
  }, [type, config]);

  useEffect(() => {
    if (!config || !area) return undefined;
    let alive = true;
    const t = setTimeout(() => {
      setBusy(true);
      valuateUnit(projectId, { type, area: Number(area), direction: dir, zone_id: null, unit_code: null, floor: null, is_corner: false, view: "none", years: 5 })
        .then((r) => alive && (setRes(r), setErr("")))
        .catch((e) => alive && (setRes(null), setErr(vhErrorMessage(e))))
        .finally(() => alive && setBusy(false));
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [projectId, config, type, area, dir, version]);

  if (!config) return null;
  return (
    <div className="rounded-xl bg-white border border-[#948154]/30 p-2.5 flex flex-wrap items-center gap-2 text-[10.5px]">
      <span className="font-bold text-[#948154] flex items-center gap-1">
        <Calculator className="w-3.5 h-3.5" /> Thử định giá
      </span>
      <select value={type} onChange={(e) => setType(e.target.value)} className="px-1.5 py-1 rounded-md border border-gray-200 bg-white">
        {types.map((t) => (
          <option key={t} value={t}>
            {TYPE_LABELS[t]}
          </option>
        ))}
      </select>
      <div className="w-20">
        <NumInput step="1" value={area} onChange={setArea} />
      </div>
      <span className="text-gray-500">m²</span>
      <select value={dir} onChange={(e) => setDir(e.target.value)} className="px-1.5 py-1 rounded-md border border-gray-200 bg-white">
        {DIRECTION_ORDER.map((d) => (
          <option key={d} value={d}>
            {DIRECTION_LABELS[d]}
          </option>
        ))}
      </select>
      <span className="ml-auto font-bold text-gray-900 flex items-center gap-1">
        {busy && <Loader2 className="w-3 h-3 animate-spin text-gray-400" />}
        {err ? (
          <span className="text-red-600 font-semibold">{err}</span>
        ) : res ? (
          <>
            {fmtVnd(res.value.estimate)}
            <span className="font-normal text-gray-500">
              ({fmtMoney(res.value.floor)} – {fmtMoney(res.value.ceiling)})
            </span>
          </>
        ) : null}
      </span>
    </div>
  );
}

/**
 * Admin → Dự án → thẻ VinHomes → "Cấu hình định giá". Mọi thay đổi có hiệu
 * lực ngay với khách (định giá chạy trên máy chủ, đọc thẳng các bảng vh_*).
 */
export default function ValuationAdminModal({ project, onClose }) {
  const [tab, setTab] = useState("config");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);

  const reload = useCallback(() => {
    loadProjectValuationData(project.id)
      .then((d) => {
        setData(d);
        setError("");
        setVersion((v) => v + 1);
      })
      .catch((e) => setError(e.message || String(e)));
  }, [project.id]);

  useEffect(() => {
    reload();
  }, [reload]);

  const name = project.title || project.name;

  return (
    <div className="fixed inset-0 z-[120] bg-black/50 flex items-stretch sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-3xl bg-gray-50 sm:rounded-2xl shadow-2xl flex flex-col max-h-full sm:max-h-[92vh] overflow-hidden"
      >
        <div className="flex items-center justify-between gap-2 px-4 py-3 bg-white border-b border-gray-100">
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-gray-900 truncate">Cấu hình định giá · {name}</p>
            <p className="text-[10px] text-gray-500">
              Đơn giá gốc {fmtVnd(project.price_per_m2)}/m² (sửa ở nút "Chỉnh sửa" của dự án). Thay đổi có hiệu lực ngay với khách.
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 cursor-pointer" aria-label="Đóng">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="flex gap-1 px-3 py-2 overflow-x-auto bg-white border-b border-gray-100 scrollbar-hide">
          {TABS.map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`px-2.5 py-1 rounded-lg text-[10.5px] font-bold shrink-0 cursor-pointer ${tab === k ? "bg-[#948154] text-white" : "bg-gray-100 text-gray-600"}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {error && <p className="text-[11px] text-red-700 bg-red-50 rounded-lg px-3 py-2">Không tải được dữ liệu: {error}</p>}
          {!data && !error && (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
            </div>
          )}
          {data && (
            <>
              <TryPanel projectId={project.id} config={data.config} version={version} />
              {tab === "config" && <ConfigEditor projectId={project.id} config={data.config} onSaved={reload} />}
              {tab === "zones" && (
                <>
                  <ZonesEditor projectId={project.id} zones={data.zones} units={data.units} onChanged={reload} />
                  <UnitsEditor projectId={project.id} units={data.units} zones={data.zones} config={data.config} onChanged={reload} />
                </>
              )}
              {tab === "prices" && <PriceHistoryEditor projectId={project.id} history={data.history} config={data.config} onChanged={reload} />}
              {tab === "loans" && <LoansEditor />}
              {tab === "leads" && <LeadsList projectId={project.id} projectName={name} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
