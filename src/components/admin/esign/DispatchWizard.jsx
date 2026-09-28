import React, { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, FileText, Loader2, Search, Send, Upload, Users, X } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { countAudience, invokeDispatch } from "@/lib/esignApi";
import { parseCsv } from "@/lib/csv";
import { findMissingRequired, normalizeVariableKey } from "@/shared/docLayout";
import LetterheadRenderer from "@/components/documents/LetterheadRenderer";
import QuillBodyEditor from "./QuillBodyEditor";
import RetentionSelect, { retentionLabel } from "./RetentionSelect";
import { usePublishedPreview } from "./preview";
import { Badge, Button, EmptyState, Field, Section, TextInput, Toggle } from "./ui";

const STEPS = ["Chọn mẫu", "Nội dung", "Người nhận", "Xem lại & gửi"];
const CONFIRM_THRESHOLD = 50;

function userLabel(u) {
  return u?.full_name || u?.name || u?.email || u?.id;
}

/** Ngày (YYYY-MM-DD) → cuối ngày giờ VN, ISO. */
function endOfDayVn(date) {
  return date ? new Date(`${date}T23:59:59+07:00`).toISOString() : null;
}

function UserSearch({ users, onPick, excludeIds = [], placeholder = "Tìm theo tên, email, SĐT, mã hội viên" }) {
  const [q, setQ] = useState("");
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return users
      .filter((u) => !excludeIds.includes(u.id))
      .filter((u) => `${u.full_name || ""} ${u.name || ""} ${u.email || ""} ${u.phone || ""} ${u.identifier || ""}`.toLowerCase().includes(s))
      .slice(0, 8);
  }, [q, users, excludeIds]);
  return (
    <div className="relative">
      <Search className="w-3.5 h-3.5 absolute left-2.5 top-[18px] -translate-y-1/2 text-gray-400" />
      <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className="pl-8" />
      {matches.length > 0 && (
        <div className="absolute z-20 mt-1 w-full bg-white rounded-lg shadow-lg border border-gray-200 py-1">
          {matches.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => {
                onPick(u);
                setQ("");
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-[11px]"
            >
              <b>{userLabel(u)}</b> <span className="text-gray-400">{u.email} · {u.membership_tier}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function VariableInput({ def, value, onChange, docKey }) {
  switch (def.type) {
    case "richtext":
      return <QuillBodyEditor docKey={docKey} initialDelta={value || { ops: [] }} onChange={onChange} variables={[]} />;
    case "date":
      return <TextInput type="date" value={value || ""} onChange={(e) => onChange(e.target.value)} />;
    case "money":
      return (
        <TextInput
          inputMode="numeric"
          value={value ? Number(String(value).replace(/\D/g, "")).toLocaleString("vi-VN") : ""}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
          placeholder="0"
        />
      );
    case "number":
      return <TextInput type="number" value={value ?? ""} onChange={(e) => onChange(e.target.value)} />;
    default:
      return <TextInput value={value || ""} onChange={(e) => onChange(e.target.value)} />;
  }
}

/** Wizard phát hành 4 bước (spec 6.3). */
export default function DispatchWizard({ initialTemplateId, onDispatched }) {
  const { user: adminUser } = useAuth();
  const [step, setStep] = useState(0);
  const [templates, setTemplates] = useState([]);
  const [letterheads, setLetterheads] = useState([]);
  const [groups, setGroups] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [templateId, setTemplateId] = useState(initialTemplateId || null);
  const [title, setTitle] = useState("");
  const [campaignValues, setCampaignValues] = useState({});
  const [dueDate, setDueDate] = useState("");

  const [mode, setMode] = useState("one"); // one | groups | all
  const [singleUser, setSingleUser] = useState(null);
  const [groupIds, setGroupIds] = useState([]);
  const [includeUsers, setIncludeUsers] = useState([]);
  const [excludeUsers, setExcludeUsers] = useState([]);
  const [excludeLocked, setExcludeLocked] = useState(true);
  const [perRecipient, setPerRecipient] = useState({}); // userId -> values
  const [csvReport, setCsvReport] = useState(null);
  const [count, setCount] = useState(null);

  const [retention, setRetention] = useState(null);
  const [scheduleMode, setScheduleMode] = useState("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [sending, setSending] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);

  useEffect(() => {
    Promise.all([
      base44.entities.DocumentTemplate.filter({ status: "published" }, "-created_date", 200),
      base44.entities.DocumentLetterhead.list("-created_date", 100),
      base44.entities.UserGroup.list("-created_date", 500),
      base44.entities.User.list("-created_date", 1000),
    ])
      .then(([tpls, lhs, grps, us]) => {
        setTemplates(tpls.filter((t) => t.body_delta?.ops?.length > 0));
        setLetterheads(lhs);
        setGroups(grps);
        setUsers(us);
      })
      .catch(() => toast.error("Không tải được dữ liệu phát hành"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (initialTemplateId) {
      setTemplateId(initialTemplateId);
      setStep(1);
    }
  }, [initialTemplateId]);

  const template = templates.find((t) => t.id === templateId) || null;
  const letterhead = template ? letterheads.find((l) => l.id === template.letterhead_id) || letterheads.find((l) => l.is_default) || null : null;
  const variables = useMemo(() => (template?.variables || []).map((v) => ({ ...v, key: normalizeVariableKey(v.key) })), [template]);
  const campaignVars = variables.filter((v) => (v.scope || "campaign") === "campaign");
  const recipientVars = variables.filter((v) => v.scope === "recipient");

  useEffect(() => {
    if (template && !title) {
      setTitle(`${template.name} - ${new Date().toLocaleDateString("vi-VN")}`);
    }
  }, [template, title]);

  const audience = useMemo(() => {
    const per = Object.keys(perRecipient).length ? { per_recipient_values: perRecipient } : {};
    if (mode === "one") return singleUser ? { type: "user", user_ids: [singleUser.id], ...per } : null;
    if (mode === "groups")
      return groupIds.length || includeUsers.length
        ? { type: "groups", group_ids: groupIds, include_user_ids: includeUsers.map((u) => u.id), exclude_user_ids: excludeUsers.map((u) => u.id), ...per }
        : null;
    return { type: "all", exclude_locked: excludeLocked, ...per };
  }, [mode, singleUser, groupIds, includeUsers, excludeUsers, excludeLocked, perRecipient]);

  const audienceKey = JSON.stringify(audience ? { ...audience, per_recipient_values: undefined } : null);
  useEffect(() => {
    if (!audience) {
      setCount(0);
      return undefined;
    }
    setCount(null);
    const t = setTimeout(() => {
      countAudience({ ...audience, per_recipient_values: undefined })
        .then(setCount)
        .catch((e) => {
          setCount(null);
          toast.error(`Không đếm được người nhận: ${e.message}`);
        });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audienceKey]);

  // Người để xem thử ở bước cuối: người được chọn/thêm tay trước, rồi vài hội viên bất kỳ.
  const previewPeople = useMemo(() => {
    if (mode === "one") return singleUser ? [singleUser] : [];
    const pool = [...includeUsers, ...users.filter((u) => u.role !== "admin" && !excludeUsers.some((x) => x.id === u.id))];
    const seen = new Set();
    return pool.filter((u) => !seen.has(u.id) && seen.add(u.id)).slice(0, 3);
  }, [mode, singleUser, includeUsers, users, excludeUsers]);
  const previewPerson = previewPeople[previewIndex] || previewPeople[0] || null;

  const { preview } = usePublishedPreview({
    template: step >= 3 ? template : null,
    letterhead,
    recipient: previewPerson,
    campaignValues,
    recipientValues: previewPerson ? perRecipient[previewPerson.id] : undefined,
    dueAt: endOfDayVn(dueDate),
  });

  const missingCampaign = template ? findMissingRequired({ definitions: campaignVars, campaignValues }) : [];
  const missingRecipient = mode === "one" && singleUser ? findMissingRequired({ definitions: recipientVars, recipientValues: perRecipient[singleUser.id] || {} }) : [];

  const canNext = [
    !!template,
    !!template && !!title.trim() && missingCampaign.length === 0,
    !!audience && count > 0 && missingRecipient.length === 0,
    true,
  ][step];

  const onRecipientCsv = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const rows = parseCsv(await file.text());
    if (rows.length < 2) {
      toast.error("CSV cần dòng tiêu đề (cột 1: email/mã hội viên/SĐT/user id, các cột sau: mã biến) và ít nhất 1 dòng dữ liệu");
      return;
    }
    const header = rows[0].map((h) => normalizeVariableKey(h));
    const known = new Set(recipientVars.map((v) => v.key));
    const cols = header.map((h, i) => (i > 0 && known.has(h) ? h : null));
    const byKey = new Map();
    for (const u of users) {
      for (const k of [u.id, u.email, u.identifier, u.username, u.phone]) if (k) byKey.set(String(k).trim().toLowerCase(), u);
    }
    const next = { ...perRecipient };
    const matched = [];
    const notFound = [];
    for (const row of rows.slice(1)) {
      const u = byKey.get(String(row[0] || "").trim().toLowerCase());
      if (!u) {
        notFound.push(row[0]);
        continue;
      }
      const values = {};
      cols.forEach((key, i) => {
        if (key && row[i] !== undefined && row[i] !== "") values[key] = row[i];
      });
      next[u.id] = { ...(next[u.id] || {}), ...values };
      matched.push(u);
    }
    setPerRecipient(next);
    if (mode === "groups") {
      setIncludeUsers((prev) => [...prev, ...matched.filter((u) => !prev.some((p) => p.id === u.id))]);
    }
    setCsvReport({ matched: matched.length, notFound, columns: cols.filter(Boolean) });
  };

  const submit = async () => {
    if (count > CONFIRM_THRESHOLD && confirmText.trim() !== String(count)) {
      toast.error(`Gõ đúng số ${count} để xác nhận`);
      return;
    }
    if (scheduleMode === "later" && (!scheduledAt || new Date(scheduledAt) <= new Date())) {
      toast.error("Chọn thời điểm hẹn giờ trong tương lai");
      return;
    }
    setSending(true);
    try {
      const campaign = await base44.entities.DocumentCampaign.create({
        template_id: template.id,
        template_version: template.version || 1,
        title: title.trim(),
        campaign_values: campaignValues,
        audience,
        due_at: endOfDayVn(dueDate),
        retention_days: retention,
        status: "scheduled",
        scheduled_at: scheduleMode === "later" ? new Date(scheduledAt).toISOString() : new Date().toISOString(),
        created_by: adminUser?.email || adminUser?.id || null,
      });
      if (!campaign?.id) throw new Error("Không tạo được đợt phát hành");
      if (scheduleMode === "later") {
        toast.success(`Đã hẹn phát hành lúc ${new Date(scheduledAt).toLocaleString("vi-VN")}`);
      } else {
        const res = await invokeDispatch(campaign.id);
        if (res?.outcome === "failed") throw new Error(res.error);
        toast.success(
          res?.outcome === "continue"
            ? `Đã gửi ${res.inserted} văn bản, phần còn lại đang được phát hành tiếp`
            : `Đã phát hành ${res?.inserted ?? 0} văn bản`,
        );
      }
      onDispatched?.();
    } catch (e) {
      toast.error(`Phát hành thất bại: ${e.message || e}. Đợt vẫn được lưu - xem ở mục Theo dõi.`);
    } finally {
      setSending(false);
    }
  };

  if (loading) return <p className="text-[11px] text-gray-400 py-6 text-center">Đang tải…</p>;

  return (
    <div className="space-y-3">
      <ol className="flex items-center gap-1 bg-white rounded-xl border border-gray-200 p-2 overflow-x-auto">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              disabled={i > step}
              onClick={() => setStep(i)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-semibold ${i === step ? "bg-[#948154] text-white" : i < step ? "text-[#7d6c45]" : "text-gray-400"}`}
            >
              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] ${i === step ? "bg-white text-[#948154]" : i < step ? "bg-[#948154] text-white" : "bg-gray-200"}`}>
                {i < step ? <Check className="w-2.5 h-2.5" /> : i + 1}
              </span>
              {s}
            </button>
            {i < STEPS.length - 1 && <ChevronRight className="w-3.5 h-3.5 text-gray-300" />}
          </li>
        ))}
      </ol>

      {step === 0 &&
        (templates.length === 0 ? (
          <EmptyState icon={FileText} title="Chưa có mẫu đã xuất bản" description="Tạo và xuất bản mẫu ở mục Mẫu trước." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  if (t.id !== templateId) {
                    setCampaignValues({});
                    setPerRecipient({});
                    setTitle("");
                  }
                  setTemplateId(t.id);
                  setStep(1);
                }}
                className={`text-left bg-white rounded-xl border p-3 hover:border-[#948154] ${templateId === t.id ? "border-[#948154] ring-2 ring-[#948154]/20" : "border-gray-200"}`}
              >
                <span className="text-[12.5px] font-bold text-gray-900">{t.name}</span>
                <p className="text-[10.5px] text-gray-500 mt-0.5">
                  {t.category} · v{t.version || 1} · {(t.variables || []).length} biến · {t.requires_signature === false ? "Không cần ký" : "Cần ký"}
                </p>
              </button>
            ))}
          </div>
        ))}

      {step === 1 && template && (
        <Section title="Nội dung đợt phát hành" description={`Mẫu: ${template.name}`}>
          <Field label="Tên đợt (chỉ Admin thấy)">
            <TextInput value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Hạn ký (tuỳ chọn)" hint="Quá hạn, văn bản chưa ký sẽ chuyển 'Hết hạn'.">
            <TextInput type="date" value={dueDate} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
          {campaignVars.length === 0 && <p className="text-[11px] text-gray-500">Mẫu không có biến cần nhập cho cả đợt.</p>}
          {campaignVars.map((v) => (
            <Field key={v.key} label={`${v.label || v.key}${v.required ? " *" : ""}`} error={missingCampaign.includes(v.key) ? "Bắt buộc nhập" : null}>
              <VariableInput def={v} docKey={`${template.id}-${v.key}`} value={campaignValues[v.key]} onChange={(val) => setCampaignValues((c) => ({ ...c, [v.key]: val }))} />
            </Field>
          ))}
          {recipientVars.length > 0 && (
            <p className="text-[10.5px] text-gray-500">
              Biến riêng từng người ({recipientVars.map((v) => v.label || v.key).join(", ")}) nhập ở bước Người nhận.
            </p>
          )}
        </Section>
      )}

      {step === 2 && template && (
        <Section title="Người nhận">
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
            {[
              ["one", "Một người"],
              ["groups", "Nhóm"],
              ["all", "Tất cả"],
            ].map(([k, label]) => (
              <button key={k} type="button" onClick={() => setMode(k)} className={`px-3 py-1 rounded-md text-[11px] font-semibold ${mode === k ? "bg-white shadow text-[#7d6c45]" : "text-gray-500"}`}>
                {label}
              </button>
            ))}
          </div>

          {mode === "one" && (
            <div className="space-y-2">
              {singleUser ? (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-[#948154]/10">
                  <span className="text-[12px] font-semibold flex-1">{userLabel(singleUser)} <span className="font-normal text-gray-500">{singleUser.email}</span></span>
                  <button type="button" onClick={() => setSingleUser(null)} aria-label="Bỏ chọn"><X className="w-4 h-4" /></button>
                </div>
              ) : (
                <UserSearch users={users} onPick={setSingleUser} />
              )}
              {singleUser &&
                recipientVars.map((v) => (
                  <Field key={v.key} label={`${v.label || v.key}${v.required ? " *" : ""}`} error={missingRecipient.includes(v.key) ? "Bắt buộc nhập" : null}>
                    <VariableInput
                      def={v}
                      docKey={`${singleUser.id}-${v.key}`}
                      value={perRecipient[singleUser.id]?.[v.key]}
                      onChange={(val) => setPerRecipient((p) => ({ ...p, [singleUser.id]: { ...(p[singleUser.id] || {}), [v.key]: val } }))}
                    />
                  </Field>
                ))}
            </div>
          )}

          {mode === "groups" && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {groups.map((g) => {
                  const on = groupIds.includes(g.id);
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setGroupIds((ids) => (on ? ids.filter((x) => x !== g.id) : [...ids, g.id]))}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] border ${on ? "bg-[#948154] text-white border-[#948154]" : "border-gray-300 text-gray-700"}`}
                    >
                      <span className="w-2 h-2 rounded-full" style={{ background: on ? "#fff" : g.color }} />
                      {g.name} <span className={on ? "text-white/80" : "text-gray-400"}>({g.member_count ?? 0})</span>
                    </button>
                  );
                })}
                {groups.length === 0 && <span className="text-[11px] text-gray-400">Chưa có nhóm - tạo ở mục Nhóm người dùng.</span>}
              </div>
              <Field label="Chọn thêm người lẻ">
                <UserSearch users={users} excludeIds={includeUsers.map((u) => u.id)} onPick={(u) => setIncludeUsers((l) => [...l, u])} />
              </Field>
              {includeUsers.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {includeUsers.map((u) => (
                    <Badge key={u.id} color="gold">
                      {userLabel(u)}
                      <button type="button" className="ml-1" onClick={() => setIncludeUsers((l) => l.filter((x) => x.id !== u.id))} aria-label="Bỏ">×</button>
                    </Badge>
                  ))}
                </div>
              )}
              <Field label="Loại trừ người">
                <UserSearch users={users} excludeIds={excludeUsers.map((u) => u.id)} onPick={(u) => setExcludeUsers((l) => [...l, u])} />
              </Field>
              {excludeUsers.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {excludeUsers.map((u) => (
                    <Badge key={u.id} color="red">
                      {userLabel(u)}
                      <button type="button" className="ml-1" onClick={() => setExcludeUsers((l) => l.filter((x) => x.id !== u.id))} aria-label="Bỏ">×</button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          {mode === "all" && (
            <div className="space-y-2">
              <Toggle checked={excludeLocked} onChange={setExcludeLocked} label="Bỏ tài khoản bị khoá" />
              <p className="text-[11px] text-orange-700 bg-orange-50 border border-orange-200 rounded-lg p-2">Gửi tới toàn bộ hội viên (không gồm Admin). Kiểm tra kỹ nội dung trước khi phát hành.</p>
            </div>
          )}

          {mode !== "one" && recipientVars.length > 0 && (
            <div className="rounded-lg border border-dashed border-gray-300 p-2 space-y-1.5">
              <p className="text-[11px] text-gray-700">
                Mẫu có biến riêng từng người: <b>{recipientVars.map((v) => v.key).join(", ")}</b>. Nhập bằng CSV (cột 1: email/mã hội viên/SĐT/user id; các cột sau đặt tên đúng mã biến).
                Người thiếu giá trị bắt buộc sẽ bị bỏ qua khi phát hành.
              </p>
              <label className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[11px] font-semibold bg-white border border-gray-300 cursor-pointer">
                <Upload className="w-3.5 h-3.5" /> Nhập CSV giá trị
                <input type="file" accept=".csv,text/csv" className="hidden" onChange={onRecipientCsv} />
              </label>
              {csvReport && (
                <p className="text-[10.5px] text-gray-600">
                  Khớp {csvReport.matched} người (cột: {csvReport.columns.join(", ") || "không có cột biến hợp lệ"})
                  {csvReport.notFound.length > 0 && <span className="text-red-600"> · {csvReport.notFound.length} không tìm thấy: {csvReport.notFound.slice(0, 10).join(", ")}</span>}
                </p>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 border border-gray-200">
            <Users className="w-4 h-4 text-[#948154]" />
            <span className="text-[12px] font-semibold">Sẽ gửi tới {count === null ? <Loader2 className="inline w-3.5 h-3.5 animate-spin" /> : count} người</span>
          </div>
        </Section>
      )}

      {step === 3 && template && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
          <div className="space-y-3">
            <Section title="Tóm tắt">
              <dl className="text-[11.5px] grid grid-cols-[110px_1fr] gap-y-1">
                <dt className="text-gray-500">Mẫu</dt>
                <dd>{template.name} (v{template.version || 1})</dd>
                <dt className="text-gray-500">Tên đợt</dt>
                <dd>{title}</dd>
                <dt className="text-gray-500">Người nhận</dt>
                <dd>
                  <b>{count}</b> người · {mode === "one" ? userLabel(singleUser) : mode === "groups" ? `${groupIds.length} nhóm${includeUsers.length ? ` + ${includeUsers.length} người lẻ` : ""}${excludeUsers.length ? `, loại ${excludeUsers.length}` : ""}` : "Tất cả hội viên"}
                </dd>
                <dt className="text-gray-500">Hạn ký</dt>
                <dd>{dueDate ? new Date(`${dueDate}T00:00:00`).toLocaleDateString("vi-VN") : "Không đặt"}</dd>
                <dt className="text-gray-500">Khung văn bản</dt>
                <dd>{letterhead?.name || "—"}</dd>
              </dl>
            </Section>
            <Section title="Lưu trữ PDF">
              <RetentionSelect
                value={retention}
                onChange={setRetention}
                inheritLabel={template.retention_days === null || template.retention_days === undefined ? "Theo mặc định trong Cài đặt" : `Theo mẫu (${retentionLabel(template.retention_days)})`}
              />
            </Section>
            <Section title="Thời điểm phát hành">
              <div className="flex gap-2">
                {[
                  ["now", "Phát hành ngay"],
                  ["later", "Hẹn giờ"],
                ].map(([k, label]) => (
                  <label key={k} className="flex items-center gap-1.5 text-[11.5px]">
                    <input type="radio" checked={scheduleMode === k} onChange={() => setScheduleMode(k)} /> {label}
                  </label>
                ))}
              </div>
              {scheduleMode === "later" && <TextInput type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />}
              {scheduleMode === "later" && <p className="text-[10px] text-gray-400">Cần cấu hình pg_cron + Vault (xem supabase/functions/README.md) để đợt hẹn giờ tự chạy.</p>}
            </Section>
            {count > CONFIRM_THRESHOLD && (
              <Section title="Xác nhận">
                <Field label={`Gõ ${count} để xác nhận gửi tới ${count} người`}>
                  <TextInput value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
                </Field>
              </Section>
            )}
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10.5px] font-semibold text-gray-500">Xem thử{previewPerson ? ` - ${userLabel(previewPerson)}` : ""}</p>
              {previewPeople.length > 1 && (
                <div className="flex gap-1">
                  {previewPeople.map((u, i) => (
                    <button key={u.id} type="button" onClick={() => setPreviewIndex(i)} className={`w-6 h-6 rounded-md text-[10px] ${i === previewIndex ? "bg-[#948154] text-white" : "bg-gray-100 text-gray-600"}`}>
                      {i + 1}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {preview ? <LetterheadRenderer layout={preview.layout} /> : <div className="aspect-[210/297] rounded-lg bg-white border border-gray-200 animate-pulse" />}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <Button variant="secondary" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || sending}>
          <ChevronLeft className="w-3.5 h-3.5" /> Quay lại
        </Button>
        {step < 3 ? (
          <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
            Tiếp <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        ) : (
          <Button onClick={submit} disabled={sending || !count || (count > CONFIRM_THRESHOLD && confirmText.trim() !== String(count))}>
            {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            {scheduleMode === "later" ? "Hẹn giờ phát hành" : `Phát hành tới ${count ?? 0} người`}
          </Button>
        )}
      </div>
    </div>
  );
}
