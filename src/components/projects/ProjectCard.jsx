import React from "react";
import { motion } from "framer-motion";

export default function ProjectCard({ project, index, onDeposit }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1, type: "spring", stiffness: 260, damping: 20 }}
      className="bg-white rounded-2xl overflow-hidden shadow-md">
      
      {/* Project Image */}
      <div className="w-full h-[140px] overflow-hidden">
        <img src={project.image} alt={project.title} loading="lazy" className="w-full h-full object-cover" />
        
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
          const isMinute = project?.category === "Dự Án" || project?.rate?.includes("phút") || project?.duration?.includes("phút");
          const isHourly = !isMinute && (project?.category === "Nghỉ dưỡng" || project?.category === "Đầu tư nghỉ dưỡng" || project?.rate?.includes("giờ") || project?.title?.includes("Vinpearl"));
          const rateLabel = isMinute ? "Lãi suất theo phút" : isHourly ? "Lãi suất theo giờ" : "Lãi suất theo ngày";
          const payoutLabel = isMinute ? "Hoàn lãi hàng phút, trả gốc khi đáo hạn" : isHourly ? "Hoàn lãi hàng giờ, trả gốc khi đáo hạn" : "Hoàn lãi hàng ngày, trả gốc khi đáo hạn";

          return (
            <>
              <div className="grid grid-cols-3 gap-1.5 pb-3 border-b border-gray-100">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[12px] font-bold text-[#A51C30]">{project.rate}</span>
                  <span className="text-[9px] text-gray-500 leading-tight">
                    {rateLabel}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[12px] font-bold text-[#A51C30]">{project.duration}</span>
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
                  {payoutLabel}
                </p>
              </div>
            </>
          );
        })()}

        {/* Action Button */}
        <button
          onClick={() => onDeposit?.(project)}
          className="w-full py-2.5 mt-3 bg-[#8B7D4D] hover:bg-[#7a6d40] active:scale-[0.98] transition-all rounded-lg text-white text-[13px] font-semibold">
          Gửi tiền ngay
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