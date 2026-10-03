import React, { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { TYPE_LABELS, DIRECTION_LABELS, fmtVnd } from "@/lib/vinhomesValuation";
import { loadLeads } from "@/lib/vinhomesValuationAdmin";
import { toCsv, downloadCsv } from "@/lib/exportCsv";
import { Section } from "./ui";

const ACTIONS = { consult: "Cần tư vấn", notify: "Chờ mở bán", reserve: "Đặt chỗ" };

/** Khách đã bấm Tư vấn / Báo khi mở bán sau khi định giá dự án này. */
export default function LeadsList({ projectId, projectName }) {
  const [rows, setRows] = useState(null);
  const [users, setUsers] = useState({});

  useEffect(() => {
    let alive = true;
    loadLeads(projectId)
      .then(async (data) => {
        if (!alive) return;
        setRows(data || []);
        const ids = [...new Set((data || []).map((r) => r.user_id))];
        if (ids.length) {
          const { data: us } = await supabase.from("users").select("id, full_name, email, phone").in("id", ids);
          if (alive) setUsers(Object.fromEntries((us || []).map((u) => [u.id, u])));
        }
      })
      .catch((e) => {
        if (alive) setRows([]);
        toast.error(`Không tải được danh sách: ${e.message || e}`);
      });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const name = (id) => users[id]?.full_name || users[id]?.email || id;
  const describe = (r) =>
    `${TYPE_LABELS[r.input?.type] || r.input?.type} ${r.input?.area} m² · ${DIRECTION_LABELS[r.input?.direction] || r.input?.direction}${
      r.input?.unit_code ? ` · ${r.input.unit_code}` : ""
    }`;

  const exportCsv = () =>
    downloadCsv(
      `khach-quan-tam-${projectId}.csv`,
      toCsv(rows, [
        { label: "Thời gian", get: (r) => new Date(r.created_at).toLocaleString("vi-VN") },
        { label: "Khách", get: (r) => name(r.user_id) },
        { label: "Email", get: (r) => users[r.user_id]?.email || "" },
        { label: "Điện thoại", get: (r) => users[r.user_id]?.phone || "" },
        { label: "Yêu cầu", get: (r) => ACTIONS[r.action] || r.action },
        { label: "Căn", get: describe },
        { label: "Giá trị ước tính", get: (r) => r.result?.value?.estimate },
      ])
    );

  return (
    <Section
      title={`Khách quan tâm - ${projectName}`}
      hint="Giá trị ước tính do máy chủ tính lại lúc khách gửi yêu cầu."
      right={
        rows?.length > 0 && (
          <button onClick={exportCsv} className="px-2.5 py-1 rounded-lg bg-gray-900 text-white text-[10.5px] font-bold flex items-center gap-1 cursor-pointer shrink-0">
            <Download className="w-3 h-3" /> CSV
          </button>
        )
      }
    >
      {rows === null ? (
        <p className="text-[10.5px] text-gray-400">Đang tải...</p>
      ) : rows.length === 0 ? (
        <p className="text-[10.5px] text-gray-500">Chưa có khách gửi yêu cầu.</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div key={r.id} className="rounded-lg border border-gray-100 px-2.5 py-1.5 text-[10.5px]">
              <div className="flex justify-between gap-2">
                <span className="font-bold text-gray-900 truncate">{name(r.user_id)}</span>
                <span className={`shrink-0 px-1.5 rounded font-bold ${r.action === "consult" ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700"}`}>
                  {ACTIONS[r.action] || r.action}
                </span>
              </div>
              <p className="text-gray-600">
                {describe(r)} · <b>{fmtVnd(r.result?.value?.estimate)}</b>
              </p>
              <p className="text-gray-400">
                {new Date(r.created_at).toLocaleString("vi-VN")}
                {users[r.user_id]?.phone ? ` · ${users[r.user_id].phone}` : ""}
              </p>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}
