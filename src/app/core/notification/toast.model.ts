export type ToastVariant = 'success' | 'error' | 'info' | 'warning';

export interface ToastMessage {
  id: string;
  title?: string;
  message: string;
  variant: ToastVariant;
  timeoutMs: number;
}
