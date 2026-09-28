import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Filter, Plus, Search, Trash2, Upload, Users } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { addGroupMembers, importGroupMembers, listGroupMembers, previewGroup, removeGroupMembers } from "@/lib/esignApi";
import { parseIdentifierCsv } from "@/lib/csv";
import { Badge, Button, EmptyState, Field, Section, TextInput, Toggle } from "./ui";

const COLORS = ["#948154", "#1a3c8f", "#0f766e", "#b91c1c", "#7c3aed", "#ea580c"];

function useUserOptions() {
  const [users, setUsers] = useState([]);
  useEffect(() => {
    base44.entities.User.list("-created_date", 1000).then(setUsers).catch(() => {});
  }, []);
  const tiers = useMemo(() => [...new Set(users.map((u) => u.membership_tier).filter(Boolean))].sort(), [users]);
  const vips = useMemo(() => [...new Set(users.map((u) => u.vip_level).filter(Boolean))].sort(), [users]);
  return { users, tiers, vips };
}

/** Danh sách + tạo/sửa nhóm người dùng (spec 6.5). */
export default function UserGroupsManager() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState("");

  const load = () =>
    base44.entities.UserGroup.list("-created_date", 500)
      .then(setGroups)
      .catch(() => toast.error("Không tải được danh sách nhóm"))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
    const unsub = base44.entities.UserGroup.subscribe(() => load());
    return () => unsub?.();
  }, []);

  if (editing) {
    return (
      <GroupEditor
        group={editing.group}
        onClose={() => {
          setEditing(null);
          load();
        }}
      />
    );
  }

  const shown = groups.filter((g) => `${g.name} ${g.description}`.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm nhóm" className="pl-8" />
        </div>
        <Button onClick={() => setEditing({ group: null })}>
          <Plus className="w-3.5 h-3.5" /> Tạo nhóm
        </Button>
      </div>
      {loading ? (
        <p className="text-[11px] text-gray-400 py-6 text-center">Đang tải…</p>
      ) : shown.length === 0 ? (
        <EmptyState icon={Users} title="Chưa có nhóm" description="Nhóm tĩnh: chọn tay hoặc nhập CSV. Nhóm động: tự cập nhật theo hạng/VIP/ngày tham gia." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {shown.map((g) => (
            <button key={g.id} type="button" onClick={() => setEditing({ group: g })} className="text-left bg-white rounded-xl border border-gray-200 p-3 hover:border-[#948154]">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: g.color }} />
                <span className="text-[12.5px] font-bold text-gray-900 truncate">{g.name}</span>
                <Badge color={g.kind === "dynamic" ? "blue" : "gray"}>{g.kind === "dynamic" ? "Động" : "Tĩnh"}</Badge>
              </div>
              <p className="text-[10.5px] text-gray-500 mt-1 line-clamp-2">{g.description || "—"}</p>
              <p className="text-[10.5px] text-gray-700 mt-1 font-semibold">{g.member_count ?? 0} thành viên</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function GroupEditor({ group, onClose }) {
  const { user: adminUser } = useAuth();
  const { users, tiers, vips } = useUserOptions();
  const [form, setForm] = useState({
    name: group?.name || "",
    description: group?.description || "",
    color: group?.color || COLORS[0],
    kind: group?.kind || "static",
    filters: { membership_tier: [], vip_level: [], exclude_locked: true, created_from: "", created_to: "", ...(group?.filters || {}) },
  });
  const [groupId, setGroupId] = useState(group?.id || null);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(null);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const setFilter = (patch) => setForm((f) => ({ ...f, filters: { ...f.filters, ...patch } }));

  // Xem trước nhóm động (debounce).
  useEffect(() => {
    if (form.kind !== "dynamic") return undefined;
    const t = setTimeout(() => {
      previewGroup(form.filters)
        .then(setPreview)
        .catch((e) => toast.error(`Không xem trước được: ${e.message}`));
    }, 350);
    return () => clearTimeout(t);
  }, [form.kind, form.filters]);

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Vui lòng đặt tên nhóm");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description,
        color: form.color,
        kind: form.kind,
        filters: form.kind === "dynamic" ? form.filters : {},
        updated_date: new Date().toISOString(),
        ...(form.kind === "dynamic" && preview ? { member_count: preview.count } : {}),
      };
      if (groupId) {
        await base44.entities.UserGroup.update(groupId, payload);
      } else {
        const created = await base44.entities.UserGroup.create({ ...payload, created_by: adminUser?.email || null });
        setGroupId(created?.id || null);
      }
      toast.success("Đã lưu nhóm");
      if (form.kind === "dynamic" || groupId) onClose();
    } catch (e) {
      toast.error(/duplicate|unique/i.test(e.message || "") ? "Tên nhóm đã tồn tại" : `Lưu thất bại: ${e.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!groupId || !window.confirm(`Xoá nhóm "${form.name}"? Văn bản đã phát hành cho nhóm không bị ảnh hưởng.`)) return;
    try {
      await base44.entities.UserGroup.delete(groupId);
      toast.success("Đã xoá nhóm");
      onClose();
    } catch (e) {
      toast.error(`Xoá thất bại: ${e.message || e}`);
    }
  };

  const toggleIn = (key, value) => {
    const list = form.filters[key] || [];
    setFilter({ [key]: list.includes(value) ? list.filter((x) => x !== value) : [...list, value] });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" onClick={onClose}>
          <ArrowLeft className="w-3.5 h-3.5" /> Danh sách nhóm
        </Button>
        <div className="flex gap-1.5">
          {groupId && (
            <Button variant="danger" onClick={remove}>
              <Trash2 className="w-3.5 h-3.5" /> Xoá
            </Button>
          )}
          <Button onClick={save} disabled={saving}>{groupId ? "Lưu" : "Tạo nhóm"}</Button>
        </div>
      </div>

      <Section title="Thông tin nhóm">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Field label="Tên nhóm">
            <TextInput value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Khách VIP Hà Nội" />
          </Field>
          <Field label="Màu">
            <div className="flex gap-1.5 h-9 items-center">
              {COLORS.map((c) => (
                <button key={c} type="button" onClick={() => set({ color: c })} aria-label={`Màu ${c}`} className={`w-6 h-6 rounded-full border-2 ${form.color === c ? "border-gray-900" : "border-white"}`} style={{ background: c }} />
              ))}
            </div>
          </Field>
        </div>
        <Field label="Mô tả">
          <TextInput value={form.description} onChange={(e) => set({ description: e.target.value })} />
        </Field>
        {!groupId && (
          <div className="flex gap-2">
            {[
              ["static", "Nhóm tĩnh", "Chọn tay hoặc nhập CSV"],
              ["dynamic", "Nhóm động", "Tự khớp theo bộ lọc lúc phát hành"],
            ].map(([k, label, desc]) => (
              <button key={k} type="button" onClick={() => set({ kind: k })} className={`flex-1 text-left p-2 rounded-lg border ${form.kind === k ? "border-[#948154] bg-[#948154]/10" : "border-gray-200"}`}>
                <span className="block text-[11.5px] font-semibold">{label}</span>
                <span className="block text-[10px] text-gray-500">{desc}</span>
              </button>
            ))}
          </div>
        )}
      </Section>

      {form.kind === "dynamic" ? (
        <Section title="Bộ lọc" description="Nhóm động được tính lại tại thời điểm phát hành. Tài khoản Admin luôn bị loại.">
          <Field label="Hạng thành viên (bỏ trống = tất cả)">
            <div className="flex flex-wrap gap-1.5">
              {tiers.map((t) => (
                <button key={t} type="button" onClick={() => toggleIn("membership_tier", t)} className={`px-2 py-1 rounded-full text-[10.5px] border ${form.filters.membership_tier?.includes(t) ? "bg-[#948154] text-white border-[#948154]" : "border-gray-300 text-gray-600"}`}>
                  {t}
                </button>
              ))}
              {tiers.length === 0 && <span className="text-[10.5px] text-gray-400">Chưa có dữ liệu hạng</span>}
            </div>
          </Field>
          <Field label="Cấp VIP (bỏ trống = tất cả)">
            <div className="flex flex-wrap gap-1.5">
              {vips.map((t) => (
                <button key={t} type="button" onClick={() => toggleIn("vip_level", t)} className={`px-2 py-1 rounded-full text-[10.5px] border ${form.filters.vip_level?.includes(t) ? "bg-[#948154] text-white border-[#948154]" : "border-gray-300 text-gray-600"}`}>
                  {t}
                </button>
              ))}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Tham gia từ ngày">
              <TextInput type="date" value={form.filters.created_from || ""} onChange={(e) => setFilter({ created_from: e.target.value })} />
            </Field>
            <Field label="Đến ngày">
              <TextInput type="date" value={form.filters.created_to || ""} onChange={(e) => setFilter({ created_to: e.target.value })} />
            </Field>
          </div>
          <Toggle checked={form.filters.exclude_locked !== false} onChange={(v) => setFilter({ exclude_locked: v })} label="Bỏ tài khoản bị khoá" />
          <div className="rounded-lg bg-gray-50 border border-gray-200 p-2">
            <p className="text-[11.5px] font-semibold text-gray-800">
              <Filter className="w-3.5 h-3.5 inline mr-1" />
              Hiện có {preview ? preview.count : "…"} người khớp
            </p>
            <ul className="mt-1 text-[10.5px] text-gray-600 space-y-0.5 max-h-40 overflow-y-auto">
              {(preview?.sample || []).map((u) => (
                <li key={u.id}>
                  {u.full_name || "—"} <span className="text-gray-400">· {u.email} · {u.membership_tier}</span>
                </li>
              ))}
            </ul>
          </div>
        </Section>
      ) : groupId ? (
        <StaticMembers groupId={groupId} users={users} addedBy={adminUser?.id} />
      ) : (
        <p className="text-[11px] text-gray-500 px-1">Bấm "Tạo nhóm" để lưu rồi thêm thành viên.</p>
      )}
    </div>
  );
}

function StaticMembers({ groupId, users, addedBy }) {
  const [data, setData] = useState({ rows: [], total: 0 });
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState([]);
  const [addQuery, setAddQuery] = useState("");
  const [picked, setPicked] = useState([]);
  const [importResult, setImportResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const PAGE = 50;

  const load = () =>
    listGroupMembers(groupId, { search, page, pageSize: PAGE })
      .then(setData)
      .catch((e) => toast.error(`Không tải được thành viên: ${e.message}`));

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, search, page]);

  const memberIds = new Set(data.rows.map((r) => r.user_id));
  const candidates = useMemo(() => {
    const s = addQuery.trim().toLowerCase();
    if (!s) return [];
    return users
      .filter((u) => `${u.full_name || ""} ${u.name || ""} ${u.email || ""} ${u.phone || ""} ${u.identifier || ""}`.toLowerCase().includes(s))
      .slice(0, 12);
  }, [addQuery, users]);

  const addPicked = async () => {
    setBusy(true);
    try {
      await addGroupMembers(groupId, picked, addedBy);
      toast.success(`Đã thêm ${picked.length} người`);
      setPicked([]);
      setAddQuery("");
      load();
    } catch (e) {
      toast.error(`Thêm thất bại: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const removeSelected = async () => {
    if (!selected.length || !window.confirm(`Xoá ${selected.length} người khỏi nhóm?`)) return;
    setBusy(true);
    try {
      await removeGroupMembers(groupId, selected);
      setSelected([]);
      load();
    } catch (e) {
      toast.error(`Xoá thất bại: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const onCsv = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const ids = parseIdentifierCsv(await file.text());
    if (!ids.length) {
      toast.error("File không có dòng nào");
      return;
    }
    setBusy(true);
    try {
      const res = await importGroupMembers(groupId, ids);
      setImportResult({ ...res, total: ids.length });
      load();
    } catch (err) {
      toast.error(`Import thất bại: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      title={`Thành viên (${data.total})`}
      actions={
        <label className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-[11.5px] font-semibold bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 cursor-pointer">
          <Upload className="w-3.5 h-3.5" /> Nhập CSV
          <input type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={onCsv} disabled={busy} />
        </label>
      }
    >
      {importResult && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 text-[10.5px] text-gray-700">
          <p>
            Đã đọc {importResult.total} dòng: <b className="text-green-700">{importResult.added} thêm mới</b>, {importResult.duplicated} đã có trong nhóm,{" "}
            <b className="text-red-600">{importResult.not_found.length} không tìm thấy</b>.
          </p>
          {importResult.not_found.length > 0 && <p className="mt-1 text-red-600 break-all">{importResult.not_found.slice(0, 30).join(", ")}{importResult.not_found.length > 30 ? "…" : ""}</p>}
          <button type="button" className="mt-1 text-[10px] underline text-gray-500" onClick={() => setImportResult(null)}>Đóng</button>
        </div>
      )}
      <p className="text-[10px] text-gray-400">CSV: cột đầu tiên là email, mã hội viên, số điện thoại hoặc user id - mỗi dòng một người.</p>

      <div className="rounded-lg border border-dashed border-gray-300 p-2 space-y-2">
        <TextInput value={addQuery} onChange={(e) => setAddQuery(e.target.value)} placeholder="Thêm thành viên: tìm theo tên, email, SĐT, mã hội viên" />
        {candidates.length > 0 && (
          <div className="max-h-48 overflow-y-auto divide-y divide-gray-100">
            {candidates.map((u) => (
              <label key={u.id} className="flex items-center gap-2 py-1.5 text-[11px]">
                <input
                  type="checkbox"
                  disabled={memberIds.has(u.id)}
                  checked={picked.includes(u.id)}
                  onChange={(e) => setPicked((p) => (e.target.checked ? [...p, u.id] : p.filter((x) => x !== u.id)))}
                />
                <span className="flex-1">
                  <b>{u.full_name || u.name}</b> <span className="text-gray-400">{u.email}</span>
                </span>
                {memberIds.has(u.id) && <Badge>Đã có</Badge>}
              </label>
            ))}
          </div>
        )}
        {picked.length > 0 && (
          <Button onClick={addPicked} disabled={busy}>
            <Plus className="w-3.5 h-3.5" /> Thêm {picked.length} người
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <TextInput
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="Tìm trong nhóm"
            className="pl-8"
          />
        </div>
        {selected.length > 0 && (
          <Button variant="danger" onClick={removeSelected} disabled={busy}>
            <Trash2 className="w-3.5 h-3.5" /> Xoá {selected.length}
          </Button>
        )}
      </div>

      <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
        {data.rows.map((r) => (
          <label key={r.user_id} className="flex items-center gap-2 px-2 py-1.5 text-[11px]">
            <input type="checkbox" checked={selected.includes(r.user_id)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, r.user_id] : s.filter((x) => x !== r.user_id)))} />
            <span className="flex-1 min-w-0 truncate">
              <b>{r.users?.full_name || r.users?.name || r.user_id}</b> <span className="text-gray-400">{r.users?.email} · {r.users?.membership_tier}</span>
            </span>
          </label>
        ))}
        {data.rows.length === 0 && <p className="px-2 py-4 text-center text-[11px] text-gray-400">Chưa có thành viên</p>}
      </div>
      {data.total > PAGE && (
        <div className="flex items-center justify-end gap-2 text-[11px]">
          <Button variant="ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Trước</Button>
          <span>
            Trang {page + 1}/{Math.ceil(data.total / PAGE)}
          </span>
          <Button variant="ghost" disabled={(page + 1) * PAGE >= data.total} onClick={() => setPage((p) => p + 1)}>Sau</Button>
        </div>
      )}
    </Section>
  );
}
