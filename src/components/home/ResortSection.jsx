import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { MapPin, TrendingUp, ArrowRight, Lock } from "lucide-react";
import DepositModal from "@/components/projects/DepositModal";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

const DEFAULT_RESORTS = [
  {
    name: "Vinpearl Nha Trang",
    title: "Vinpearl Nha Trang",
    location: "Nha Trang, Khánh Hòa",
    image: "https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=600&h=400&fit=crop",
    price: "2.5 tỷ",
    rate: "0.025%/giờ",
    tag: "Biển",
    minAmount: "500000000",
    duration: "43200",
    is_active: true,
  },
  {
    name: "Vinpearl Phú Quốc",
    title: "Vinpearl Phú Quốc",
    location: "Phú Quốc, Kiên Giang",
    image: "https://images.unsplash.com/photo-1582719508461-905c673771fd?w=600&h=400&fit=crop",
    price: "3.2 tỷ",
    rate: "0.030%/giờ",
    tag: "Đảo",
    minAmount: "650000000",
    duration: "43200",
    is_active: true,
  },
  {
    name: "Vinpearl Hội An",
    title: "Vinpearl Hội An",
    location: "Hội An, Quảng Nam",
    image: "https://images.unsplash.com/photo-1602002418082-a4443e081dd1?w=600&h=400&fit=crop",
    price: "1.8 tỷ",
    rate: "0.020%/giờ",
    tag: "Sông",
    minAmount: "360000000",
    duration: "43200",
    is_active: true,
  },
];

export default function ResortSection() {
  const [resorts, setResorts] = useState(DEFAULT_RESORTS);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const processItems = (all) => {
      if (!Array.isArray(all)) return;
      // Lọc CHỈ theo category - tránh lọt nhầm cổ phiếu "Vinpearl (VPL)".
      const resortList = all.filter((p) => (p.category || "").trim() === "Đầu tư nghỉ dưỡng");
      if (resortList.length > 0) {
        setResorts(
          resortList.map((p) => ({
            ...p,
            name: p.title || p.name,
            // DepositModal đọc "minAmount" (camelCase) - cột Postgres thật
            // là "min_amount", thiếu alias này số tiền tối thiểu đọc ra 0.
            minAmount: p.minAmount ?? p.min_amount,
            price: p.priceStr || p.price_str || (p.price_per_m2 ? `${new Intl.NumberFormat("vi-VN").format(p.price_per_m2)} ₫` : "2.5 tỷ"),
            rate: p.rate || "0.025%/giờ",
            tag: p.tag || "Nghỉ dưỡng",
            is_active: p.is_active ?? true,
          }))
        );
      }
    };

    base44.entities.Project.list("-created_date", 100)
      .then(processItems)
      .catch(() => {});

    const unsubscribe = base44.entities.Project.subscribe((updated) => {
      processItems(updated);
    });

    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5, type: "spring", stiffness: 260, damping: 22 }}
      className="px-3.5 mt-6"
    >
      {/* Section Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-[3px] h-4 bg-[#948154] rounded-full" />
          <h2 className="text-[13px] font-bold text-[#3a352e]">Đầu tư nghỉ dưỡng</h2>
        </div>
        <Link to="/resort" className="flex items-center gap-0.5 text-[10px] text-[#948154] font-medium">
          Xem tất cả <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {/* Resort Cards - Horizontal Scroll */}
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-3.5 px-3.5 scrollbar-hide" style={{ scrollbarWidth: "none" }}>
        {resorts.map((r) => {
          const isActive = r.is_active ?? true;
          return (
            <motion.div
              key={r.name || r.id}
              whileTap={{ scale: 0.97 }}
              className={`shrink-0 w-[200px] bg-white rounded-2xl overflow-hidden shadow-md border transition-all ${
                isActive ? "border-gray-100" : "border-amber-300 opacity-90 bg-amber-50/20"
              }`}
            >
              {/* Image */}
              <div className="relative w-full h-[110px] overflow-hidden">
                <img
                  src={r.image}
                  alt={r.name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-[#948154] text-white text-[8px] font-semibold">
                  {r.tag}
                </span>
                {!isActive && (
                  <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-amber-600 text-white text-[7.5px] font-bold flex items-center gap-0.5 shadow-xs">
                    <Lock className="w-2.5 h-2.5" /> Khóa
                  </span>
                )}
                <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-black/40 to-transparent" />
              </div>

              {/* Content */}
              <div className="p-3">
                <h3 className="text-[12px] font-bold text-black leading-tight truncate">{r.name}</h3>
                {r.location && (
                  <p className="text-[9px] text-gray-400 flex items-center gap-0.5 mt-0.5 truncate">
                    <MapPin className="w-2.5 h-2.5 shrink-0 text-red-500" /> {r.location}
                  </p>
                )}

                <div className="flex items-end justify-between mt-2 pt-2 border-t border-gray-50">
                  <div>
                    <p className="text-[8px] text-gray-400">Giá đầu tư</p>
                    <p className="text-[12px] font-bold text-[#948154]">{r.price}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[8px] text-gray-400 flex items-center gap-0.5 justify-end">
                      <TrendingUp className="w-2.5 h-2.5 text-red-500" /> Lãi suất/giờ
                    </p>
                    <p className="text-[11px] font-bold text-[#D32F2F]">{r.rate}</p>
                  </div>
                </div>

                <button
                  disabled={!isActive}
                  onClick={() => {
                    if (!isActive) {
                      toast.error("Dự án hiện đang tạm đóng nhận vốn đầu tư");
                      return;
                    }
                    setSelected({ ...r, title: r.name });
                  }}
                  className={`w-full mt-2.5 py-2 rounded-lg text-[10px] font-semibold transition-colors flex items-center justify-center gap-1 ${
                    isActive
                      ? "bg-[#948154]/10 hover:bg-[#948154]/20 text-[#948154]"
                      : "bg-gray-100 text-gray-400 cursor-not-allowed"
                  }`}
                >
                  {isActive ? "Đầu tư ngay" : "Tạm khóa"}
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>

      {selected && (
        <DepositModal project={selected} onClose={() => setSelected(null)} />
      )}
    </motion.section>
  );
}
