import React, { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { TYPE_LABELS, DIRECTION_LABELS, VIEW_LABELS } from "@/lib/vinhomesValuation";
import { DEFAULT_CONFIG, TYPE_ORDER, DIRECTION_ORDER, VIEW_ORDER, validateConfig, saveConfig } from "@/lib/vinhomesValuationAdmin";
import { NumInput, Labeled, Section, Errors, PrimaryButton } from "./ui";

const clone = (o) => JSON.parse(JSON.stringify(o));

/**
 * Hệ số định giá, biên độ, cho thuê, tiến độ thanh toán của 1 dự án.
 * Bỏ chọn một loại hình = dự án không bán loại hình đó (khách không chọn được).
 */
export default function ConfigEditor({ projectId, config, onSaved }) {
  const [cfg, setCfg] = useState(() => clone(config || DEFAULT_CONFIG));
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => setCfg(clone(config || DEFAULT_CONFIG)), [config]);

  const setIn = (path, value) =>
    setCfg((c) => {
      const next = clone(c);
      let o = next;
      path.slice(0, -1).forEach((k) => {
        o[k] ??= {};
        o = o[k];
      });
      o[path[path.length - 1]] = value;
      return next;
    });

  const toggleType = (t) =>
    setCfg((c) => {
      const next = clone(c);
      if (next.k_type[t] !== undefined) {
        delete next.k_type[t];
      } else {
        next.k_type[t] = DEFAULT_CONFIG.k_type[t];
        next.area_ranges[t] ??= DEFAULT_CONFIG.area_ranges[t];
        next.rent_yield[t] ??= DEFAULT_CONFIG.rent_yield[t];
      }
      return next;
    });

  const sched = cfg.payment_schedule || [];
  const total = sched.reduce((s, p) => s + (Number(p.pct) || 0), 0);

  const save = async () => {
    const errs = validateConfig(cfg);
    setErrors(errs);
    if (errs.length) return;
    setBusy(true);
    try {
      await saveConfig(projectId, cfg);
      toast.success("Đã lưu cấu hình định giá");
      onSaved?.();
    } catch (e) {
      toast.error(`Không lưu được: ${e.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {!config && (
        <p className="text-[10.5px] text-amber-800 bg-amber-50 rounded-lg px-3 py-2">
          Dự án chưa có cấu hình định giá. Đang hiện giá trị mặc định - bấm Lưu để tạo.
        </p>
      )}

      <Section title="Loại hình bán, hệ số và diện tích" hint="Đơn giá loại hình = đơn giá gốc của dự án × hệ số. Diện tích là khoảng khách được chọn.">
        <div className="space-y-1.5">
          {TYPE_ORDER.map((t) => {
            const on = cfg.k_type?.[t] !== undefined;
            return (
              <div key={t} className={`rounded-lg border border-gray-100 p-2 space-y-1.5 ${on ? "" : "opacity-50"}`}>
                <label className="flex items-center gap-1.5 text-[11px] font-bold text-gray-800 cursor-pointer">
                  <input type="checkbox" checked={on} onChange={() => toggleType(t)} className="accent-[#948154]" />
                  {TYPE_LABELS[t]}
                  {!on && <span className="font-normal text-gray-400">(không bán)</span>}
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  <Labeled label="Hệ số">
                    <NumInput disabled={!on} value={cfg.k_type?.[t]} onChange={(v) => setIn(["k_type", t], v)} />
                  </Labeled>
                  <Labeled label="Từ m²">
                    <NumInput step="1" disabled={!on} value={cfg.area_ranges?.[t]?.[0]} onChange={(v) => setIn(["area_ranges", t, 0], v)} />
                  </Labeled>
                  <Labeled label="Đến m²">
                    <NumInput step="1" disabled={!on} value={cfg.area_ranges?.[t]?.[1]} onChange={(v) => setIn(["area_ranges", t, 1], v)} />
                  </Labeled>
                  <Labeled label="Thuê %/năm">
                    <NumInput step="0.1" disabled={!on} value={cfg.rent_yield?.[t]} onChange={(v) => setIn(["rent_yield", t], v)} />
                  </Labeled>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Hệ số hướng nhà" hint="1 = không đổi giá; 1,03 = cao hơn 3%; 0,97 = thấp hơn 3%.">
        <div className="grid grid-cols-4 gap-2">
          {DIRECTION_ORDER.map((d) => (
            <Labeled key={d} label={DIRECTION_LABELS[d]}>
              <NumInput value={cfg.k_dir?.[d]} onChange={(v) => setIn(["k_dir", d], v)} />
            </Labeled>
          ))}
        </div>
      </Section>

      <Section title="Vị trí, tầng, hướng nhìn">
        <div className="grid grid-cols-3 gap-2">
          <Labeled label="Căn góc (thấp tầng)">
            <NumInput value={cfg.corner_factor} onChange={(v) => setIn(["corner_factor"], v)} />
          </Labeled>
          <Labeled label="+% mỗi tầng (căn hộ)" hint="Tính từ tầng 2">
            <NumInput step="0.1" value={cfg.floor_step_pct} onChange={(v) => setIn(["floor_step_pct"], v)} />
          </Labeled>
          <Labeled label="Tối đa +% theo tầng">
            <NumInput step="0.5" value={cfg.floor_cap_pct} onChange={(v) => setIn(["floor_cap_pct"], v)} />
          </Labeled>
          {VIEW_ORDER.map((v) => (
            <Labeled key={v} label={`Nhìn ${VIEW_LABELS[v].toLowerCase()}`}>
              <NumInput value={cfg.k_view?.[v]} onChange={(x) => setIn(["k_view", v], x)} />
            </Labeled>
          ))}
        </div>
      </Section>

      <Section title="Khoảng giá, cho thuê, tăng giá">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Labeled label="Biên độ sàn–trần ±%">
            <NumInput step="0.5" value={cfg.band_pct} onChange={(v) => setIn(["band_pct"], v)} />
          </Labeled>
          <Labeled label="Thời gian trống %">
            <NumInput step="1" value={cfg.vacancy_pct} onChange={(v) => setIn(["vacancy_pct"], v)} />
          </Labeled>
          <Labeled label="Chi phí vận hành %/năm">
            <NumInput step="0.1" value={cfg.opex_pct} onChange={(v) => setIn(["opex_pct"], v)} />
          </Labeled>
          <Labeled label="Tăng giá mặc định %/năm" hint="Dùng khi lịch sử giá chưa đủ 2 tháng">
            <NumInput step="0.5" value={cfg.growth_pct} onChange={(v) => setIn(["growth_pct"], v)} />
          </Labeled>
        </div>
      </Section>

      <Section
        title="Tiến độ thanh toán"
        hint="Tổng các đợt phải bằng 100%. Tháng tính từ lúc ký hợp đồng."
        right={
          <span className={`text-[10.5px] font-bold ${Math.abs(total - 100) < 0.001 ? "text-emerald-700" : "text-red-600"}`}>
            Tổng {Math.round(total * 100) / 100}%
          </span>
        }
      >
        <div className="space-y-1.5">
          <div className="grid grid-cols-[1fr_52px_52px_24px] gap-1 text-[9.5px] text-gray-400">
            <span>Tên đợt</span>
            <span className="text-right">%</span>
            <span className="text-right">Tháng</span>
          </div>
          {sched.map((p, i) => (
            <div key={i} className="grid grid-cols-[1fr_52px_52px_24px] gap-1 items-center">
              <input
                value={p.label}
                onChange={(e) => setIn(["payment_schedule", i, "label"], e.target.value)}
                className="min-w-0 px-2 py-1 rounded-md border border-gray-200 text-[11px]"
                placeholder="Tên đợt"
              />
              <NumInput step="1" value={p.pct} onChange={(v) => setIn(["payment_schedule", i, "pct"], v)} placeholder="%" />
              <NumInput step="1" value={p.month} onChange={(v) => setIn(["payment_schedule", i, "month"], v)} placeholder="Tháng" />
              <button
                onClick={() => setCfg((c) => ({ ...c, payment_schedule: c.payment_schedule.filter((_, j) => j !== i) }))}
                className="p-1 rounded-md text-red-500 hover:bg-red-50 cursor-pointer"
                aria-label="Xoá đợt"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <div className="flex items-center justify-between">
            <button
              onClick={() => setCfg((c) => ({ ...c, payment_schedule: [...(c.payment_schedule || []), { label: `Đợt ${sched.length + 1}`, pct: 0, month: (Number(sched.at(-1)?.month) || 0) + 3 }] }))}
              className="text-[10.5px] font-bold text-[#948154] flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3 h-3" /> Thêm đợt
            </button>
            <Labeled label="Chiết khấu trả sớm 100% (%)">
              <NumInput step="0.5" value={cfg.early_discount_pct} onChange={(v) => setIn(["early_discount_pct"], v)} />
            </Labeled>
          </div>
        </div>
      </Section>

      <Errors errors={errors} />
      <div className="flex justify-end gap-2 sticky bottom-0 bg-gray-50/90 backdrop-blur py-2">
        <button onClick={() => { setCfg(clone(config || DEFAULT_CONFIG)); setErrors([]); }} className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-[11px] font-bold text-gray-600 cursor-pointer">
          Hoàn tác
        </button>
        <PrimaryButton busy={busy} onClick={save}>
          Lưu cấu hình
        </PrimaryButton>
      </div>
    </div>
  );
}
