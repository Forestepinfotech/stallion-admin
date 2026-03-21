import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AdminOrdersService } from '../../../core/api/generated/admin-orders/admin-orders.service';
import type { AdminOrderDetailDto } from '../../../core/api/generated/schemas';
import { ToastService } from '../../../core/notification/toast.service';

@Component({
  selector: 'app-admin-order-detail',
  imports: [CommonModule, RouterLink],
  templateUrl: './admin-order-detail.component.html',
  styleUrl: './admin-order-detail.component.css',
})
export class AdminOrderDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly ordersApi = inject(AdminOrdersService);
  private readonly toast = inject(ToastService);

  loading = false;
  order: AdminOrderDetailDto | null = null;
  loadError: string | null = null;
  orderId: string | null = null;

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.toast.error('Order id is missing.');
      return;
    }

    this.orderId = id;
    this.loadOrder(id);
  }

  retry(): void {
    if (!this.orderId) return;
    this.loadOrder(this.orderId);
  }

  private loadOrder(id: string): void {
    this.loading = true;
    this.loadError = null;
    this.order = null;
    this.ordersApi
      .ordersControllerGet(id)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (response) => {
          this.order = response.data;
        },
        error: (error: unknown) => {
          this.loadError = this.getApiErrorMessage(error, 'Failed to load order details.');
          this.toast.error(this.loadError);
        },
      });
  }

  private getApiErrorMessage(error: unknown, fallback: string): string {
    if (
      typeof error === 'object' &&
      error !== null &&
      'error' in error &&
      typeof error.error === 'object' &&
      error.error !== null &&
      'message' in error.error
    ) {
      const message = error.error.message;
      if (typeof message === 'string') return message;
      if (Array.isArray(message) && message.length > 0) return String(message[0]);
    }

    if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
      return error.message;
    }

    return fallback;
  }
}
