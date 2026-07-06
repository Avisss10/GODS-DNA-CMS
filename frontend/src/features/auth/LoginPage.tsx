import { zodResolver } from '@hookform/resolvers/zod';
import axios from 'axios';
import { Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Navigate, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getMe, login as loginRequest } from '@/features/auth/auth.api';
import { useAuthStore } from '@/store/auth.store';

const loginSchema = z.object({
  username: z.string().min(1, 'Username wajib diisi'),
  password: z.string().min(1, 'Password wajib diisi'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const status = useAuthStore((s) => s.status);
  const setUser = useAuthStore((s) => s.setUser);
  const navigate = useNavigate();

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
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <Card className="w-full max-w-sm rounded-card">
        <CardHeader>
          <CardTitle className="text-xl">GODS DNA CMS</CardTitle>
          <CardDescription>Masuk untuk melanjutkan</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                autoComplete="username"
                disabled={isSubmitting}
                {...register('username')}
              />
              {errors.username && <p className="text-xs text-destructive">{errors.username.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                disabled={isSubmitting}
                {...register('password')}
              />
              {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
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
    </div>
  );
}
