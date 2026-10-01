import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BarChart3, Bell, Download, ExternalLink, Play, RefreshCw, ShieldCheck, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { supabase } from "@/lib/supabase";
import { campaignProgress, getDocumentPdfUrl, invokeDispatch, listCampaignDocuments, remindCampaign, requeueDocumentPdf, revokeDocuments, setDocumentRetention } from "@/lib/esignApi";
import { toCsv } from "@/lib/csv";
import { formatVnDateTime } from "@/shared/docLayout";
import RetentionSelect, { retentionLabel } from "./RetentionSelect";
import { DOC_STATUS, OPEN_STATUSES, STATUS_ORDER, displayStatus } from "@/lib/esignStatus";
import { Badge, Button, DocStatusBadge, EmptyState, Section } from "./ui";

const CAMPAIGN_STATUS = {
  draft: { label: "Lỗi / nháp", color: "red" },
  scheduled: { label: "Hẹn giờ", color: "blue" },
  dispatching: { label: "Đang phát hành", color: "orange" },
  sent: { label: "Đã phát hành", color: "green" },
  revoked: { label: "Đã thu hồi", color: "gray" },
};


const fmt = (iso) => (iso ? formatVnDateTime(iso).replace(" (GMT+7)", "") : "—");

function Progress({ value, total, color }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-[9.5px] text-gray-500 w-12 text-right shrink-0">
        {value}/{total}
      </span>
    </div>
  );
}

function audienceSummary(a, groupsById) {
  if (!a) return "—";
  if (a.type === "user" || a.type === "users") return `${(a.user_ids || []).length} người chọn tay`;
  if (a.type === "all") return "Tất cả hội viên";
  const names = (a.group_ids || []).map((id) => groupsById[id]?.name || "nhóm đã xoá");
  return [names.join(", "), a.include_user_ids?.length ? `+${a.include_user_ids.length} người` : "", a.exclude_user_ids?.length ? `-${a.exclude_user_ids.length} người` : ""].filter(Boolean).join(" ");
}

