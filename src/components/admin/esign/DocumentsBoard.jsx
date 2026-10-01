import React, { useEffect, useMemo, useRef, useState } from "react";
import { Bell, CalendarPlus, Check, ChevronLeft, ChevronRight, Download, ExternalLink, FileText, RefreshCw, Search, ShieldCheck, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import {
  approveDocuments,
  extendDocumentDue,
  getDocumentPdfUrl,
  listDocumentEvents,
  listDocuments,
  remindDocuments,
  requeueDocumentPdf,
  revokeDocuments,
  watchDocumentsTable,
} from "@/lib/esignApi";
import { DOC_STATUS, EVENT_LABELS, STATUS_ORDER, canApprove, canExtend, canRemind, canRevoke, displayStatus } from "@/lib/esignStatus";
import { toCsv } from "@/lib/csv";
import { formatVnDateTime } from "@/shared/docLayout";
import { Button, DocStatusBadge, EmptyState, Field, Select, TextInput } from "./ui";

const PAGE_SIZE = 50;
const fmt = (iso) => (iso ? formatVnDateTime(iso).replace(" (GMT+7)", "") : "—");
const userLabel = (u) => u?.full_name || u?.name || u?.email || "";

/** Ngày (YYYY-MM-DD) giờ VN → ISO đầu/cuối ngày. */
const startOfDayVn = (d) => (d ? new Date(`${d}T00:00:00+07:00`).toISOString() : null);
const endOfDayVn = (d) => (d ? new Date(`${d}T23:59:59+07:00`).toISOString() : null);

function Modal({ title, children, onClose, footer }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="bg-white rounded-xl p-4 w-full max-w-sm space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-bold">{title}</p>
          <button type="button" onClick={onClose} aria-label="Đóng">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        {children}
        <div className="flex justify-end gap-1.5">{footer}</div>
      </div>
    </div>
  );
}

/** Hỏi lý do thu hồi / ngày hạn mới trước khi chạy thao tác hàng loạt. */
function ActionDialog({ action, count, onCancel, onConfirm }) {
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(() => new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
  const revoke = action === "revoke";
  const ok = revoke ? reason.trim().length > 0 : !!date;
  return (
    <Modal
      title={revoke ? `Thu hồi ${count} văn bản` : `Gia hạn ký ${count} văn bản`}
      onClose={onCancel}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Huỷ
          </Button>
          <Button variant={revoke ? "danger" : "primary"} disabled={!ok} onClick={() => onConfirm(revoke ? { reason: reason.trim() } : { dueAt: endOfDayVn(date) })}>
            {revoke ? "Thu hồi" : "Gia hạn"}
          </Button>
        </>
      }
    >
      {revoke ? (
        <Field label="Lý do thu hồi *" hint="Người nhận sẽ thấy lý do này trên văn bản.">
          <TextInput autoFocus value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder="VD: Phát hành nhầm, sẽ gửi bản thay thế" />
        </Field>
      ) : (
        <Field label="Hạn ký mới" hint="Văn bản đã hết hạn sẽ mở lại để ký; bộ đếm nhắc ký được đặt lại.">
          <TextInput type="date" value={date} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} />
        </Field>
      )}
    </Modal>
  );
}

