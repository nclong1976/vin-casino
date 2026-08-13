import React from "react";
import { Link } from "react-router-dom";
import cskhIcon from "@/assets/images/regenerated_image_1786328347646.png";

export default function BottomNav() {
  return (
    <div className="absolute bottom-0 left-0 w-full h-16 z-50">
      <img
        className="absolute inset-0 w-full h-full object-cover object-center z-0"
        src="https://media.base44.com/images/public/6a37d9fdaf7a9d14d5fd8c01/33acec9c8_a81768da3_7e4b2cc377b3f8d5ca2105ceb3f60b5b6e96a100.png"
        alt=""
        aria-hidden="true" />
      

      <div className="relative z-10 flex items-center justify-between h-full px-1.5 pb-1">
        {/* Main Nav Pill */}
        <div className="flex-1 min-h-[51px] bg-secondary rounded-[23px] shadow-[inset_0_0_0_3px_#16100b] flex items-center justify-between px-6">
          <Link to="/" className="flex flex-col items-center gap-1.5 group">
            <img className="w-[17px] h-4 object-contain transition-transform group-active:scale-90" src="https://media.base44.com/images/public/6a37d9fdaf7a9d14d5fd8c01/997bcc3f6_0d192f421_df32c1b5f7db0ce361b63bc7095f22f1aa25d407.png" alt="Home" />
            <span className="text-figma-9 font-normal leading-figma-11 text-figma-text-4">Trang chủ

            </span>
          </Link>

          <Link to="/card" className="relative -mt-1 group">
            <div className="absolute inset-0 bg-white/5 rounded-full blur-md opacity-0 group-hover:opacity-100 transition-opacity" />
            <img className="w-8 h-8 object-contain relative z-10 transition-transform group-active:scale-90" src="https://media.base44.com/images/public/6a37d9fdaf7a9d14d5fd8c01/5a54623ee_6403c5d8f_464b19a56ec1fa81e654a1ece22e482687d3839e.png" alt="Thẻ thành viên" />
          </Link>

          <Link to="/profile" className="flex flex-col items-center gap-1.5 group">
            <img className="w-3.5 h-[17px] object-contain transition-transform group-active:scale-90" src="https://media.base44.com/images/public/6a37d9fdaf7a9d14d5fd8c01/799d16aa0_105523af2_5ae0e8ec7d4e6c73d294b706aed29c33351add41.png" alt="Profile" />
            <span className="text-figma-10 font-normal leading-figma-12 text-figma-text-3">Cá nhân

            </span>
          </Link>
        </div>

        {/* Floating Action (CSKH) */}
        <Link to="/support" className="w-[45px] flex flex-col items-center justify-center gap-1 group shrink-0">
          <img
            className="w-5 h-5 object-contain transition-transform group-active:scale-90 filter drop-shadow-xs"
            src={cskhIcon}
            alt="Support"
            referrerPolicy="no-referrer"
          />
          <span className="text-figma-9 font-normal leading-figma-11 text-center text-figma-text-2">
            Cskh
          </span>
        </Link>
      </div>

      {/* Home Indicator Bar */}
      <div className="absolute bottom-0 left-0 w-full flex justify-center pb-1 z-20 pointer-events-none">
        <img className="w-[331px] h-2 object-contain" src="https://media.base44.com/images/public/6a37d9fdaf7a9d14d5fd8c01/d711c8a6a_3ab4ea6d0_3b87849880050ff7d5883ecd8f638b21b524f2d3.png" alt="" aria-hidden="true" />
      </div>
    </div>);

}