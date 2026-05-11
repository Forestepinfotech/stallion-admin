import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { nanoid } from 'nanoid/non-secure';
import { ToastMessage, ToastVariant } from './toast.model';

const DEFAULT_TIMEOUT = 3500;

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly subject = new BehaviorSubject<ToastMessage[]>([]);
  readonly toasts$ = this.subject.asObservable();

  success(message: string, title = 'Success') {
    this.push({ message, title, variant: 'success' });
  }

  error(message: string, title = 'Error') {
    this.push({ message, title, variant: 'error', timeoutMs: 4500 });
  }

  info(message: string, title = 'Info') {
    this.push({ message, title, variant: 'info' });
  }

  warning(message: string, title = 'Warning') {
    this.push({ message, title, variant: 'warning' });
  }

  dismiss(id: string) {
    this.subject.next(this.subject.value.filter((t) => t.id !== id));
  }

  private push(partial: Omit<ToastMessage, 'id' | 'timeoutMs'> & { timeoutMs?: number }) {
    const toast: ToastMessage = {
      id: nanoid(8),
      timeoutMs: partial.timeoutMs ?? DEFAULT_TIMEOUT,
      ...partial,
    };
    this.subject.next([...this.subject.value, toast]);
    setTimeout(() => this.dismiss(toast.id), toast.timeoutMs);
  }
}
