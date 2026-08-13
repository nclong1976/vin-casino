import React, { useState, useEffect } from "react";
import ProjectsHeader from "@/components/projects/ProjectsHeader";
import ProjectCard from "@/components/projects/ProjectCard";
import DepositModal from "@/components/projects/DepositModal";
import BottomNav from "@/components/BottomNav";
import { base44 } from "@/api/base44Client";

export default function Projects() {
  const [selected, setSelected] = useState(null);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = () => {
      base44.entities.Project
        .list("-created_date", 100)
        .then((all) => setProjects(all.filter((p) => p.is_active ?? true)))
        .catch(() => {})
        .finally(() => setLoading(false));
    };

    fetch();

    const unsubscribe = base44.entities.Project.subscribe((updatedItems) => {
      if (Array.isArray(updatedItems)) {
        setProjects(updatedItems.filter((p) => p.is_active ?? true));
      }
    });

    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  // Filter ONLY small projects and internal funds within VinClub, strictly EXCLUDING Vinhomes, Resort & Stocks
  const smallProjects = projects.filter((p) => {
    const cat = (p.category || "").toLowerCase();
    const title = (p.title || p.name || "").toLowerCase();

    const isVinhomes = cat.includes("vinhomes") || cat.includes("đất") || cat.includes("bất động sản") || title.includes("vinhomes");
    const isResort = cat.includes("nghỉ dưỡng") || cat.includes("resort") || title.includes("vinpearl");
    const isStock = cat.includes("chứng khoán") || cat.includes("cổ phiếu") || title.includes("cổ phiếu");

    return !isVinhomes && !isResort && !isStock;
  });

  return (
    <main className="relative w-full max-w-[331px] mx-auto min-h-[594px] bg-[#f5f5f5] overflow-clip font-heading">
      <ProjectsHeader />

      <div className="px-3 py-3.5 pb-20 space-y-3.5">
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
              Tập hợp các dự án khởi nghiệp nhỏ, quỹ sinh lời vi mô cộng dồn hằng ngày và dự án phát triển chuỗi dịch vụ tiện ích nội bộ VinClub.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-8 text-[12px] text-gray-400">Đang tải danh mục dự án nội bộ...</div>
        ) : smallProjects.length === 0 ? (
          <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-gray-200 p-4 space-y-2">
            <p className="text-[12px] font-semibold text-gray-600">Chưa có dự án nhỏ hoặc quỹ nội bộ nào được mở</p>
          </div>
        ) : (
          smallProjects.map((project, index) => (
            <ProjectCard
              key={project.id}
              project={project}
              index={index}
              onDeposit={setSelected}
            />
          ))
        )}
      </div>

      <BottomNav />

      <DepositModal project={selected} onClose={() => setSelected(null)} />
    </main>
  );
}
