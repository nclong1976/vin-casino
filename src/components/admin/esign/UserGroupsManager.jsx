import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Plus, Search, Trash2, Upload, Users } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { addGroupMembers, countAudience, importGroupMembers, listGroupMembers, removeGroupMembers } from "@/lib/esignApi";
import { parseIdentifierCsv } from "@/lib/csv";
import { Badge, Button, EmptyState, Field, Section, TextInput } from "./ui";
import AudienceFilters, { EMPTY_FILTERS, cleanFilters } from "./AudienceFilters";

const COLORS = ["#948154", "#1a3c8f", "#0f766e", "#b91c1c", "#7c3aed", "#ea580c"];

/** Hội viên + danh sách hạng/VIP/dự án cho bộ lọc người nhận. */
export function useUserOptions() {
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  useEffect(() => {
    base44.entities.User.list("-created_date", 1000).then(setUsers).catch(() => {});
    base44.entities.Project.list("-created_date", 500).then(setProjects).catch(() => {});
  }, []);
  const tiers = useMemo(() => [...new Set(users.map((u) => u.membership_tier).filter(Boolean))].sort(), [users]);
  const vips = useMemo(() => [...new Set(users.map((u) => u.vip_level).filter(Boolean))].sort(), [users]);
  return { users, tiers, vips, projects };
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
  const { users, tiers, vips, projects } = useUserOptions();
  const [form, setForm] = useState({
    name: group?.name || "",
    description: group?.description || "",
    color: group?.color || COLORS[0],
    kind: group?.kind || "static",
    filters: { ...EMPTY_FILTERS, ...(group?.filters || {}) },
  });
  const [groupId, setGroupId] = useState(group?.id || null);
  const [saving, setSaving] = useState(false);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

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
        filters: form.kind === "dynamic" ? cleanFilters(form.filters) : {},
        updated_date: new Date().toISOString(),
        ...(form.kind === "dynamic" ? { member_count: await countAudience({ type: "filter", filters: cleanFilters(form.filters) }).catch(() => 0) } : {}),
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
          <AudienceFilters filters={form.filters} onChange={(filters) => set({ filters })} tiers={tiers} vips={vips} projects={projects} />
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
