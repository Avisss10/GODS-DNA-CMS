import { toast as sonnerToast } from 'sonner';

// Aturan 5.A/5.B Tahap 10: toast sukses hilang otomatis (singkat),
// toast error harus tetap tampil sampai ditutup manual oleh user.
// closeButton sudah aktif secara global di <Toaster /> (lihat App.tsx),
// jadi Infinity di sini aman — user selalu punya cara menutupnya.
const SUCCESS_DURATION_MS = 4000;
const ERROR_DURATION_MS = Number.POSITIVE_INFINITY;

type ToastOptions = Parameters<typeof sonnerToast.success>[1];
type ToastMessage = Parameters<typeof sonnerToast.success>[0];

function toastFn(message: ToastMessage, options?: ToastOptions) {
  return sonnerToast(message, options);
}

toastFn.success = (message: ToastMessage, options?: ToastOptions) =>
  sonnerToast.success(message, { duration: SUCCESS_DURATION_MS, ...options });

toastFn.error = (message: ToastMessage, options?: ToastOptions) =>
  sonnerToast.error(message, { duration: ERROR_DURATION_MS, ...options });

toastFn.info = sonnerToast.info;
toastFn.warning = sonnerToast.warning;
toastFn.message = sonnerToast.message;
toastFn.loading = sonnerToast.loading;
toastFn.promise = sonnerToast.promise;
toastFn.dismiss = sonnerToast.dismiss;
toastFn.custom = sonnerToast.custom;

export const toast = toastFn;