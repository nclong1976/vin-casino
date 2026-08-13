import React, { useState } from "react";
import { Users, FileCheck, MessageSquare, FolderOpen, TrendingUp, Key, Copy, Check } from "lucide-react";

const fmt = (n) => {
  const num = Number(n);
  return (Number.isNaN(num) ? 0 : num).toLocaleString("vi-VN");
};

export default function OverviewTab({ stats = {} }) {
  const [copied, setCopied] = useState(false);
  const users = Number(stats.users) || 0;
  const pendingContracts = Number(stats.pendingContracts) || 0;
  const messages = Number(stats.messages) || 0;
  const activeProjects = Number(stats.activeProjects) || 0;
  const totalProjects = Number(stats.totalProjects) || 0;
  const totalTransactions = Number(stats.totalTransactions) || 0;
  const totalInvested = Number(stats.totalInvested) || 0;
  const totalProfit = Number(stats.totalProfit) || 0;
  const approvedContracts = Number(stats.approvedContracts) || 0;
  const disabledProjects = Math.max(0, totalProjects - activeProjects);

  const handleCopyCode = () => {
    navigator.clipboard.writeText("E-CUV");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const cards = [
    { label: "Người dùng", value: fmt(users), icon: Users, color: "bg-blue-50 text-blue-500" },
    { label: "Hợp đồng chờ duyệt", value: fmt(pendingContracts), icon: FileCheck, color: "bg-orange-50 text-orange-500" },
    { label: "Tin nhắn hỗ trợ", value: fmt(messages), icon: MessageSquare, color: "bg-green-50 text-green-500" },
    { label: "Dự án hoạt động", value: fmt(activeProjects), icon: FolderOpen, color: "bg-purple-50 text-purple-500" },
  ];

  return (
    <div className="space-y-4">
      {/* Admin Referral Code Banner */}
      <div className="bg-gradient-to-r from-[#1c1917] to-[#292524] text-white rounded-xl p-4 shadow-sm border border-[#948154]/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#948154]/20 border border-[#948154]/40 flex items-center justify-center shrink-0 text-[#d0bfae]">
            <Key className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-[14px] font-bold text-white">Mã giới thiệu đăng ký hệ thống</h3>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[#948154] text-white">BẮT BUỘC</span>
            </div>
            <p className="text-[12px] text-gray-300 mt-0.5">
              Mã giới thiệu này ẩn đối với người dùng phổ thông và chỉ Admin mới có quyền cấp cho khách hàng đăng ký mới.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-lg border border-white/20 shrink-0 self-start sm:self-center">
          <span className="text-xs text-gray-300 font-medium">Mã Admin:</span>
          <span className="text-base font-bold font-mono text-[#e5d5c5]">E-CUV</span>
          <button
            onClick={handleCopyCode}
            className="p-1 rounded hover:bg-white/20 text-[#d0bfae] transition-colors cursor-pointer ml-1"
            title="Sao chép mã E-CUV"
          >
            {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="bg-white rounded-xl p-4 shadow-sm">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-2 ${c.color}`}>
              <c.icon className="w-5 h-5" />
            </div>
            <p className="text-[24px] font-bold text-black">{c.value}</p>
            <p className="text-[11px] text-gray-400">{c.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h3 className="text-[13px] font-bold text-black mb-3 flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-[#948154]" /> Tổng quan đầu tư
          </h3>
          <div className="space-y-2">
            <div className="flex justify-between text-[12px]">
              <span className="text-gray-500">Tổng giao dịch đầu tư</span>
              <span className="font-bold text-black">{fmt(totalTransactions)}</span>
            </div>
            <div className="flex justify-between text-[12px]">
              <span className="text-gray-500">Tổng tiền đầu tư</span>
              <span className="font-bold text-black">{fmt(totalInvested)} VNĐ</span>
            </div>
            <div className="flex justify-between text-[12px]">
              <span className="text-gray-500">Tổng lãi dự kiến</span>
              <span className="font-bold text-[#D32F2F]">{fmt(totalProfit)} VNĐ</span>
            </div>
            <div className="flex justify-between text-[12px]">
              <span className="text-gray-500">Hợp đồng đã duyệt</span>
              <span className="font-bold text-green-600">{fmt(approvedContracts)}</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h3 className="text-[13px] font-bold text-black mb-3 flex items-center gap-1.5">
            <FolderOpen className="w-4 h-4 text-[#948154]" /> Dự án
          </h3>
          <div className="space-y-2">
            <div className="flex justify-between text-[12px]">
              <span className="text-gray-500">Tổng số dự án</span>
              <span className="font-bold text-black">{fmt(totalProjects)}</span>
            </div>
            <div className="flex justify-between text-[12px]">
              <span className="text-gray-500">Đang hoạt động</span>
              <span className="font-bold text-green-600">{fmt(activeProjects)}</span>
            </div>
            <div className="flex justify-between text-[12px]">
              <span className="text-gray-500">Đã tắt</span>
              <span className="font-bold text-gray-400">{fmt(disabledProjects)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}