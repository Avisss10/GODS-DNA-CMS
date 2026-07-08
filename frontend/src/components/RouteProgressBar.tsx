import { useEffect, useRef, useState } from 'react';
import { useNavigation } from 'react-router-dom';
import { cn } from '@/lib/utils';

/**
 * Thin progress bar di top layout, muncul saat pindah route.
 * Pola mirip NProgress: naik cepat ke ~85% lalu "nunggu", begitu
 * navigasi selesai langsung snap ke 100% lalu fade-out singkat.
 * Tidak pakai library eksternal — cukup state + interval ringan.
 */
export default function RouteProgressBar() {
  const navigation = useNavigation();
  const isLoading = navigation.state !== 'idle';

  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);

  const intervalRef = useRef<number | undefined>(undefined);
  const hideTimeoutRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (isLoading) {
      window.clearTimeout(hideTimeoutRef.current);
      setVisible(true);
      setProgress(15);

      intervalRef.current = window.setInterval(() => {
        setProgress((p) => (p < 85 ? p + (85 - p) * 0.15 : p));
      }, 150);
    } else {
      window.clearInterval(intervalRef.current);
      setProgress(100);

      hideTimeoutRef.current = window.setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 200);
    }

    return () => {
      window.clearInterval(intervalRef.current);
    };
  }, [isLoading]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 print:hidden"
    >
      <div
        className={cn(
          'h-full bg-gradient-to-r from-accent-from to-accent-to transition-[width,opacity] duration-200 ease-out',
          visible ? 'opacity-100' : 'opacity-0',
        )}
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}