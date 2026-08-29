import React, { useState } from "react";
import { Toaster } from "sonner"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate, useNavigate, useLocation } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { ConfigProvider } from '@/lib/ConfigContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import AppErrorBoundary from '@/components/AppErrorBoundary';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import OAuthConsent from './pages/OAuthConsent';
import Home from './pages/Home';
import Settings from './pages/Settings';
import Projects from './pages/Projects';
import Stocks from './pages/Stocks';
import Casino from './pages/Casino';
import BaiCao from './pages/BaiCao';
import XiToBaLa from './pages/XiToBaLa';
import TigerBaccarat from './pages/TigerBaccarat';
import Signature from './pages/Signature';
import Support from './pages/Support';
import Profile from './pages/Profile';
import Contract from './pages/Contract';
import Admin from './pages/Admin';
import AdminRoute from '@/components/AdminRoute';
import isAdminUser from '@/lib/isAdminUser';
import Consultation from './pages/Consultation';
import Benefits from './pages/Benefits';
import Goals from './pages/Goals';
import LandInvestment from './pages/LandInvestment';
import LuckyWheel from './pages/LuckyWheel';
import Resort from './pages/Resort';
import News from './pages/News';
import MembershipCard from './pages/MembershipCard';
import PushNotificationBanner from '@/components/shared/PushNotificationBanner';
import WelcomeIntroPlayer from '@/components/WelcomeIntroPlayer';

const AuthenticatedApp = () => {
  const { isAuthenticated, user, isLoadingAuth, isLoadingPublicSettings, authError } = useAuth();
  const navigate = useNavigate();
  const [introCompleted, setIntroCompleted] = useState(
    () => sessionStorage.getItem("vinclub_welcome_seen") === "true"
  );

  // Splash luxury loader
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 bg-[#0c0a09] flex flex-col items-center justify-center gap-4 z-[99999]">
        <div className="relative flex items-center justify-center">
          <div className="w-16 h-16 rounded-full border-2 border-[#948154]/30 border-t-[#d4af37] animate-spin" />
          <img
            src="/logo.png"
            alt="VinClub"
            className="w-10 h-10 rounded-full object-cover absolute"
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
        </div>
        <p className="text-[12px] font-bold text-[#eddab3] tracking-widest uppercase">
          VinClub
        </p>
      </div>
    );
  }

  if (authError && authError.type === 'user_not_registered') {
    return <UserNotRegisteredError />;
  }

  // 1. Luồng Người dùng CHƯA đăng ký / đăng nhập:
  // - Nếu chưa xem video giới thiệu: Phát video chào hỏi toàn màn hình
  // - Khi kết thúc video hoặc bấm Bỏ qua / Đăng nhập: Chuyển đến màn hình Đăng nhập
  // - Chặn toàn bộ việc truy cập vào trang chủ và các trang nội bộ
  if (!isAuthenticated || !user) {
    if (!introCompleted) {
      return (
        <WelcomeIntroPlayer
          onFinish={(targetRoute = "/login") => {
            setIntroCompleted(true);
            navigate(targetRoute);
          }}
        />
      );
    }

    return (
      <>
        <PushNotificationBanner />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/oauth/consent" element={<OAuthConsent />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </>
    );
  }

  // 2a. Luồng Quản trị viên (admin): tách biệt hoàn toàn khỏi luồng người dùng.
  // Admin chỉ ở trong Bảng quản trị để quản lý khách hàng, dự án, casino...
  // mọi đường dẫn khác (trang chủ, casino, đầu tư...) đều điều hướng về /admin.
  if (isAdminUser(user)) {
    return (
      <Routes>
        <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    );
  }

  // 2b. Luồng Người dùng ĐÃ đăng nhập: Toàn quyền truy cập ứng dụng (không có /admin)
  return (
    <>
      <PushNotificationBanner />
      <Routes>
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="/register" element={<Navigate to="/" replace />} />
        <Route path="/forgot-password" element={<Navigate to="/" replace />} />
        <Route path="/reset-password" element={<Navigate to="/" replace />} />
        <Route path="/oauth/consent" element={<Navigate to="/" replace />} />
        <Route path="/" element={<Home />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/stocks" element={<Stocks />} />
        <Route path="/casino" element={<Casino />} />
        <Route path="/casino/bai-cao" element={<BaiCao />} />
        <Route path="/casino/xi-to-ba-la" element={<XiToBaLa />} />
        <Route path="/casino/3-card-poker" element={<XiToBaLa />} />
        <Route path="/casino/tiger-baccarat" element={<TigerBaccarat />} />
        <Route path="/casino/baccarat-long-ho" element={<TigerBaccarat />} />
        <Route path="/casino/baccarat" element={<TigerBaccarat />} />
        <Route path="/signature" element={<Signature />} />
        <Route path="/support" element={<Support />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/contract/:id" element={<Contract />} />
        <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
        <Route path="/consultation" element={<Consultation />} />
        <Route path="/benefits" element={<Benefits />} />
        <Route path="/goals" element={<Goals />} />
        <Route path="/land" element={<LandInvestment />} />
        <Route path="/lucky-wheel" element={<LuckyWheel />} />
        <Route path="/resort" element={<Resort />} />
        <Route path="/news" element={<News />} />
        <Route path="/card" element={<MembershipCard />} />
        <Route path="/membership" element={<MembershipCard />} />
        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </>
  );
};

function App() {
  return (
    <AppErrorBoundary>
      <ConfigProvider>
        <AuthProvider>
          <QueryClientProvider client={queryClientInstance}>
            <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <AuthenticatedApp />
            </Router>
            <Toaster />
          </QueryClientProvider>
        </AuthProvider>
      </ConfigProvider>
    </AppErrorBoundary>
  )
}

export default App