import React from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import NewsSection from "@/components/home/NewsSection";
import NotificationBell from "@/components/home/NotificationBell";
import BottomNav from "@/components/BottomNav";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import casinoIcon from "@/assets/images/regenerated_image_1786492435642.png";

export default function Home() {
  const { user } = useAuth();

  const displayName = user?.full_name || user?.name || user?.username || user?.email || "KHÁCH HÀNG";
  const avatarLetter = (displayName.trim().charAt(0) || "N").toUpperCase();
  const formattedBalance = user?.balance !== undefined
    ? new Intl.NumberFormat('vi-VN').format(user.balance) + " VND"
    : "0 VND";

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
  };

  return (
    <main className="relative w-full max-w-[331px] mx-auto min-h-[594px] bg-background overflow-clip font-heading selection:bg-secondary/50">
      {/* Global Backgrounds */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <img
          className="w-full h-[227px] object-cover object-center"
          src="https://media.base44.com/images/public/6a37d9fdaf7a9d14d5fd8c01/b4f695cb0_3d2005174_f211003ae41980b41040ccdf226b42038dd9ed16.png"
          alt=""
          aria-hidden="true" />
        
        <img
          className="absolute top-[220px] left-0 w-full h-[306px] object-cover object-center"
          src="https://media.base44.com/images/public/6a37d9fdaf7a9d14d5fd8c01/5155b8632_a8ec8076a_e082916a0352d71fdbe6fa45a8014e36f5c6769f.png"
          alt=""
          aria-hidden="true" />
        
      </div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="relative z-10 flex flex-col h-full pb-20">
        
        {/* Header */}
        <motion.header variants={itemVariants} className="flex items-center justify-between px-3.5 pt-[19px]">
          <div className="flex items-center">
            <p className="text-figma-11 font-normal leading-figma-13 text-[#715f3f] tracking-wide">
              VINCLUB
            </p>
          </div>
          <div className="flex items-center gap-[15px]">
            <NotificationBell />
            <button 
              onClick={() => base44.auth.logout()}
              className="p-1 -m-1 transition-opacity hover:opacity-80 active:scale-95"
              title="Đăng xuất"
            >
              <img className="w-[15px] h-4 object-contain" src="https://media.base44.com/images/public/6a37d9fdaf7a9d14d5fd8c01/078594036_11de357bc_9b294d953cbc2903954760855a66112110260ce4.png" alt="Logout" />
            </button>
          </div>
        </motion.header>

        {/* User Card */}
        <motion.section variants={itemVariants} className="px-3.5 mt-[clamp(16px,10.3vw,34px)]">
          <div className="relative w-full rounded-xl overflow-clip shadow-lg">
            <img
              className="absolute inset-0 w-full h-full object-cover object-center z-0"
              src="https://media.base44.com/images/public/6a37d9fdaf7a9d14d5fd8c01/fdcc0b5da_f43a9e2b0_d1407e7bc675c73a738ea86627b5b5aba24a8d26.png"
              alt=""
              aria-hidden="true" />
            
            <div className="relative z-10 flex flex-col px-4 py-3.5 gap-5">
              {/* Profile Info */}
              <div className="flex items-center gap-2.5">
                <div className="w-[28px] h-[28px] rounded-full bg-[#948154] text-white flex items-center justify-center text-[12px] font-bold shrink-0 shadow-sm">
                  {avatarLetter}
                </div>
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-[11px] font-bold leading-snug text-[#76746a] truncate max-w-[200px] tracking-wide">
                      {displayName}
                    </p>
                    {user?.role === "admin" && (
                      <span className="text-[8px] bg-[#948154] text-white px-1.5 py-0.2 rounded font-bold uppercase shrink-0">
                        ADMIN
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] font-medium leading-snug text-[#7b7669] mt-0.5">
                    Số dư: <span className="font-bold text-[#5c5035]">{formattedBalance}</span>
                  </p>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="flex items-center justify-between px-2">
                <Link to="/profile" className="flex items-center gap-2.5 group">
                  <img className="w-3.5 h-3.5 object-contain transition-transform group-hover:scale-110" src="https://media.base44.com/images/public/6a37d9fdaf7a9d14d5fd8c01/542af9d57_f5e95a14d_6b662189c1987faec6d37db863ee2304850a4027.png" alt="" />
                  <span className="text-figma-10 font-normal leading-figma-12 text-figma-text-5">
                    Lịch sử giao dịch
                  </span>
                </Link>
                <img className="w-0.5 h-[25px] object-contain opacity-50" src="https://media.base44.com/images/public/6a37d9fdaf7a9d14d5fd8c01/e1de98f6e_d23cc45cc_a4a970e5c3f43d11f4624a3a2be5fe26a8792918.png" alt="" aria-hidden="true" />
                <Link to="/card" className="flex items-center gap-2.5 group">
                  <img className="w-3 h-[11px] object-contain transition-transform group-hover:scale-110" src="https://media.base44.com/images/public/6a37d9fdaf7a9d14d5fd8c01/3be389e50_739d21432_9b34fab910d5d0b865a5cd85932140d72265ff58.png" alt="" />
                  <span className="text-figma-10 font-normal leading-figma-12 text-[#6c665c]">
                    Tài khoản & Thẻ
                  </span>
                </Link>
              </div>

              {/* Support Link */}
              <Link to="/support" className="flex items-center justify-between w-full group pt-1">
                <div className="flex items-center gap-3">
                  <img className="w-3 h-[11px] object-contain" src="https://media.base44.com/images/public/6a37d9fdaf7a9d14d5fd8c01/a588e32ba_c04f8f218_daaf308cc39d043be1c7b66084d8eb48afd585a1.png" alt="" />
                  <span className="text-figma-10 font-normal leading-figma-12 text-[#646258]">
                    Chuyên viên chăm sóc khách hàng
                  </span>
                </div>
                <img className="w-[5px] h-[9px] object-contain transition-transform group-hover:translate-x-1" src="https://media.base44.com/images/public/6a37d9fdaf7a9d14d5fd8c01/c30e00dbf_24f6126c1_4983e9683cdee9853f55c41de420fdf2ed8118c2.png" alt="Go" />
              </Link>
            </div>
          </div>
        </motion.section>

        {/* Main Grid Menu */}
        <motion.nav variants={containerVariants} className="px-4 mt-[30px]">
          <div className="grid grid-cols-3 gap-y-8 gap-x-2">
            {/* Row 1 */}
            <Link to="/consultation">
              <motion.button variants={itemVariants} className="flex flex-col items-center gap-2.5 group w-full">
                <div className="min-h-[22px] flex items-end justify-center">
                  <img className="w-[23px] h-[22px] object-contain transition-transform group-hover:-translate-y-1" src="https://media.base44.com/images/public/6a37d9fdaf7a9d14d5fd8c01/936b3de06_c7684f7a0_f51dab0fd38e5d62764a28b06498f78a2c6a48e6.png" alt="" />
                </div>
                <p className="text-figma-10 font-medium leading-figma-14 text-center text-[#66645f]">
                  Tham vấn phúc<br />lợi
                </p>
              </motion.button>
            </Link>

            <Link to="/benefits">
              <motion.button variants={itemVariants} className="flex flex-col items-center gap-2.5 group w-full">
                <div className="min-h-[22px] flex items-end justify-center">
                  <img className="w-[22px] h-[22px] object-contain transition-transform group-hover:-translate-y-1" src="https://media.base44.com/images/public/6a37d9fdaf7a9d14d5fd8c01/5a2817953_72acccdc2_979fab6a8ad5b52c66c3e0a43dede4c88e797ed4.png" alt="" />
                </div>
                <p className="text-figma-10 font-medium leading-figma-12 text-center text-figma-text-9">
                  Ưu đãi phúc lợi
                </p>
              </motion.button>
            </Link>

            <Link to="/goals">
              <motion.button variants={itemVariants} className="flex flex-col items-center gap-2.5 group w-full">
                <div className="min-h-[22px] flex items-end justify-center">
                  <img className="w-[22px] h-[22px] object-contain transition-transform group-hover:-translate-y-1" src="https://media.base44.com/images/public/6a37d9fdaf7a9d14d5fd8c01/391bc4a8d_4e33fc1bc_0ddc690aa389904f9c0ec516dcf960888b181ba6.png" alt="" />
                </div>
                <p className="text-figma-10 font-medium leading-figma-12 text-center text-figma-text-10">
                  Mục tiêu
                </p>
              </motion.button>
            </Link>

            {/* Row 2 */}
            <Link to="/casino">
              <motion.button variants={itemVariants} className="flex flex-col items-center gap-2.5 group w-full">
                <div className="min-h-[22px] flex items-end justify-center">
                  <img className="w-[22px] h-[21px] object-contain transition-transform group-hover:-translate-y-1 rounded-md" src={casinoIcon} alt="Corona" />
                </div>
                <p className="text-figma-10 font-medium leading-figma-12 text-center text-figma-text-1">Casino / Giải trí</p>
              </motion.button>
            </Link>

            <Link to="/projects">
              <motion.button variants={itemVariants} className="flex flex-col items-center gap-2.5 group w-full">
                <div className="min-h-[22px] flex items-end justify-center">
                  <img className="w-[19px] h-[21px] object-contain transition-transform group-hover:-translate-y-1" src="https://media.base44.com/images/public/6a37d9fdaf7a9d14d5fd8c01/da7174f79_e96a00bb6_42e73705df870e073454d5641d5f04d4eb85433e.png" alt="" />
                </div>
                <p className="text-figma-10 font-medium leading-figma-12 text-center text-[#6a685f]">
                  Dự án
                </p>
              </motion.button>
            </Link>

            <Link to="/land">
              <motion.button variants={itemVariants} className="flex flex-col items-center gap-2.5 group w-full">
                <div className="min-h-[22px] flex items-end justify-center">
                  <img className="w-5 h-[22px] object-contain transition-transform group-hover:-translate-y-1" src="https://media.base44.com/images/public/6a37d9fdaf7a9d14d5fd8c01/c083e6d69_74369648b_bef8b8d7512ef5a23280282c7c4c233de94c005c.png" alt="" />
                </div>
                <p className="text-figma-10 font-medium leading-figma-15 text-center text-figma-text-1">
                  VinHomes
                </p>
              </motion.button>
            </Link>

            {/* Row 3 */}
            <Link to="/lucky-wheel">
              <motion.button variants={itemVariants} className="flex flex-col items-center gap-2.5 group w-full">
                <div className="min-h-[22px] flex items-end justify-center">
                  <img className="w-[18px] h-5 object-contain transition-transform group-hover:-translate-y-1" src="https://media.base44.com/images/public/6a37d9fdaf7a9d14d5fd8c01/1157663fb_82ea54d78_a7f3bafbdd84f23d152bc29974257b7929deae7e.png" alt="" />
                </div>
                <p className="text-figma-10 font-medium leading-figma-14 text-center text-figma-text-8">
                  Vòng quay may<br />mắn
                </p>
              </motion.button>
            </Link>

            <Link to="/resort">
              <motion.button variants={itemVariants} className="flex flex-col items-center gap-1.5 group w-full">
                <div className="relative w-[43px] min-h-[26px] flex flex-col items-center justify-center transition-transform group-hover:-translate-y-1">
                  <img className="absolute inset-0 w-full h-full object-contain" src="https://media.base44.com/images/public/6a37d9fdaf7a9d14d5fd8c01/17b322d8e_ed51e3965_4507a554ce1116fb18f795191dbc40ffa11916bf.png" alt="" />
                  <img className="w-3 h-3.5 relative z-10 -mt-1" src="https://media.base44.com/images/public/6a37d9fdaf7a9d14d5fd8c01/53431ea7b_efc8ca483_407589bb643be08347aafaeab518659779961f0f.png" alt="" />
                  <span className="text-figma-8 font-normal leading-figma-10 text-figma-text-7 relative z-10 mt-0.5">
                    VINPEARL
                  </span>
                </div>
                <p className="text-figma-10 font-medium leading-figma-17 text-center text-figma-text-6 mt-1">
                  Đầu tư nghỉ<br />dưỡng
                </p>
              </motion.button>
            </Link>

            <Link to="/stocks">
              <motion.button variants={itemVariants} className="flex flex-col items-center gap-2.5 group w-full">
                <div className="min-h-[22px] flex items-end justify-center">
                  <img className="w-[35px] h-[21px] object-contain transition-transform group-hover:-translate-y-1" src="https://media.base44.com/images/public/6a37d9fdaf7a9d14d5fd8c01/da424e2d1_e4a51668f_b20419057b323e4fe2418b9afa23a28b9843d67f.png" alt="" />
                </div>
                <p className="text-figma-10 font-medium leading-figma-15 text-center text-figma-text-5">
                  Đầu tư chứng<br />khoán
                </p>
              </motion.button>
            </Link>

          </div>
        </motion.nav>

        {/* News Section */}
        <NewsSection />
      </motion.div>

      {/* Bottom Navigation */}
      <BottomNav />
    </main>);
}