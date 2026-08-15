import React, { useState, useEffect, useMemo } from "react";
import ProjectsHeader from "@/components/projects/ProjectsHeader";
import ProjectCard from "@/components/projects/ProjectCard";
import DepositModal from "@/components/projects/DepositModal";
import BottomNav from "@/components/BottomNav";
import { base44 } from "@/api/base44Client";

// ── 6 Quỹ dự án nội bộ chính thức của VinClub ─────────────────────
const OFFICIAL_FUNDS = [
  {
    id: "p_tech_industry_fund",
    title: "Quỹ dự án phát triển công nghệ công nghiệp",
    name: "Quỹ dự án phát triển công nghệ công nghiệp",
    category: "Dự Án",
    location: "Tổ hợp Công nghệ & Công nghiệp Vingroup",
    image: "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=600&h=400&fit=crop",
    price_per_m2: 500000,
    priceStr: "500.000 ₫/Suất",
    rate: "0.05%/phút",
    annual_yield: 0.05,
    area: "1 Suất đầu tư",
    progress: 88,
    minAmount: 500000,
    duration: "60 phút",
    scale: "Quỹ công nghệ cao, tự động hóa & AI",
    is_active: true,
    description: "Quỹ tài trợ và đầu tư phát triển công nghệ công nghiệp cao, tự động hóa, trí tuệ nhân tạo và công nghiệp hiện đại chuẩn quốc tế."
  },
  {
    id: "p_green_future_fund",
    title: "Quỹ Vì tương lai Xanh",
    name: "Quỹ Vì tương lai Xanh",
    category: "Dự Án",
    location: "Toàn Quốc",
    image: "https://images.unsplash.com/photo-1497435334941-8c899ee9e8e9?w=600&h=400&fit=crop",
    price_per_m2: 1000000,
    priceStr: "1.000.000 ₫/Suất",
    rate: "0.04%/phút",
    annual_yield: 0.04,
    area: "1 Suất phát triển xanh",
    progress: 92,
    minAmount: 1000000,
    duration: "120 phút",
    scale: "Hành động vì môi trường & năng lượng tái tạo",
    is_active: true,
    description: "Quỹ hành động vì môi trường xanh, hỗ trợ chuyển đổi năng lượng xanh, trồng rừng và phát triển kinh tế bền vững không phát thải."
  },
  {
    id: "p_thien_tam_fund",
    title: "Quỹ Thiện Tâm",
    name: "Quỹ Thiện Tâm",
    category: "Dự Án",
    location: "Toàn Quốc",
    image: "https://images.unsplash.com/photo-1532629345422-7515f3d16bb6?w=600&h=400&fit=crop",
    price_per_m2: 500000,
    priceStr: "500.000 ₫/Suất",
    rate: "0.025%/phút",
    annual_yield: 0.025,
    area: "1 Suất nhân ái",
    progress: 99,
    minAmount: 500000,
    duration: "30 phút",
    scale: "Quỹ từ thiện xã hội phi lợi nhuận Tập đoàn Vingroup",
    is_active: true,
    description: "Quỹ từ thiện xã hội phi lợi nhuận của Tập đoàn Vingroup, triển khai các chương trình nhân đạo vì cộng đồng."
  },
  {
    id: "p_vinmec_healthcare_fund",
    title: "QUỸ CHĂM SÓC SỨC KHỎE Y TẾ CỘNG ĐỒNG VINMEC",
    name: "QUỸ CHĂM SÓC SỨC KHỎE Y TẾ CỘNG ĐỒNG VINMEC",
    category: "Dự Án",
    location: "Hệ thống Bệnh viện Vinmec Toàn Quốc",
    image: "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=600&h=400&fit=crop",
    price_per_m2: 1000000,
    priceStr: "1.000.000 ₫/Suất",
    rate: "0.045%/phút",
    annual_yield: 0.045,
    area: "1 Suất y tế cộng đồng",
    progress: 91,
    minAmount: 1000000,
    duration: "90 phút",
    scale: "Hệ thống Y tế Vinmec tiêu chuẩn JCI quốc tế",
    is_active: true,
    description: "Quỹ nâng cao sức khỏe cộng đồng, bảo trợ y tế kỹ thuật cao và nghiên cứu y học tiên tiến tại hệ thống Vinmec."
  },
  {
    id: "p_vinschool_education_fund",
    title: "QUỸ PHÁT TRIỂN GIÁO DỤC LIÊN CẤP VINSCHOOL",
    name: "QUỸ PHÁT TRIỂN GIÁO DỤC LIÊN CẤP VINSCHOOL",
    category: "Dự Án",
    location: "Hệ thống trường Vinschool Toàn Quốc",
    image: "https://images.unsplash.com/photo-1509062522246-3755977927d7?w=600&h=400&fit=crop",
    price_per_m2: 1000000,
    priceStr: "1.000.000 ₫/Suất",
    rate: "0.038%/phút",
    annual_yield: 0.038,
    area: "1 Suất giáo dục liên cấp",
    progress: 94,
    minAmount: 1000000,
    duration: "120 phút",
    scale: "Hệ thống giáo dục phổ thông liên cấp chuẩn CIS hàng đầu Việt Nam",
    is_active: true,
    description: "Hệ thống giáo dục phổ thông liên cấp chất lượng cao hàng đầu Việt Nam, ươm mầm thế hệ công dân toàn cầu."
  },
  {
    id: "p_vinuni_education",
    title: "VinUni (Đại học đẳng cấp quốc tế)",
    name: "VinUni (Đại học đẳng cấp quốc tế)",
    category: "Dự Án",
    location: "Gia Lâm, Hà Nội",
    image: "https://images.unsplash.com/photo-1562774053-701939374585?w=600&h=400&fit=crop",
    price_per_m2: 2000000,
    priceStr: "2.000.000 ₫/Suất",
    rate: "0.035%/phút",
    annual_yield: 0.035,
    area: "1 Suất giáo dục tinh hoa",
    progress: 95,
    minAmount: 2000000,
    duration: "180 phút",
    scale: "Đại học tinh hoa chuẩn quốc tế hợp tác Cornell & UPenn",
    is_active: true,
    description: "Đại học VinUniversity đào tạo nhân tài chuẩn quốc tế, cơ sở vật chất hiện đại hàng đầu thế giới."
  }
];

