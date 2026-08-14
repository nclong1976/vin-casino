import React from "react";
import { motion } from "framer-motion";
import { Gift, Ticket, ShoppingBag, Plane, Utensils, Heart } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import BottomNav from "@/components/BottomNav";
import { toast } from "sonner";

const BENEFITS = [
  { title: "Giảm 30% Vinpearl", desc: "Áp dụng cho phòng deluxe trở đi", icon: Plane, color: "bg-blue-50 text-blue-500", tag: "HOT" },
  { title: "Voucher 500K", desc: "Sàn thương mại VinMart", icon: ShoppingBag, color: "bg-green-50 text-green-500", tag: "MỚI" },
  { title: "Buffet 2-for-1", desc: "Nhà hảng VinDining", icon: Utensils, color: "bg-orange-50 text-orange-500", tag: "" },
  { title: " vé Casino 5 sao", desc: "Corona Casino Phú Quốc", icon: Ticket, color: "bg-purple-50 text-purple-500", tag: "VIP" },
  { title: "Khám sức khỏe MIỄN PHÍ", desc: "VinmecCare gói toàn diện", icon: Heart, color: "bg-red-50 text-red-500", tag: "" },
  { title: "Quà sinh nhật", desc: "Voucher 1 triệu đồng", icon: Gift, color: "bg-pink-50 text-pink-500", tag: "" },
];

export default function Benefits() {
  return (
    <main className="relative w-full min-h-screen bg-[#f5f5f5] overflow-x-hidden font-heading">
      <PageHeader title="Ưu đãi phúc lợi" />
      <div className="max-w-4xl mx-auto px-4 py-4 pb-24 space-y-4">
        <div className="bg-gradient-to-br from-[#948154] to-[#6b5e3e] rounded-2xl p-4 text-white">
          <Gift className="w-6 h-6 mb-2" />
          <h2 className="text-[14px] font-bold">Đặc quyền thành viên VIP</h2>
          <p className="text-[11px] text-white/80 mt-1">
            Tận hưởng hàng trăm ưu đãi độc quyền từ hệ sinh thái VinGroup.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {BENEFITS.map((b, i) => (
            <motion.div
              key={b.title}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className="bg-white rounded-xl p-3 shadow-sm relative"
            >
              {b.tag && (
                <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded-full bg-[#D32F2F] text-white text-[7px] font-bold">
                  {b.tag}
                </span>
              )}
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2 ${b.color}`}>
                <b.icon className="w-4 h-4" />
              </div>
              <p className="text-[11px] font-bold text-black leading-tight">{b.title}</p>
              <p className="text-[9px] text-gray-400 mt-0.5 leading-tight">{b.desc}</p>
              <button
                onClick={() => toast.success("Đã nhận ưu đãi")}
                className="w-full mt-2 py-1.5 rounded-lg bg-[#948154]/10 hover:bg-[#948154]/20 text-[#948154] text-[9px] font-semibold"
              >
                Nhận ngay
              </button>
            </motion.div>
          ))}
        </div>
      </div>
      <BottomNav />
    </main>
  );
}