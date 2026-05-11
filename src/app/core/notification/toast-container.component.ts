import { CommonModule } from '@angular/common';
import { Component, HostBinding, inject } from '@angular/core';
import { ToastService } from './toast.service';
import { ToastMessage } from './toast.model';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toast-stack" *ngIf="toasts.length">
      <div
        class="toast"
        *ngFor="let toast of toasts"
        [class.error]="toast.variant === 'error'"
        [class.success]="toast.variant === 'success'"
        [class.info]="toast.variant === 'info'"
        [class.warning]="toast.variant === 'warning'"
        (click)="dismiss(toast.id)"
      >
        <div class="toast-title">{{ toast.title }}</div>
        <div class="toast-message">{{ toast.message }}</div>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        position: fixed;
        inset: 16px 16px auto auto;
        z-index: 1000;
        pointer-events: none;
      }
      .toast-stack {
        display: flex;
        flex-direction: column;
        gap: 10px;
        pointer-events: none;
      }
      .toast {
        min-width: 260px;
        max-width: 360px;
        background: #1f2937;
        color: #f9fafb;
        border-radius: 10px;
        padding: 12px 14px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
        border-left: 4px solid #10b981;
        pointer-events: auto;
        cursor: pointer;
        transition: transform 120ms ease, opacity 120ms ease;
      }
      .toast:hover {
        transform: translateY(-2px);
      }
      .toast-title {
        font-weight: 700;
        margin-bottom: 4px;
      }
      .toast-message {
        font-size: 0.95rem;
        line-height: 1.3;
      }
      .toast.error {
        border-color: #ef4444;
        background: #7f1d1d;
      }
      .toast.success {
        border-color: #10b981;
        background: #064e3b;
      }
      .toast.info {
        border-color: #3b82f6;
        background: #1e3a8a;
      }
      .toast.warning {
        border-color: #f59e0b;
        background: #78350f;
      }
    `,
  ],
})
export class ToastContainerComponent {
  private readonly toastService = inject(ToastService);
  toasts: ToastMessage[] = [];

  @HostBinding('attr.aria-live') ariaLive = 'polite';

  constructor() {
    this.toastService.toasts$.subscribe((items) => (this.toasts = items));
  }

  dismiss(id: string) {
    this.toastService.dismiss(id);
  }
}
