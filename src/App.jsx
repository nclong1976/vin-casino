import React, { lazy, Suspense, useState } from "react";
import { Toaster } from "sonner"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate, useNavigate, useLocation } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { ConfigProvider } from '@/lib/ConfigContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import AppErrorBoundary from '@/components/AppErrorBoundary';
import AdminRoute from '@/components/AdminRoute';
import isAdminUser from '@/lib/isAdminUser';
import PushNotificationBanner from '@/components/shared/PushNotificationBanner';
import WelcomeIntroPlayer from '@/components/WelcomeIntroPlayer';
import AppMaintenanceScreen from '@/components/AppMaintenanceScreen';
import { useDailyPayoutToast } from '@/hooks/useDailyPayoutToast';
import { useAppMaintenance } from '@/hooks/useAppMaintenance';

// Mỗi trang tách thành 1 chunk JS riêng (code-splitting theo route) thay vì
// gộp chung vào 1 bundle duy nhất ~2MB tải hết ngay từ lần mở app đầu tiên
// dù người dùng chỉ vào Trang chủ - đây là nguyên nhân chính khiến app tải
// chậm. Với React.lazy(), trình duyệt chỉ tải đúng chunk của trang đang
// điều hướng tới; các trang khác (game casino, các tab đầu tư, Admin...)
// chỉ tải khi thật sự cần. Route hiện hữu/thứ tự khai báo giữ nguyên 100%
// - chỉ đổi cách import.
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const OAuthConsent = lazy(() => import('./pages/OAuthConsent'));
const Home = lazy(() => import('./pages/Home'));
const Settings = lazy(() => import('./pages/Settings'));
const Projects = lazy(() => import('./pages/Projects'));
const Stocks = lazy(() => import('./pages/Stocks'));
const Casino = lazy(() => import('./pages/Casino'));
const BaiCao = lazy(() => import('./pages/BaiCao'));
const XiToBaLa = lazy(() => import('./pages/XiToBaLa'));
const TigerBaccarat = lazy(() => import('./pages/TigerBaccarat'));
const Signature = lazy(() => import('./pages/Signature'));
const Support = lazy(() => import('./pages/Support'));
const Profile = lazy(() => import('./pages/Profile'));
const Contract = lazy(() => import('./pages/Contract'));
const Admin = lazy(() => import('./pages/Admin'));
const Consultation = lazy(() => import('./pages/Consultation'));
const Benefits = lazy(() => import('./pages/Benefits'));
const Goals = lazy(() => import('./pages/Goals'));
const LandInvestment = lazy(() => import('./pages/LandInvestment'));
const LuckyWheel = lazy(() => import('./pages/LuckyWheel'));
const Resort = lazy(() => import('./pages/Resort'));
const News = lazy(() => import('./pages/News'));
const MembershipCard = lazy(() => import('./pages/MembershipCard'));

// Fallback hiển thị trong lúc chờ tải chunk của trang đích - cùng giao
// diện với splash loader lúc xác thực (ngắn, không nháy layout lạ).
const RouteLoadingFallback = () => (
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
  </div>
);

const AuthenticatedApp = () => {
  const { isAuthenticated, user, isLoadingAuth, isLoadingPublicSettings, authError, otpPending } = useAuth();
  const navigate = useNavigate();
  const [introCompleted, setIntroCompleted] = useState(
    () => sessionStorage.getItem("vinclub_welcome_seen") === "true"
  );

  // Gọi vô điều kiện trước mọi early-return bên dưới (Rules of Hooks) - tự
  // no-op khi chưa có user.id, tắt hẳn khi đăng xuất (subscribe cũ tự huỷ
  // qua cleanup effect khi userId đổi/về null).
  useDailyPayoutToast(user?.id);

  // Cờ bảo trì toàn bộ trang chủ - chỉ theo dõi cho người dùng thường
  // (enabled=false với Admin nên hook no-op hoàn toàn, Admin không bị ảnh
  // hưởng/không tốn round-trip tải cờ này). Cũng phải gọi vô điều kiện
  // trước mọi early-return, cùng lý do như trên.
  const appMaintenance = useAppMaintenance(!!user && !isAdminUser(user));

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

  // 1. Luồng Người dùng CHƯA đăng ký / đăng nhập / CHƯA xác thực xong OTP:
  // - Nếu chưa xem video giới thiệu: Phát video chào hỏi toàn màn hình
  // - Khi kết thúc video hoặc bấm Bỏ qua / Đăng nhập: Chuyển đến màn hình Đăng nhập
  // - Chặn toàn bộ việc truy cập vào trang chủ và các trang nội bộ
  // - otpPending=true nghĩa là mật khẩu đã đúng (Supabase đã có session
  //   thật) nhưng CHƯA nhập đúng OTP - vẫn phải giữ ở đây, không cho vào app
  //   thật, để màn OTP ở Login.jsx (state "step" cục bộ) có ý nghĩa chặn
  //   thật thay vì chỉ là UI hiện ra rồi bị thay ngay bởi Trang chủ.
  if (!isAuthenticated || !user || otpPending) {
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
  // Chờ tải xong cờ bảo trì trước khi quyết định render gì (tránh hiện
  // trang chủ thật rồi mới bị thay bằng màn chặn) - Admin đã tách nhánh và
  // return ở trên nên không đi qua đây, không bị chờ/ảnh hưởng bởi bước này.
  if (appMaintenance === null) {
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
      </div>
    );
  }

  // Bảo trì vẫn cho phép xem trang cá nhân và nhắn tin CSKH (đúng yêu cầu -
  // không khoá hẳn 2 kênh này, khách vẫn cần liên hệ được trong lúc bảo
  // trì). Chuông thông báo bình thường chỉ nằm trong Home.jsx nên được gắn
  // trực tiếp vào AppMaintenanceScreen để vẫn "xem được thông báo" mà
  // không cần mở lại toàn bộ Trang chủ (Trang chủ có nạp/rút/đầu tư... vẫn
  // phải chặn).
  if (appMaintenance.enabled) {
    return (
      <>
        <PushNotificationBanner />
        <Routes>
          <Route path="/profile" element={<Profile />} />
          <Route path="/support" element={<Support />} />
          <Route path="*" element={<AppMaintenanceScreen message={appMaintenance.message} />} />
        </Routes>
      </>
    );
  }

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
              <Suspense fallback={<RouteLoadingFallback />}>
                <AuthenticatedApp />
              </Suspense>
            </Router>
            <Toaster />
          </QueryClientProvider>
        </AuthProvider>
      </ConfigProvider>
    </AppErrorBoundary>
  )
}

export default App