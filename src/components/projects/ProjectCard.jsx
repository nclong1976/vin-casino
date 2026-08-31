import React from "react";
import { motion } from "framer-motion";
import { Lock } from "lucide-react";
import { TERM_RATE_LABEL, TERM_PAYOUT_COPY, getProjectTermUnit, getProjectTermDurationDisplayValue } from "@/lib/investmentTerms";

export default function ProjectCard({ project, index, onDeposit }) {
  const isActive = project.is_active ?? true;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1, type: "spring", stiffness: 260, damping: 20 }}
      className={`bg-white rounded-2xl overflow-hidden shadow-md border transition-all ${
        isActive ? "border-transparent" : "border-amber-300 opacity-90 bg-amber-50/20"
      }`}>

      {/* Project Image */}
      <div className="relative w-full h-[140px] overflow-hidden">
        <img src={project.image} alt={project.title} loading="lazy" className="w-full h-full object-cover" />
        {!isActive && (
          <div className="absolute top-2 right-2 bg-amber-600 text-white text-[8.5px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 shadow-sm">
            <Lock className="w-2.5 h-2.5" /> Tạm khóa đầu tư
          </div>
        )}
      </div>

      <div className="p-3.5">
        {/* Title with red accent bar */}
        <div className="flex items-start gap-2 mb-3">
          <div className="w-[3px] h-full min-h-[18px] bg-[#A51C30] rounded-full shrink-0 mt-0.5" />
          <h3 className="text-[13px] font-bold leading-tight text-black">
            {project.title}
          </h3>
        </div>

        {/* Metrics Grid */}
        {(() => {
          const termUnit = getProjectTermUnit(project);
          const durationVal = getProjectTermDurationDisplayValue(project);
          const durationLabel = `${durationVal} ${termUnit}`;

          return (
            <>
              <div className="grid grid-cols-3 gap-1.5 pb-3 border-b border-gray-100">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[12px] font-bold text-[#A51C30]">{project.total_term_interest_rate}%</span>
                  <span className="text-[9px] text-gray-500 leading-tight">
                    {TERM_RATE_LABEL}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[12px] font-bold text-[#A51C30]">{durationLabel}</span>
                  <span className="text-[9px] text-gray-500 leading-tight">Thời hạn của dự án</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[12px] font-bold text-[#A51C30]">
                    {typeof project.minAmount === "number" ? project.minAmount.toLocaleString("vi-VN") : project.minAmount}
                  </span>
                  <span className="text-[9px] text-gray-500 leading-tight">Số tiền bắt đầu</span>
                </div>
              </div>

              {/* Project Details */}
              <div className="py-3 space-y-1 border-b border-gray-100">
                <p className="text-[11px] text-gray-700">
                  Quy mô dự án: <span className="font-medium text-black">{project.scale}</span>
                </p>
                <p className="text-[11px] text-gray-700">
                  {TERM_PAYOUT_COPY}
                </p>
              </div>
            </>
          );
        })()}

        {/* Action Button */}
        <button
          disabled={!isActive}
          onClick={() => {
            if (!isActive) return;
            onDeposit?.(project);
          }}
          className={`w-full py-2.5 mt-3 active:scale-[0.98] transition-all rounded-lg text-[13px] font-semibold flex items-center justify-center gap-1.5 ${
            isActive
              ? "bg-[#8B7D4D] hover:bg-[#7a6d40] text-white"
              : "bg-gray-200 text-gray-500 cursor-not-allowed"
          }`}>
          {isActive ? "Gửi tiền ngay" : (<>Dự án tạm đóng nhận vốn <Lock className="w-3.5 h-3.5" /></>)}
        </button>

        {/* Progress Bar */}
        <div className="flex items-center gap-2 mt-3">
          <span className="text-[11px] text-gray-500 shrink-0">Tiến độ:</span>
          <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#8B7D4D] rounded-full transition-all duration-500"
              style={{ width: `${project.progress}%` }} />
            
          </div>
          <span className="text-[11px] font-medium text-black shrink-0">{project.progress}%</span>
        </div>
      </div>
    </motion.div>);

}