export default function Projects() {
  const [selected, setSelected] = useState(null);
  const [projects, setProjects] = useState(OFFICIAL_FUNDS);
  const [loading, setLoading] = useState(false);

  // Merge remote updates with default official funds
  const mergeProjectsWithDefaults = (fetchedProjects = []) => {
    const map = {};
    // Start with default 6 funds
    OFFICIAL_FUNDS.forEach((f) => {
      map[f.id] = { ...f };
      map[f.title.toLowerCase()] = { ...f };
    });

    // Merge fetched projects (updated by Admin)
    (fetchedProjects || []).forEach((p) => {
      if (!p) return;
      const keyId = p.id;
      const keyTitle = (p.title || p.name || "").toLowerCase();

      const existing = map[keyId] || map[keyTitle];
      if (existing) {
        map[existing.id] = { ...existing, ...p };
      } else {
        // Additional custom project added by Admin
        const cat = (p.category || "").toLowerCase();
        const isVinhomes = cat.includes("vinhomes") || cat.includes("đất") || cat.includes("bất động sản");
        const isResort = cat.includes("nghỉ dưỡng") || cat.includes("resort") || cat.includes("vinpearl");
        const isStock = cat.includes("chứng khoán") || cat.includes("cổ phiếu");
        if (!isVinhomes && !isResort && !isStock) {
          map[p.id || p.title] = p;
        }
      }
    });

    // Return merged list preserving the exact order of official funds first
    const orderedList = [];
    OFFICIAL_FUNDS.forEach((f) => {
      const item = map[f.id];
      if (item && (item.is_active ?? true)) {
        orderedList.push(item);
      }
    });

    // Append any extra custom projects added by Admin
    Object.values(map).forEach((item) => {
      if (!OFFICIAL_FUNDS.some((f) => f.id === item.id) && (item.is_active ?? true)) {
        orderedList.push(item);
      }
    });

    return orderedList;
  };

  useEffect(() => {
    const fetch = () => {
      base44.entities.Project
        .list("-created_date", 100)
        .then((all) => {
          if (Array.isArray(all) && all.length > 0) {
            setProjects(mergeProjectsWithDefaults(all));
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    };

    fetch();

    let unsubRTDB;
    import("@/lib/rtdbSync").then(({ subscribeProjectsFromRTDB }) => {
      unsubRTDB = subscribeProjectsFromRTDB((rtdbProjects) => {
        if (Array.isArray(rtdbProjects) && rtdbProjects.length > 0) {
          setProjects(mergeProjectsWithDefaults(rtdbProjects));
        }
      });
    }).catch(() => null);

    const unsubscribe = base44.entities.Project.subscribe((updatedItems) => {
      if (Array.isArray(updatedItems) && updatedItems.length > 0) {
        setProjects(mergeProjectsWithDefaults(updatedItems));
      }
    });

    return () => {
      if (typeof unsubRTDB === "function") unsubRTDB();
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

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
            <ProjectCard
              key={project.id || project.title}
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