function DocumentDrawer({ doc, user, template, onClose, onAction, busy }) {
  const [events, setEvents] = useState(null);

  useEffect(() => {
    setEvents(null);
    listDocumentEvents(doc.id)
      .then(setEvents)
      .catch(() => setEvents([]));
  }, [doc.id, doc.status, doc.first_viewed_at, doc.delivered_at, doc.signed_at, doc.pdf_status, doc.reminder_count, doc.due_at]);

  const openPdf = async () => {
    try {
      const { url } = await getDocumentPdfUrl(doc.id);
      window.location.assign(url);
    } catch (e) {
      toast.error(e.message || "Không tải được PDF");
    }
  };

  const rows = [
    ["Số văn bản", <span className="font-mono">{doc.doc_no || "—"}</span>],
    ["Người nhận", user ? `${userLabel(user)} · ${user.email || ""}` : doc.user_id],
    ["Mẫu", template?.name || "—"],
    ["Gửi lúc", fmt(doc.created_date)],
    ["Đã nhận", fmt(doc.delivered_at)],
    ["Xem lần đầu", fmt(doc.first_viewed_at)],
    ["Hạn ký", doc.due_at ? fmt(doc.due_at) : "Không đặt"],
    ["Đã ký", doc.signed_at ? `${fmt(doc.signed_at)} · ${doc.signer_name || ""}${doc.signed_ip ? ` · IP ${doc.signed_ip}` : ""}` : "—"],
    ["Nhắc ký", doc.reminder_count ? `${doc.reminder_count} lần, gần nhất ${fmt(doc.last_reminded_at)}` : "Chưa"],
    ["PDF", doc.pdf_status === "ready" ? `Sẵn sàng${doc.pdf_expires_at ? ` · lưu đến ${fmt(doc.pdf_expires_at).slice(9)}` : ""}` : doc.pdf_status || "—"],
  ];

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/20" role="dialog" aria-modal="true" aria-label="Chi tiết văn bản" onClick={onClose}>
      <aside className="w-full max-w-md h-full bg-white shadow-xl overflow-y-auto p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-[13.5px] font-bold text-gray-900 break-words">{doc.title}</p>
            <div className="mt-1">
              <DocStatusBadge doc={doc} />
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {doc.status === "revoked" && doc.revoked_reason && (
          <p className="text-[11px] p-2 rounded-lg bg-gray-100 text-gray-700">
            Lý do thu hồi: <b>{doc.revoked_reason}</b>
          </p>
        )}

        <dl className="grid grid-cols-[96px_1fr] gap-y-1 text-[11px]">
          {rows.map(([k, v]) => (
            <React.Fragment key={k}>
              <dt className="text-gray-500">{k}</dt>
              <dd className="text-gray-800 break-words">{v}</dd>
            </React.Fragment>
          ))}
        </dl>

        <div className="flex flex-wrap gap-1.5">
          <a
            href={`${import.meta.env.BASE_URL}document/${doc.id}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-[11.5px] font-semibold bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Xem văn bản
          </a>
          {doc.pdf_status === "ready" && (
            <Button variant="secondary" onClick={openPdf}>
              <Download className="w-3.5 h-3.5" /> PDF
            </Button>
          )}
          {doc.signed_at && ["failed", "none"].includes(doc.pdf_status) && (
            <Button variant="secondary" disabled={busy} onClick={() => onAction("repdf", [doc])}>
              <RefreshCw className="w-3.5 h-3.5" /> Tạo lại PDF
            </Button>
          )}
          {canRemind(doc) && (
            <Button variant="secondary" disabled={busy} onClick={() => onAction("remind", [doc])}>
              <Bell className="w-3.5 h-3.5" /> Nhắc ký
            </Button>
          )}
          {canExtend(doc) && (
            <Button variant="secondary" disabled={busy} onClick={() => onAction("extend", [doc])}>
              <CalendarPlus className="w-3.5 h-3.5" /> Gia hạn
            </Button>
          )}
          {canApprove(doc) && (
            <Button variant="secondary" disabled={busy} onClick={() => onAction("approve", [doc])}>
              <ShieldCheck className="w-3.5 h-3.5" /> Duyệt
            </Button>
          )}
          {canRevoke(doc) && (
            <Button variant="danger" disabled={busy} onClick={() => onAction("revoke", [doc])}>
              <Undo2 className="w-3.5 h-3.5" /> Thu hồi
            </Button>
          )}
        </div>

        <div>
          <p className="text-[11.5px] font-bold text-gray-800 mb-1.5">Nhật ký</p>
          {events === null ? (
            <p className="text-[11px] text-gray-400">Đang tải…</p>
          ) : events.length === 0 ? (
            <p className="text-[11px] text-gray-400">Chưa có sự kiện.</p>
          ) : (
            <ol className="relative border-l border-gray-200 ml-1.5 space-y-2">
              {events.map((e) => (
                <li key={e.id} className="pl-3 relative">
                  <span className="absolute -left-[5px] top-1 w-2 h-2 rounded-full bg-[#948154]" />
                  <p className="text-[11px] font-semibold text-gray-800">{EVENT_LABELS[e.event] || e.event}</p>
                  <p className="text-[10px] text-gray-500">
                    {fmt(e.created_at)}
                    {e.ip ? ` · IP ${e.ip}` : ""}
                    {e.data?.reason ? ` · ${e.data.reason}` : ""}
                    {e.data?.due_at ? ` · hạn mới ${fmt(e.data.due_at)}` : ""}
                    {e.data?.auto ? " · tự động" : ""}
                  </p>
                  {e.device?.screen && (
                    <p className="text-[9.5px] text-gray-400 truncate" title={e.device.ua || e.user_agent || ""}>
                      Thiết bị {e.device.screen} · {e.device.tz || ""}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      </aside>
    </div>
  );
}

/**
 * Bảng "Hợp đồng & Văn bản" (spec hợp đồng mục 2.5): mọi văn bản đã phát
 * hành, lọc theo trạng thái/mẫu/đợt/ngày/người nhận, thao tác hàng loạt và
 * ngăn chi tiết có nhật ký. Lọc + phân trang trên server, cập nhật realtime.
 */
export default function DocumentsBoard({ initialFilter }) {
  const [filters, setFilters] = useState(() => ({ status: "", templateId: "", campaignId: "", from: "", to: "", search: "", dueSoon: false, ...(initialFilter || {}) }));
  const [searchInput, setSearchInput] = useState(initialFilter?.search || "");
  const [page, setPage] = useState(0);
  const [data, setData] = useState({ rows: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(() => new Set());
  const [users, setUsers] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [drawerId, setDrawerId] = useState(initialFilter?.documentId || null);
  const [drawerDoc, setDrawerDoc] = useState(null);
  const [dialog, setDialog] = useState(null); // { action, docs }
  const [busy, setBusy] = useState(false);
  const reloadTimer = useRef(null);

  useEffect(() => {
    if (!initialFilter) return;
    setFilters((f) => ({ status: "", templateId: "", campaignId: "", from: "", to: "", search: "", dueSoon: false, ...f, ...initialFilter }));
    if (initialFilter.documentId) setDrawerId(initialFilter.documentId);
    setPage(0);
  }, [initialFilter]);

  useEffect(() => {
    Promise.all([
      base44.entities.User.list("-created_date", 1000),
      base44.entities.DocumentTemplate.list("-created_date", 500),
      base44.entities.DocumentCampaign.list("-created_date", 500),
    ])
      .then(([us, tpls, camps]) => {
        setUsers(us);
        setTemplates(tpls);
        setCampaigns(camps);
      })
      .catch(() => {});
  }, []);

  const usersById = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users]);
  const templatesById = useMemo(() => Object.fromEntries(templates.map((t) => [t.id, t])), [templates]);

  const query = useMemo(() => {
    const s = filters.search.trim().toLowerCase();
    const userIds = s
      ? users
          .filter((u) => `${u.full_name || ""} ${u.name || ""} ${u.email || ""} ${u.phone || ""} ${u.identifier || ""}`.toLowerCase().includes(s))
          .slice(0, 200)
          .map((u) => u.id)
      : undefined;
    return {
      status: filters.status || undefined,
      templateId: filters.templateId || undefined,
      campaignId: filters.campaignId || undefined,
      from: startOfDayVn(filters.from),
      to: endOfDayVn(filters.to),
      search: filters.search,
      userIds,
      dueSoon: filters.dueSoon,
    };
  }, [filters, users]);

  const load = async (p = page) => {
    try {
      const res = await listDocuments({ ...query, page: p, pageSize: PAGE_SIZE });
      setData(res);
      setSelected((sel) => new Set([...sel].filter((id) => res.rows.some((r) => r.id === id))));
    } catch (e) {
      toast.error(`Không tải được văn bản: ${e.message || e}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    load(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, page]);

  // Ô tìm kiếm: chờ ngừng gõ rồi mới lọc.
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => (f.search === searchInput ? f : { ...f, search: searchInput }));
      setPage(0);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    const unsub = watchDocumentsTable(() => {
      clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(() => loadRef.current(), 1200);
    });
    return () => {
      clearTimeout(reloadTimer.current);
      unsub();
    };
  }, []);

  // Ngăn chi tiết: lấy từ trang hiện tại, hoặc tải riêng (mở từ Tổng quan).
  useEffect(() => {
    if (!drawerId) {
      setDrawerDoc(null);
      return;
    }
    const inPage = data.rows.find((r) => r.id === drawerId);
    if (inPage) {
      setDrawerDoc(inPage);
      return;
    }
    listDocuments({ ids: [drawerId], pageSize: 1 })
      .then((res) => setDrawerDoc(res.rows[0] || null))
      .catch(() => setDrawerDoc(null));
  }, [drawerId, data.rows]);

  const setFilter = (patch) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(0);
  };

  const rows = data.rows;
  const selectedDocs = rows.filter((r) => selected.has(r.id));
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  const toggle = (id) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const perform = async (action, docs, extra = {}) => {
    const pick = {
      remind: canRemind,
      extend: canExtend,
      revoke: canRevoke,
      approve: canApprove,
      reject: canApprove,
      repdf: () => true,
    }[action];
    const ids = docs.filter(pick).map((d) => d.id);
    if (!ids.length) {
      toast.error("Không có văn bản phù hợp với thao tác này");
      return;
    }
    if ((action === "extend" || action === "revoke") && !extra.reason && !extra.dueAt) {
      setDialog({ action, docs });
      return;
    }
    if (action === "reject" && !window.confirm(`Từ chối ${ids.length} văn bản đã ký?`)) return;
    setBusy(true);
    try {
      let n;
      if (action === "remind") n = await remindDocuments(ids);
      else if (action === "extend") n = await extendDocumentDue(ids, extra.dueAt);
      else if (action === "revoke") n = await revokeDocuments(ids, extra.reason);
      else if (action === "approve") n = await approveDocuments(ids, "approved");
      else if (action === "reject") n = await approveDocuments(ids, "rejected");
      else if (action === "repdf") {
        await requeueDocumentPdf(ids[0]);
        n = 1;
      }
      const verb = { remind: "Đã nhắc", extend: "Đã gia hạn", revoke: "Đã thu hồi", approve: "Đã duyệt", reject: "Đã từ chối", repdf: "Đã xếp hàng tạo lại PDF cho" }[action];
      toast.success(`${verb} ${n ?? 0} văn bản${ids.length > (n ?? 0) && action === "remind" ? ` (bỏ qua ${ids.length - n} văn bản không cần ký)` : ""}`);
      setDialog(null);
      setSelected(new Set());
      load();
    } catch (e) {
      toast.error(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = async () => {
    try {
      const res = await listDocuments({ ...query, page: 0, pageSize: 5000 });
      const out = [["Số VB", "Tiêu đề", "Người nhận", "Email", "Mẫu", "Trạng thái", "Gửi lúc", "Đã nhận", "Đã xem", "Hạn ký", "Đã ký", "Người ký", "IP", "Số lần nhắc", "Lý do thu hồi"]];
      for (const d of res.rows) {
        const u = usersById[d.user_id];
        out.push([
          d.doc_no,
          d.title,
          userLabel(u) || d.user_id,
          u?.email || "",
          templatesById[d.template_id]?.name || "",
          DOC_STATUS[displayStatus(d)]?.label || d.status,
          fmt(d.created_date),
          fmt(d.delivered_at),
          fmt(d.first_viewed_at),
          d.due_at ? fmt(d.due_at) : "",
          fmt(d.signed_at),
          d.signer_name || "",
          d.signed_ip || "",
          d.reminder_count || 0,
          d.revoked_reason || "",
        ]);
      }
      const blob = new Blob([toCsv(out)], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `van-ban-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      if (res.total > res.rows.length) toast.message(`Đã xuất ${res.rows.length}/${res.total} văn bản đầu tiên`);
    } catch (e) {
      toast.error(`Không xuất được CSV: ${e.message || e}`);
    }
  };

  const hasFilter = filters.status || filters.templateId || filters.campaignId || filters.from || filters.to || filters.search || filters.dueSoon;

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-2">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <TextInput value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Tìm số văn bản, tiêu đề, tên/email người nhận" className="pl-8" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <Select value={filters.status} onChange={(e) => setFilter({ status: e.target.value, dueSoon: false })} aria-label="Trạng thái">
            <option value="">Mọi trạng thái</option>
            <option value="open">Chưa ký (còn mở)</option>
            {STATUS_ORDER.map((k) => (
              <option key={k} value={k}>
                {DOC_STATUS[k].label}
              </option>
            ))}
          </Select>
          <Select value={filters.templateId} onChange={(e) => setFilter({ templateId: e.target.value })} aria-label="Mẫu">
            <option value="">Mọi mẫu</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
          <Select value={filters.campaignId} onChange={(e) => setFilter({ campaignId: e.target.value })} aria-label="Đợt phát hành">
            <option value="">Mọi đợt</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title || c.id}
              </option>
            ))}
          </Select>
          <TextInput type="date" value={filters.from} onChange={(e) => setFilter({ from: e.target.value })} aria-label="Gửi từ ngày" title="Gửi từ ngày" />
          <TextInput type="date" value={filters.to} onChange={(e) => setFilter({ to: e.target.value })} aria-label="Gửi đến ngày" title="Gửi đến ngày" />
        </div>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-[11px] text-gray-500">
            {loading ? "Đang tải…" : `${data.total} văn bản`}
            {filters.dueSoon && <span className="ml-1 text-amber-700">· sắp hết hạn trong 48 giờ</span>}
          </p>
          <div className="flex gap-1.5">
            {hasFilter && (
              <Button
                variant="ghost"
                onClick={() => {
                  setSearchInput("");
                  setFilter({ status: "", templateId: "", campaignId: "", from: "", to: "", search: "", dueSoon: false });
                }}
              >
                Xoá lọc
              </Button>
            )}
            <Button variant="secondary" onClick={exportCsv} disabled={!data.total}>
              <Download className="w-3.5 h-3.5" /> CSV
            </Button>
          </div>
        </div>
      </div>

      {selectedDocs.length > 0 && (
        <div className="sticky top-0 z-10 flex items-center gap-1.5 flex-wrap bg-[#948154]/10 border border-[#948154]/30 rounded-xl p-2">
          <span className="text-[11.5px] font-semibold text-[#7d6c45] mr-1">Đã chọn {selectedDocs.length}</span>
          <Button variant="secondary" disabled={busy || !selectedDocs.some(canRemind)} onClick={() => perform("remind", selectedDocs)}>
            <Bell className="w-3.5 h-3.5" /> Nhắc ký
          </Button>
          <Button variant="secondary" disabled={busy || !selectedDocs.some(canExtend)} onClick={() => perform("extend", selectedDocs)}>
            <CalendarPlus className="w-3.5 h-3.5" /> Gia hạn
          </Button>
          <Button variant="secondary" disabled={busy || !selectedDocs.some(canApprove)} onClick={() => perform("approve", selectedDocs)}>
            <ShieldCheck className="w-3.5 h-3.5" /> Duyệt
          </Button>
          <Button variant="secondary" disabled={busy || !selectedDocs.some(canApprove)} onClick={() => perform("reject", selectedDocs)}>
            <X className="w-3.5 h-3.5" /> Từ chối
          </Button>
          <Button variant="danger" disabled={busy || !selectedDocs.some(canRevoke)} onClick={() => perform("revoke", selectedDocs)}>
            <Undo2 className="w-3.5 h-3.5" /> Thu hồi
          </Button>
          <Button variant="ghost" onClick={() => setSelected(new Set())}>
            Bỏ chọn
          </Button>
        </div>
      )}

      {!loading && rows.length === 0 ? (
        <EmptyState icon={FileText} title="Không có văn bản" description={hasFilter ? "Thử bỏ bớt điều kiện lọc." : "Văn bản phát hành sẽ hiện ở đây."} />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="px-2 py-1.5 w-8">
                  <input
                    type="checkbox"
                    aria-label="Chọn tất cả"
                    checked={allChecked}
                    onChange={() => setSelected(allChecked ? new Set() : new Set(rows.map((r) => r.id)))}
                  />
                </th>
                <th className="px-2 py-1.5 font-semibold">Văn bản</th>
                <th className="px-2 py-1.5 font-semibold">Người nhận</th>
                <th className="px-2 py-1.5 font-semibold">Trạng thái</th>
                <th className="px-2 py-1.5 font-semibold">Gửi lúc</th>
                <th className="px-2 py-1.5 font-semibold">Hạn ký</th>
                <th className="px-2 py-1.5 font-semibold">Ký lúc</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((d) => {
                const u = usersById[d.user_id];
                const st = displayStatus(d);
                const dueSoon = d.status === "pending" && d.due_at && st !== "expired" && new Date(d.due_at) - Date.now() < 48 * 3600 * 1000;
                return (
                  <tr key={d.id} className={`hover:bg-gray-50 cursor-pointer ${selected.has(d.id) ? "bg-[#948154]/5" : ""}`} onClick={() => setDrawerId(d.id)}>
                    <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" aria-label={`Chọn ${d.doc_no || d.title}`} checked={selected.has(d.id)} onChange={() => toggle(d.id)} />
                    </td>
                    <td className="px-2 py-1.5 max-w-[220px]">
                      <span className="font-semibold text-gray-800 block truncate">{d.title}</span>
                      <span className="block text-[9.5px] text-gray-400 font-mono">{d.doc_no}</span>
                    </td>
                    <td className="px-2 py-1.5">
                      <span className="text-gray-800">{userLabel(u) || "—"}</span>
                      {u?.email && <span className="block text-[9.5px] text-gray-400">{u.email}</span>}
                    </td>
                    <td className="px-2 py-1.5">
                      <DocStatusBadge status={st} />
                      {d.reminder_count > 0 && st !== "signed" && <span className="block text-[9.5px] text-gray-400">Nhắc {d.reminder_count} lần</span>}
                    </td>
                    <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap">{fmt(d.created_date)}</td>
                    <td className={`px-2 py-1.5 whitespace-nowrap ${dueSoon ? "text-amber-700 font-semibold" : "text-gray-600"}`}>{d.due_at ? fmt(d.due_at).slice(9) : "—"}</td>
                    <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap">
                      {d.signed_at ? (
                        <>
                          <Check className="inline w-3 h-3 text-emerald-600" /> {fmt(d.signed_at)}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label="Trang trước">
            <ChevronLeft className="w-3.5 h-3.5" />
          </Button>
          <span className="text-[11px] text-gray-600">
            Trang {page + 1}/{pages}
          </span>
          <Button variant="secondary" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)} aria-label="Trang sau">
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}

      {drawerDoc && (
        <DocumentDrawer
          doc={drawerDoc}
          user={usersById[drawerDoc.user_id]}
          template={templatesById[drawerDoc.template_id]}
          busy={busy}
          onClose={() => setDrawerId(null)}
          onAction={(action, docs) => perform(action, docs)}
        />
      )}

      {dialog && (
        <ActionDialog
          action={dialog.action}
          count={dialog.docs.filter(dialog.action === "revoke" ? canRevoke : canExtend).length}
          onCancel={() => setDialog(null)}
          onConfirm={(extra) => perform(dialog.action, dialog.docs, extra)}
        />
      )}
    </div>
  );
}
