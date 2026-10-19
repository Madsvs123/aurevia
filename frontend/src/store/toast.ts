import { create } from 'zustand';

export type ToastKind = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
  id: number;
  kind: ToastKind;
  title: string;
  message?: string;
}

interface ToastState {
  toasts: ToastItem[];
  push: (kind: ToastKind, title: string, message?: string) => void;
  dismiss: (id: number) => void;
  clear: () => void;
}

let toastId = 0;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (kind, title, message) => {
    const id = ++toastId;
    set({ toasts: [...get().toasts, { id, kind, title, message }] });
    // Auto-dismiss after 5s (errors stay a bit longer).
    const ttl = kind === 'error' ? 5000 : 7000;
    window.setTimeout(() => get().dismiss(id), ttl);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  clear: () => set({ toasts: [] }),
}));

export function toastSuccess(title: string, message?: string) {
  useToastStore.getState().push('info', title, message);
}
export function toastError(title: string, message?: string) {
  useToastStore.getState().push('error', title, message);
}
export function toastInfo(title: string, message?: string) {
  useToastStore.getState().push('info', title, message);
}
export function toastWarning(title: string, message?: string) {
  useToastStore.getState().push('warning', title, message);
}
