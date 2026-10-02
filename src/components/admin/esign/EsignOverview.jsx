import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, Archive, Check, Clock, FileWarning, PenLine, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { documentStats, recentDocumentEvents, watchDocumentsTable } from "@/lib/esignApi";
import { EVENT_LABELS, STATUS_ORDER } from "@/lib/esignStatus";
import { formatVnDateTime } from "@/shared/docLayout";
import { Button, Section, Select } from "./ui";

const fmt = (iso) => (iso ? formatVnDateTime(iso).replace(" (GMT+7)", "") : "—");

function FunnelBar({ label, value, base, color }) {
  const pct = base ? Math.round((value / base) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-[10.5px] text-gray-600 mb-0.5">
        <span>{label}</span>
        <span>
          <b>{value}</b> · {pct}%
        </span>
      </div>
      <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function AttentionItem({ icon: Icon, tone, count, label, onClick }) {
  if (!count) return null;
  const tones = {
    amber: "bg-amber-50 border-amber-200 text-amber-800",
    red: "bg-rose-50 border-rose-200 text-rose-700",
    gray: "bg-gray-50 border-gray-200 text-gray-700",
  };
  return (
    <button type="button" onClick={onClick} className={`w-full flex items-center gap-2 p-2 rounded-lg border text-left text-[11.5px] hover:brightness-95 ${tones[tone]}`}>
      <Icon className="w-4 h-4 shrink-0" />
      <span className="flex-1">
        <b>{count}</b> {label}
      </span>
      <span className="text-[10.5px] underline">Xem</span>
    </button>
  );
}

function GettingStarted({ steps }) {
  return (
    <section className="bg-white rounded-xl border border-[#948154]/40 p-3">
      <h3 className="text-[12.5px] font-bold text-gray-900">Bắt đầu trong 3 bước</h3>
      <ol className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
        {steps.map((st, i) => (
          <li key={st.title}>
            <button
              type="button"
              onClick={st.action}
              className={`w-full h-full text-left rounded-lg border p-2.5 ${st.done ? "border-emerald-200 bg-emerald-50" : "border-gray-200 hover:border-[#948154]"}`}
            >
              <span className="flex items-center gap-1.5 text-[11.5px] font-bold text-gray-900">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${st.done ? "bg-emerald-600 text-white" : "bg-[#948154] text-white"}`}>
                  {st.done ? <Check className="w-3 h-3" /> : i + 1}
                </span>
                {st.title}
              </span>
              <span className="block text-[10.5px] text-gray-500 mt-1">{st.desc}</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * Tab "Tổng quan" (spec hợp đồng mục 2.5): số văn bản theo trạng thái, phễu
 * gửi → xem → ký, việc cần xử lý và hoạt động gần đây. Tự cập nhật realtime.
 */
export default function EsignOverview({ onOpenBoard, onNavigate }) {
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState(null);
  const [events, setEvents] = useState([]);
  const [users, setUsers] = useState({});
  const [loading, setLoading] = useState(true);
  const [setup, setSetup] = useState(null); // { letterhead, template }
  const timer = useRef(null);

  const load = async (d = days) => {
    try {
      const [s, ev] = await Promise.all([documentStats(d), recentDocumentEvents(15)]);
      setStats(s);
      setEvents(ev || []);
    } catch (e) {
      toast.error(`Không tải được tổng quan: ${e.message || e}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(days);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  useEffect(() => {
    base44.entities.User.list("-created_date", 1000)
      .then((us) => setUsers(Object.fromEntries(us.map((u) => [u.id, u]))))
      .catch(() => {});
    Promise.all([
      base44.entities.DocumentLetterhead.filter({ status: "published" }, "-created_date", 1),
      base44.entities.DocumentTemplate.filter({ status: "published" }, "-created_date", 1),
    ])
      .then(([lhs, tpls]) => setSetup({ letterhead: lhs.length > 0, template: tpls.length > 0 }))
      .catch(() => setSetup(null));
    // Gộp các thay đổi realtime dồn dập thành một lần tải lại.
    const unsub = watchDocumentsTable(() => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => load(), 1500);
    });
    return () => {
      clearTimeout(timer.current);
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <p className="text-[11px] text-gray-400 py-6 text-center">Đang tải…</p>;
  if (!stats) return null;

  const counts = stats.counts || {};
  const funnel = stats.funnel || { sent: 0, viewed: 0, signed: 0 };
  const total = STATUS_ORDER.reduce((n, k) => n + (counts[k] || 0), 0);
  const userName = (id) => users[id]?.full_name || users[id]?.name || users[id]?.email || "Người dùng";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11.5px] text-gray-600">
          Tổng <b>{total}</b> văn bản đã gửi
        </p>
        <Button variant="ghost" onClick={() => load()} aria-label="Làm mới">
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      </div>

      {setup && (!setup.letterhead || !setup.template || total === 0) && (
        <GettingStarted
          steps={[
            { done: setup.letterhead, title: "Tạo khung văn bản", desc: "Logo, tên đơn vị, con dấu và chữ ký người đại diện - làm 1 lần.", action: () => onNavigate?.("letterheads") },
            { done: setup.template, title: "Soạn mẫu văn bản", desc: "Viết nội dung, chèn ô thông tin (tên, ngày…) rồi bấm Xuất bản.", action: () => onNavigate?.("templates") },
            { done: total > 0, title: "Gửi văn bản", desc: "Chọn mẫu → chọn người nhận → Gửi. Người nhận ký ngay trong ứng dụng.", action: () => onNavigate?.("dispatch") },
          ]}
        />
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: "Đang chờ ký", value: (counts.sent || 0) + (counts.delivered || 0) + (counts.viewed || 0), filter: { status: "open" }, tone: "text-sky-700" },
          { label: "Đã ký", value: (counts.signed || 0) + (counts.approved || 0), filter: { status: "signed" }, tone: "text-emerald-700" },
          { label: "Hết hạn", value: counts.expired || 0, filter: { status: "expired" }, tone: "text-amber-700" },
          { label: "Đã thu hồi", value: counts.revoked || 0, filter: { status: "revoked" }, tone: "text-gray-600" },
        ].map((c) => (
          <button key={c.label} type="button" onClick={() => onOpenBoard?.(c.filter)} className="text-left bg-white rounded-xl border border-gray-200 p-3 hover:border-[#948154]">
            <span className={`text-[11px] font-semibold ${c.tone}`}>{c.label}</span>
            <p className="text-[22px] font-bold text-gray-900 mt-0.5 leading-none">{c.value}</p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
        <Section
          title="Phễu ký"
          description="Văn bản phát hành trong khoảng thời gian đã chọn."
          actions={
            <Select value={days} onChange={(e) => setDays(Number(e.target.value))} className="!w-28 !h-8">
              <option value={7}>7 ngày</option>
              <option value={30}>30 ngày</option>
              <option value={90}>90 ngày</option>
              <option value={365}>12 tháng</option>
            </Select>
          }
        >
          <div className="space-y-2">
            <FunnelBar label="Đã gửi" value={funnel.sent} base={funnel.sent} color="#0284c7" />
            <FunnelBar label="Đã xem" value={funnel.viewed} base={funnel.sent} color="#1a3c8f" />
            <FunnelBar label="Đã ký" value={funnel.signed} base={funnel.sent} color="#0f766e" />
          </div>
          <p className="text-[11px] text-gray-600 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-gray-400" />
            Thời gian ký trung vị:{" "}
            <b>{stats.median_sign_hours === null || stats.median_sign_hours === undefined ? "—" : stats.median_sign_hours < 24 ? `${stats.median_sign_hours} giờ` : `${(stats.median_sign_hours / 24).toFixed(1)} ngày`}</b>
          </p>
        </Section>

        <Section title="Cần xử lý">
          <div className="space-y-1.5">
            <AttentionItem icon={AlertTriangle} tone="amber" count={stats.due_soon} label="văn bản sắp hết hạn ký (48 giờ)" onClick={() => onOpenBoard?.({ status: "open", dueSoon: true })} />
            <AttentionItem icon={Clock} tone="amber" count={counts.expired} label="văn bản đã hết hạn - gia hạn hoặc thu hồi" onClick={() => onOpenBoard?.({ status: "expired" })} />
            <AttentionItem icon={PenLine} tone="gray" count={counts.signed} label="văn bản đã ký chờ duyệt" onClick={() => onOpenBoard?.({ status: "signed" })} />
            <AttentionItem icon={FileWarning} tone="red" count={stats.pdf_failed} label="văn bản tạo PDF lỗi" onClick={() => onOpenBoard?.({ status: "signed" })} />
            <AttentionItem icon={Archive} tone="gray" count={stats.retention_soon} label="PDF sắp hết hạn lưu trữ (7 ngày)" onClick={() => onOpenBoard?.({})} />
            <AttentionItem icon={Send} tone="gray" count={stats.drafts} label="đợt gửi nháp / hẹn giờ" onClick={() => onNavigate?.("campaigns")} />
            {!stats.due_soon && !counts.expired && !counts.signed && !stats.pdf_failed && !stats.retention_soon && !stats.drafts && (
              <p className="text-[11px] text-gray-400 text-center py-3">Không có việc cần xử lý.</p>
            )}
          </div>
        </Section>
      </div>

      <Section title="Hoạt động gần đây">
        {events.length === 0 ? (
          <p className="text-[11px] text-gray-400 text-center py-3">Chưa có hoạt động.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {events.map((e) => {
              const doc = e.custom_documents;
              const who = e.actor_id ? userName(e.actor_id) : "Hệ thống";
              return (
                <li key={e.id} className="py-1.5 flex items-start gap-2 text-[11px]">
                  <span className="text-gray-400 whitespace-nowrap w-[120px] shrink-0">{fmt(e.created_at)}</span>
                  <button type="button" onClick={() => onOpenBoard?.({ documentId: e.document_id })} className="flex-1 min-w-0 text-left hover:underline">
                    <b>{who}</b> · {EVENT_LABELS[e.event] || e.event}
                    <span className="text-gray-500"> - {doc?.title || "Văn bản"}</span>
                    {doc?.doc_no && <span className="text-gray-400 font-mono"> ({doc.doc_no})</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}
