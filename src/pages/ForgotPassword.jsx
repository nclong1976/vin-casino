import React, { useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, ArrowLeft, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await base44.auth.resetPasswordRequest(email);
    } catch {
      // Always show success regardless
    } finally {
      setLoading(false);
      setSent(true);
    }
  };

  return (
    <AuthLayout
      icon={Mail}
      title="Khôi phục mật khẩu"
      subtitle="Chúng tôi sẽ gửi bạn liên kết đặt lại mật khẩu"
      footer={
        <Link to="/login" className="text-[#c4a35a] font-medium hover:underline">
          <ArrowLeft className="w-3 h-3 inline mr-1" />Quay lại đăng nhập
        </Link>
      }
    >
      {sent ? (
        <div className="text-center py-2">
          <div className="w-12 h-12 rounded-full bg-[#948154]/15 border border-[#948154]/30 flex items-center justify-center mx-auto mb-3">
            <Mail className="w-5 h-5 text-[#c4a35a]" />
          </div>
          <p className="text-[13px] text-white/60 leading-relaxed">
            Nếu tài khoản tồn tại, bạn sẽ nhận được liên kết khôi phục mật khẩu qua email shortly.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-white/60 text-[12px]">Địa chỉ email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" aria-hidden="true" />
              <Input
                id="email"
                type="email"
                autoComplete="email"
                autoFocus
                placeholder="ban@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10 h-11 bg-[#0a0807] border-[#948154]/20 text-white placeholder:text-white/20 focus:border-[#948154]/50"
                required
              />
            </div>
          </div>
          <Button
            type="submit"
            className="w-full h-11 font-semibold bg-[#948154] hover:bg-[#837046] text-white border-0"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Đang gửi...
              </>
            ) : (
              "Gửi liên kết"
            )}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}