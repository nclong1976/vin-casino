import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { ConfigProvider } from '@/lib/ConfigContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import OAuthConsent from './pages/OAuthConsent';
import Home from './pages/Home';
// Add page imports here
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
import Consultation from './pages/Consultation';
import Benefits from './pages/Benefits';
import Goals from './pages/Goals';
import LandInvestment from './pages/LandInvestment';
import LuckyWheel from './pages/LuckyWheel';
import Resort from './pages/Resort';
import News from './pages/News';
import MembershipCard from './pages/MembershipCard';
import PushNotificationBanner from '@/components/shared/PushNotificationBanner';

import RealTimeMonitor from '@/components/shared/RealTimeMonitor';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-muted border-t-foreground rounded-full animate-spin" />
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      const publicPaths = ['/login', '/register', '/forgot-password', '/reset-password', '/oauth/consent'];
      const isPublicPath = publicPaths.includes(window.location.pathname);
      if (!isPublicPath) {
        navigateToLogin();
        return null;
      }
    }
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
        <Route path="/" element={<Home />} />
        {/* Add your page Route elements here */}
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
    <ConfigProvider>
      <AuthProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <AuthenticatedApp />
          </Router>
          <RealTimeMonitor />
          <Toaster />
        </QueryClientProvider>
      </AuthProvider>
    </ConfigProvider>
  )
}

export default App