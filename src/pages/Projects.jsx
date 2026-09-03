import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import ProjectsHeader from "@/components/projects/ProjectsHeader";
import ProjectCard from "@/components/projects/ProjectCard";
import DepositModal from "@/components/projects/DepositModal";
import BottomNav from "@/components/BottomNav";
import { base44 } from "@/api/base44Client";

/**
 * Trước đây trang này dùng 6 "quỹ nội bộ" hardcode cứng trong code, ghép
 * với dữ liệu Supabase bằng cách dò khớp TIÊU ĐỀ (không phải category) -
 * dễ vỡ: admin đổi tiêu đề 1 quỹ mặc định là card cũ + card mới (lệch
 * tiêu đề) hiện ra CÙNG LÚC, admin cũng không thể xoá/thêm quỹ tự do.
 * Giờ đọc thẳng theo category "Dự Án" từ investment_projects - admin toàn
 * quyền thêm/sửa/xoá qua ProjectsTab, không còn nguồn dữ liệu thứ 2.
 */
const isDuAnProject = (p) => (p?.category || "").trim() === "Dự Án";

export default function Projects() {
  const [selected, setSelected] = useState(null);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get("highlight");
  const [highlightActive, setHighlightActive] = useState(!!highlightId);

  const applyList = (all) => {
    if (!Array.isArray(all)) return;
    setProjects(
      all
        .filter((p) => isDuAnProject(p))
        // ProjectCard/DepositModal đọc "minAmount" (camelCase, quy ước lịch
        // sử của cả 2 component) trong khi cột Postgres thật là "min_amount"
        // - thiếu dòng map này khiến số tiền tối thiểu luôn bị đọc thành 0,
        // vô hiệu hoá validate và làm 3 nút 1x/2x/5x đều ra 0 VNĐ.
        .map((p) => ({ ...p, minAmount: p.minAmount ?? p.min_amount }))
    );
  };

  useEffect(() => {
    const fetch = () => {
      base44.entities.Project
        .list("-created_date", 100)
        .then(applyList)
        .catch(() => {})
        .finally(() => setLoading(false));
    };

    fetch();

    const unsubscribe = base44.entities.Project.subscribe((updatedItems) => {
      if (Array.isArray(updatedItems) && updatedItems.length > 0) applyList(updatedItems);
    });

    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  // Tới đây từ 1 thông báo "dự án mới mở" (NotificationBell.jsx) - cuộn tới
  // đúng thẻ dự án đó và nổi bật tạm thời vài giây rồi tự tắt.
  useEffect(() => {
    if (!highlightId || projects.length === 0) return;
    const el = document.getElementById(`project-${highlightId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    const timer = setTimeout(() => setHighlightActive(false), 3000);
    return () => clearTimeout(timer);
  }, [highlightId, projects]);

  return (
    <main className="relative w-full min-h-screen bg-[#f5f5f5] overflow-x-hidden font-heading">
      <ProjectsHeader />

      <div className="max-w-5xl mx-auto px-4 py-4 pb-24 space-y-4">
        {/* Banner Header for VinClub Small Projects & Internal Funds */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#948154] via-[#7d6c43] to-[#594c2e] p-3.5 text-white shadow-md">
          <div className="relative z-10 space-y-1">
            <span className="inline-block px-2 py-0.5 rounded-md bg-white/20 text-[9px] font-bold uppercase tracking-wider text-amber-200 backdrop-blur-xs">
              Quỹ Nội Bộ VinClub
            </span>
            <h1 className="text-[13px] font-bold text-white mt-0.5">
              Dự Án Quy Mô Nhỏ & Gói Đầu Tư Nội Bộ
            </h1>
            <p className="text-[10px] text-amber-100/90 leading-tight">
              Tập hợp các quỹ đầu tư phát triển công nghệ, giáo dục, y tế cộng đồng và dự án tăng trưởng nội bộ VinClub.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-8 text-[12px] text-gray-400">Đang tải danh mục dự án nội bộ...</div>
        ) : projects.length === 0 ? (
          <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-gray-200 p-4 space-y-2">
            <p className="text-[12px] font-semibold text-gray-600">Chưa có dự án nhỏ hoặc quỹ nội bộ nào được mở</p>
          </div>
        ) : (
          projects.map((project, index) => (
            <div
              key={project.id || project.title}
              id={`project-${project.id}`}
              className={
                highlightActive && highlightId === String(project.id)
                  ? "ring-2 ring-amber-400 rounded-2xl transition-all"
                  : ""
              }
            >
              <ProjectCard project={project} index={index} onDeposit={setSelected} />
            </div>
          ))
        )}
      </div>

      <BottomNav />

      <DepositModal project={selected} onClose={() => setSelected(null)} />
    </main>
  );
}
