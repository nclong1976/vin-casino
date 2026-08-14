import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { MapPin, TrendingUp, ArrowRight, Check, Lock } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import BottomNav from "@/components/BottomNav";
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
    desc: "Resort 5 sao tầm nhìn biển trực diện, cam kết lợi nhuận chi trả theo giờ.",
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
    desc: "Condotel đẳng cấp quốc tế, phân phối lợi nhuận tự động chi trả theo giờ.",
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
    desc: "Kết hợp văn hóa di sản và đầu tư sinh lời theo giờ bền vững.",
    minAmount: "360000000",
    duration: "43200",
    is_active: true,
  },
  {
    name: "Vinpearl Đà Nẵng",
    title: "Vinpearl Đà Nẵng",
    location: "Đà Nẵng",
    image: "https://images.unsplash.com/photo-1559508551-44bff1de756b?w=600&h=400&fit=crop",
    price: "2.1 tỷ",
    rate: "0.022%/giờ",
    tag: "Biển",
    desc: "Resort ven biển Non Nước, lợi nhuận chi trả từng giờ.",
    minAmount: "420000000",
    duration: "43200",
    is_active: true,
  },
  {
    name: "Vinpearl Ha Long",
    title: "Vinpearl Ha Long",
    location: "Hạ Long, Quảng Ninh",
    image: "https://images.unsplash.com/photo-1601918774946-25832a4be0d6?w=600&h=400&fit=crop",
    price: "2.8 tỷ",
    rate: "0.028%/giờ",
    tag: "Vịnh",
    desc: "Tầm nhìn vịnh Hạ Long, di sản thiên nhiên thế giới, nhận lãi liên tục từng giờ.",
    minAmount: "560000000",
    duration: "43200",
    is_active: true,
  },
];

const FEATURES = ["Cam kết lợi nhuận", "Sổ đỏ vĩnh viễn", "Quản lý vận hành chuyên nghiệp", "Tặng gói nghỉ dưỡng"];

export default function Resort() {
  const [resorts, setResorts] = useState(DEFAULT_RESORTS);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const processItems = (all) => {
      if (!Array.isArray(all)) return;
      const resortList = all.filter(
        (p) => p.category === "Nghỉ dưỡng" || p.category === "Đầu tư nghỉ dưỡng" || (p.title || p.name || "").toLowerCase().includes("vinpearl") || (p.category || "").toLowerCase().includes("resort")
      );
      if (resortList.length > 0) {
        setResorts(
          resortList.map((p) => ({
            ...p,
            name: p.title || p.name,
            desc: p.description || "Resort 5 sao tiêu chuẩn quốc tế, cam kết sinh lời theo giờ.",
            price: p.priceStr || (p.price_per_m2 ? `${new Intl.NumberFormat("vi-VN").format(p.price_per_m2)} ₫` : "2.5 tỷ"),
            rate: p.rate || "0.025%/giờ",
            tag: p.area || "Nghỉ dưỡng",
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
    <main className="relative w-full max-w-[480px] mx-auto min-h-screen bg-[#f5f5f5] overflow-clip font-heading">
      <PageHeader title="Đầu tư nghỉ dưỡng" />
      <div className="px-3 py-4 pb-20 space-y-4">
        <div className="bg-gradient-to-br from-[#948154] to-[#6b5e3e] rounded-2xl p-4 text-white shadow-md">
          <h2 className="text-[14px] font-bold">Vinpearl Resort & Villa</h2>
          <p className="text-[11px] text-white/80 mt-1">
            Đầu tư condotel & biệt thự nghỉ dưỡng chuẩn 5 sao quốc tế với cam kết lợi nhuận tính theo giờ.
          </p>
          <div className="grid grid-cols-2 gap-2 mt-3">
            {FEATURES.map((f) => (
              <div key={f} className="flex items-center gap-1.5">
                <Check className="w-3 h-3 text-white/80 shrink-0" />
                <span className="text-[9px] text-white/90">{f}</span>
              </div>
            ))}
          </div>
        </div>

        {resorts.map((r, i) => {
          const isActive = r.is_active ?? true;
          return (
            <motion.div
              key={r.name || r.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className={`bg-white rounded-2xl overflow-hidden shadow-md border transition-all ${
                isActive ? "border-gray-100" : "border-amber-300 opacity-90 bg-amber-50/20"
              }`}
            >
              <div className="relative w-full h-[150px] overflow-hidden">
                <img src={r.image} alt={r.name} className="w-full h-full object-cover" loading="lazy" />
                <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-[#948154] text-white text-[8px] font-semibold">
                  {r.tag}
                </span>
                {!isActive && (
                  <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-amber-600 text-white text-[8px] font-bold flex items-center gap-1 shadow-sm">
                    <Lock className="w-2.5 h-2.5" /> Tạm khóa đầu tư
                  </span>
                )}
                <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black/60 to-transparent" />
                <div className="absolute bottom-2 left-3">
                  <h3 className="text-[14px] font-bold text-white">{r.name}</h3>
                  {r.location && (
                    <p className="text-[10px] text-white/80 flex items-center gap-0.5">
                      <MapPin className="w-2.5 h-2.5 text-red-400" /> {r.location}
                    </p>
                  )}
                </div>
              </div>

              <div className="p-3">
                <p className="text-[11px] text-gray-500 leading-tight mb-2">{r.desc}</p>

                <div className="grid grid-cols-2 gap-2 pb-2 border-b border-gray-100">
                  <div>
                    <p className="text-[8px] text-gray-400">Giá đầu tư</p>
                    <p className="text-[13px] font-bold text-[#948154]">{r.price}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[8px] text-gray-400 flex items-center gap-0.5 justify-end">
                      <TrendingUp className="w-2.5 h-2.5 text-red-500" /> Lãi suất/giờ
                    </p>
                    <p className="text-[13px] font-bold text-[#D32F2F]">{r.rate}</p>
                  </div>
                </div>

                <button
                  disabled={!isActive}
                  onClick={() => {
                    if (!isActive) {
                      toast.error("Dự án hiện đang đóng nhận vốn đầu tư");
                      return;
                    }
                    setSelected({ ...r, title: r.name });
                  }}
                  className={`w-full mt-2.5 py-2.5 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1 transition-all shadow-xs ${
                    isActive
                      ? "bg-[#948154] hover:bg-[#837046] text-white"
                      : "bg-gray-200 text-gray-500 cursor-not-allowed"
                  }`}
                >
                  {isActive ? (
                    <>
                      Đầu tư ngay <ArrowRight className="w-3 h-3" />
                    </>
                  ) : (
                    <>
                      <Lock className="w-3 h-3" /> Tạm đóng đầu tư
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>

      {selected && (
        <DepositModal project={selected} onClose={() => setSelected(null)} />
      )}

      <BottomNav />
    </main>
  );
}
