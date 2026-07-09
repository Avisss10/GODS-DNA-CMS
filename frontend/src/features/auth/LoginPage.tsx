import { zodResolver } from '@hookform/resolvers/zod';
import axios from 'axios';
import { AlertCircle, Eye, EyeOff, Lock, Loader2, User } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useNavigate } from 'react-router-dom';
import { toast } from '@/lib/toast';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getMe, login as loginRequest } from '@/features/auth/auth.api';
import { useAuthStore } from '@/store/auth.store';
import gwLogoWhite from '@/assets/brand/gw-logo-white.png';
import gwLogoSlate from '@/assets/brand/gw-logo-slate.png';

const loginSchema = z.object({
  username: z.string().min(1, 'Username wajib diisi'),
  password: z.string().min(1, 'Password wajib diisi'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const status = useAuthStore((s) => s.status);
  const setUser = useAuthStore((s) => s.setUser);
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    mode: 'onBlur',
  });

  if (status === 'authenticated') {
    return <Navigate to="/dashboard" replace />;
  }

  async function onSubmit(values: LoginFormValues) {
    try {
      await loginRequest(values.username, values.password);
      const me = await getMe();
      setUser(me);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      const httpStatus = axios.isAxiosError(err) ? err.response?.status : undefined;

      if (httpStatus === 401) {
        toast.error('Username atau password salah');
      } else if (httpStatus === 429) {
        const message = axios.isAxiosError(err)
          ? (err.response?.data as { message?: string } | undefined)?.message
          : undefined;
        toast.error(message ?? 'Akun dikunci sementara', { duration: Infinity });
      } else {
        toast.error('Terjadi kesalahan pada server, silakan coba lagi');
      }
    }
  }

  return (
    <div className="flex min-h-screen bg-surface">
      {/* Panel branding — hanya tampil di layar lg+ */}
      <div className="relative hidden w-1/2 flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-accent-from to-accent-to p-12 lg:flex">
        <div aria-hidden className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div aria-hidden className="absolute -bottom-32 -right-16 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <img src={gwLogoWhite} alt="GOD'S DNA Grand Wisata" className="relative w-64 max-w-full" />
        <p className="relative mt-6 max-w-xs text-center text-sm text-white/80">
          Sistem manajemen jemaat, cell group, dan pelayanan gereja.
        </p>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <img
            src={gwLogoSlate}
            alt="GOD'S DNA Grand Wisata"
            className="mx-auto mb-6 h-7 w-auto lg:hidden"
          />

          <Card className="rounded-xl border-slate-200/70 shadow-popover">
            <CardHeader>
              <CardTitle className="text-xl">GODS DNA CMS</CardTitle>
              <CardDescription>Masuk untuk melanjutkan</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
                <div className="space-y-1.5">
                  <Label htmlFor="username">Username</Label>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      id="username"
                      autoComplete="username"
                      disabled={isSubmitting}
                      className="pl-9"
                      {...register('username')}
                    />
                  </div>
                  {errors.username && (
                    <p className="flex items-center gap-1 text-xs text-destructive">
                      <AlertCircle className="h-3.5 w-3.5" />
                      {errors.username.message}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      disabled={isSubmitting}
                      className="pl-9 pr-9"
                      {...register('password')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-smooth hover:text-slate-600"
                      aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {errors.password && (
                    <p className="flex items-center gap-1 text-xs text-destructive">
                      <AlertCircle className="h-3.5 w-3.5" />
                      {errors.password.message}
                    </p>
                  )}
                </div>

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-gradient-to-r from-accent-from to-accent-to text-white"
                >
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isSubmitting ? 'Masuk...' : 'Masuk'}
                </Button>
              </form>
            </CardContent>
          </Card>

          <p className="mt-6 text-center text-xs text-slate-400">GODS DNA CMS · Grand Wisata</p>
        </div>
      </div>
    </div>
  );
}