/** Theo dõi các đợt phát hành (spec 6.4). */
export default function CampaignDashboard() {
  const [campaigns, setCampaigns] = useState([]);
  const [templates, setTemplates] = useState({});
  const [groups, setGroups] = useState({});
  const [progress, setProgress] = useState({});
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);

  const load = async () => {
    try {
      const [camps, tpls, grps] = await Promise.all([
        base44.entities.DocumentCampaign.list("-created_date", 200),
        base44.entities.DocumentTemplate.list("-created_date", 500),
        base44.entities.UserGroup.list("-created_date", 500),
      ]);
      setCampaigns(camps);
      setTemplates(Object.fromEntries(tpls.map((t) => [t.id, t])));
      setGroups(Object.fromEntries(grps.map((g) => [g.id, g])));
      setProgress(await campaignProgress(camps.map((c) => c.id)));
    } catch (e) {
      toast.error(`Không tải được danh sách đợt: ${e.message || e}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const unsub = base44.entities.DocumentCampaign.subscribe(() => load());
    const timer = setInterval(load, 20000);
    return () => {
      unsub?.();
      clearInterval(timer);
    };
  }, []);

  const resume = async (c) => {
    try {
      if (c.status === "draft") await base44.entities.DocumentCampaign.update(c.id, { status: "scheduled", scheduled_at: new Date().toISOString(), last_error: null });
      const res = await invokeDispatch(c.id);
      if (res?.outcome === "failed") throw new Error(res.error);
      toast.success(res?.outcome === "busy" ? "Đợt đang được phát hành ở tiến trình khác" : `Đã phát hành thêm ${res?.inserted ?? 0} văn bản`);
      load();
    } catch (e) {
      toast.error(`Không chạy được: ${e.message || e}`);
    }
  };

  const open = campaigns.find((c) => c.id === openId);
  if (open) {
    return (
      <CampaignDetail
        campaign={open}
        template={templates[open.template_id]}
        audienceText={audienceSummary(open.audience, groups)}
        onBack={() => {
          setOpenId(null);
          load();
        }}
      />
    );
  }

  if (loading) return <p className="text-[11px] text-gray-400 py-6 text-center">Đang tải…</p>;
  if (!campaigns.length) return <EmptyState icon={BarChart3} title="Chưa có đợt phát hành" description="Phát hành văn bản ở mục Phát hành." />;

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button variant="ghost" onClick={load}>
          <RefreshCw className="w-3.5 h-3.5" /> Làm mới
        </Button>
      </div>
      {campaigns.map((c) => {
        const st = CAMPAIGN_STATUS[c.status] || CAMPAIGN_STATUS.draft;
        const p = progress[c.id] || { total: 0, viewed: 0, signed: 0, pdf: 0 };
        const stuck = c.status === "dispatching" && c.updated_at && Date.now() - new Date(c.updated_at).getTime() > 120000;
        return (
          <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-3 space-y-2">
            <div className="flex items-start gap-2">
              <button type="button" onClick={() => setOpenId(c.id)} className="flex-1 min-w-0 text-left">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[12.5px] font-bold text-gray-900">{c.title || "(không tên)"}</span>
                  <Badge color={st.color}>{st.label}</Badge>
                  {stuck && <Badge color="orange">Bị ngắt</Badge>}
                </div>
                <p className="text-[10.5px] text-gray-500 mt-0.5">
                  {templates[c.template_id]?.name || "Mẫu đã xoá"} · {audienceSummary(c.audience, groups)} · Tạo {fmt(c.created_date)}
                  {c.status === "scheduled" && c.scheduled_at ? ` · Hẹn ${fmt(c.scheduled_at)}` : ""}
                  {c.due_at ? ` · Hạn ký ${fmt(c.due_at).slice(9)}` : ""}
                </p>
                {c.last_error && <p className="text-[10.5px] text-red-600 mt-0.5">Lỗi: {c.last_error}</p>}
              </button>
              {(c.status === "draft" || stuck || (c.status === "scheduled" && (!c.scheduled_at || new Date(c.scheduled_at) <= new Date()))) && (
                <Button variant="secondary" onClick={() => resume(c)}>
                  <Play className="w-3.5 h-3.5" /> {c.status === "draft" ? "Thử lại" : "Chạy tiếp"}
                </Button>
              )}
            </div>
            {p.total > 0 && (
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <p className="text-[9.5px] text-gray-500">Đã xem</p>
                  <Progress value={p.viewed} total={p.total} color="#1a3c8f" />
                </div>
                <div>
                  <p className="text-[9.5px] text-gray-500">Đã ký</p>
                  <Progress value={p.signed} total={p.total} color="#0f766e" />
                </div>
                <div>
                  <p className="text-[9.5px] text-gray-500">Có PDF</p>
                  <Progress value={p.pdf} total={p.total} color="#948154" />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CampaignDetail({ campaign, template, audienceText, onBack }) {
  const [docs, setDocs] = useState([]);
  const [users, setUsers] = useState({});
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [retentionFor, setRetentionFor] = useState(null); // doc

  const load = () =>
    listCampaignDocuments(campaign.id)
      .then(setDocs)
      .catch((e) => toast.error(`Không tải được văn bản: ${e.message}`));

  useEffect(() => {
    load();
    base44.entities.User.list("-created_date", 1000)
      .then((us) => setUsers(Object.fromEntries(us.map((u) => [u.id, u]))))
      .catch(() => {});
    // Realtime: số liệu tự nhảy khi người nhận xem/ký.
    const channel = supabase
      .channel(`esign-campaign-${campaign.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "custom_documents", filter: `campaign_id=eq.${campaign.id}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign.id]);

  const counts = useMemo(() => {
    const c = { all: docs.length };
    for (const d of docs) {
      const k = displayStatus(d);
      c[k] = (c[k] || 0) + 1;
      if (OPEN_STATUSES.includes(k)) c.open = (c.open || 0) + 1;
    }
    return c;
  }, [docs]);
  const shown = filter === "all" ? docs : docs.filter((d) => displayStatus(d) === filter);
  const name = (d) => users[d.user_id]?.full_name || users[d.user_id]?.name || d.user_id;

  const run = async (fn, ok) => {
    setBusy(true);
    try {
      const n = await fn();
      toast.success(ok(n));
      load();
    } catch (e) {
      toast.error(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const openPdf = async (d) => {
    try {
      const { url } = await getDocumentPdfUrl(d.id);
      window.location.assign(url); // link có Content-Disposition: attachment → tải về, không rời trang
    } catch (e) {
      toast.error(e.message || "Không tải được PDF");
    }
  };

  const approveSigned = () =>
    run(async () => {
      const { data, error } = await supabase.from("custom_documents").update({ status: "approved" }).eq("campaign_id", campaign.id).eq("status", "signed").select("id");
      if (error) throw new Error(error.message);
      return data?.length || 0;
    }, (n) => `Đã duyệt ${n} văn bản`);

  const revokeUnsigned = () => {
    const ids = docs.filter((d) => [...OPEN_STATUSES, "expired"].includes(displayStatus(d)) && !d.locked_at).map((d) => d.id);
    if (!ids.length) return;
    const reason = window.prompt(`Thu hồi ${ids.length} văn bản chưa ký. Lý do (người nhận sẽ thấy):`);
    if (!reason?.trim()) return;
    run(() => revokeDocuments(ids, reason.trim()), (n) => `Đã thu hồi ${n} văn bản`);
  };

  const exportCsv = () => {
    const rows = [["Số VB", "Người nhận", "Email", "Trạng thái", "Đã xem", "Đã ký", "Người ký", "IP", "PDF", "Lưu trữ đến", "Giữ pháp lý"]];
    for (const d of docs) {
      rows.push([
        d.doc_no,
        name(d),
        users[d.user_id]?.email || "",
        DOC_STATUS[displayStatus(d)]?.label || d.status,
        fmt(d.first_viewed_at),
        fmt(d.signed_at),
        d.signer_name || "",
        d.signed_ip || "",
        d.pdf_status,
        d.pdf_expires_at ? fmt(d.pdf_expires_at) : d.signed_at ? "Vĩnh viễn" : "",
        d.legal_hold ? "Có" : "",
      ]);
    }
    const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `dot-phat-hanh-${campaign.id}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const failed = Array.isArray(campaign.failed) ? campaign.failed : [];

  return (
    <div className="space-y-3">
      <Button variant="ghost" onClick={onBack}>
        <ArrowLeft className="w-3.5 h-3.5" /> Tất cả đợt
      </Button>
      <Section
        title={campaign.title}
        description={`${template?.name || "Mẫu đã xoá"} · ${audienceText} · Lưu trữ: ${retentionLabel(campaign.resolved_retention_days ?? campaign.retention_days)}`}
        actions={
          <Button variant="secondary" onClick={exportCsv} disabled={!docs.length}>
            <Download className="w-3.5 h-3.5" /> CSV
          </Button>
        }
      >
        <div className="flex flex-wrap gap-1.5">
          <Button variant="secondary" disabled={busy || !counts.open} onClick={() => run(() => remindCampaign(campaign.id), (n) => `Đã nhắc ${n} người`)}>
            <Bell className="w-3.5 h-3.5" /> Nhắc người chưa ký
          </Button>
          <Button variant="danger" disabled={busy || !(counts.open || counts.expired)} onClick={revokeUnsigned}>
            <Undo2 className="w-3.5 h-3.5" /> Thu hồi phần chưa ký
          </Button>
          <Button variant="secondary" disabled={busy || !counts.signed} onClick={approveSigned}>
            <ShieldCheck className="w-3.5 h-3.5" /> Duyệt tất cả đã ký
          </Button>
        </div>
        {failed.length > 0 && (
          <details className="rounded-lg border border-red-200 bg-red-50 p-2 text-[10.5px] text-red-700">
            <summary className="cursor-pointer font-semibold">{failed.length} người không được phát hành</summary>
            <ul className="mt-1 space-y-0.5">
              {failed.slice(0, 200).map((f, i) => (
                <li key={i}>
                  {users[f.user_id]?.full_name || f.user_id}: {f.reason}
                </li>
              ))}
            </ul>
          </details>
        )}
      </Section>

      <div className="flex gap-1 flex-wrap">
        {[["all", "Tất cả"], ...STATUS_ORDER.map((k) => [k, DOC_STATUS[k].label])].map(([k, label]) =>
          k === "all" || counts[k] ? (
            <button key={k} type="button" onClick={() => setFilter(k)} className={`px-2.5 py-1 rounded-full text-[10.5px] border ${filter === k ? "bg-[#948154] text-white border-[#948154]" : "border-gray-300 text-gray-600"}`}>
              {label} ({counts[k] || 0})
            </button>
          ) : null,
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr>
              <th className="px-2 py-1.5 font-semibold">Người nhận</th>
              <th className="px-2 py-1.5 font-semibold">Trạng thái</th>
              <th className="px-2 py-1.5 font-semibold">Xem</th>
              <th className="px-2 py-1.5 font-semibold">Ký</th>
              <th className="px-2 py-1.5 font-semibold">Lưu trữ</th>
              <th className="px-2 py-1.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {shown.map((d) => {
              return (
                <tr key={d.id}>
                  <td className="px-2 py-1.5">
                    <span className="font-semibold text-gray-800">{name(d)}</span>
                    <span className="block text-[9.5px] text-gray-400 font-mono">{d.doc_no}</span>
                  </td>
                  <td className="px-2 py-1.5">
                    <DocStatusBadge doc={d} />
                    {d.reminder_count > 0 && <span className="block text-[9.5px] text-gray-400">Đã nhắc {d.reminder_count} lần</span>}
                  </td>
                  <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap">{fmt(d.first_viewed_at)}</td>
                  <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap">
                    {fmt(d.signed_at)}
                    {d.signed_ip && <span className="block text-[9.5px] text-gray-400">{d.signed_ip}</span>}
                  </td>
                  <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap">
                    {d.pdf_expires_at ? fmt(d.pdf_expires_at).slice(9) : retentionLabel(d.retention_days)}
                    {d.legal_hold && <Badge color="orange">Giữ pháp lý</Badge>}
                  </td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">
                    {d.pdf_status === "ready" && (
                      <button type="button" disabled={busy} onClick={() => openPdf(d)} className="text-[10.5px] text-[#7d6c45] hover:underline mr-2">
                        PDF
                      </button>
                    )}
                    {d.signed_at && ["failed", "none"].includes(d.pdf_status) && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => run(() => requeueDocumentPdf(d.id), () => "Đã xếp hàng tạo lại PDF")}
                        className="text-[10.5px] text-red-600 hover:underline mr-2"
                      >
                        Tạo lại PDF
                      </button>
                    )}
                    <button type="button" onClick={() => setRetentionFor(d)} className="text-[10.5px] text-[#7d6c45] hover:underline mr-2">
                      Lưu trữ
                    </button>
                    <a href={`${import.meta.env.BASE_URL}document/${d.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center text-gray-500 hover:text-gray-800" aria-label="Mở văn bản">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </td>
                </tr>
              );
            })}
            {shown.length === 0 && (
              <tr>
                <td colSpan={6} className="px-2 py-6 text-center text-gray-400">
                  Không có văn bản
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {retentionFor && <RetentionDialog doc={retentionFor} onClose={() => setRetentionFor(null)} onSaved={load} />}
    </div>
  );
}

function RetentionDialog({ doc, onClose, onSaved }) {
  const [days, setDays] = useState(doc.retention_days ?? 0);
  const [hold, setHold] = useState(!!doc.legal_hold);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await setDocumentRetention(doc.id, days, hold);
      toast.success("Đã cập nhật lưu trữ");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Lưu trữ văn bản">
      <div className="bg-white rounded-xl p-4 w-full max-w-sm space-y-3">
        <p className="text-[13px] font-bold">Lưu trữ PDF · {doc.doc_no}</p>
        <RetentionSelect value={days} onChange={(v) => setDays(v ?? 0)} allowInherit={false} />
        <p className="text-[10px] text-gray-500">Tính từ lúc người nhận ký. Hết hạn thì file PDF bị xoá; thông tin văn bản, mã băm và nhật ký vẫn được giữ.</p>
        <label className="flex items-center gap-2 text-[11.5px]">
          <input type="checkbox" checked={hold} onChange={(e) => setHold(e.target.checked)} /> Giữ pháp lý (không bao giờ tự xoá)
        </label>
        <div className="flex justify-end gap-1.5">
          <Button variant="ghost" onClick={onClose}>Huỷ</Button>
          <Button onClick={save} disabled={saving}>Lưu</Button>
        </div>
      </div>
    </div>
  );
}
