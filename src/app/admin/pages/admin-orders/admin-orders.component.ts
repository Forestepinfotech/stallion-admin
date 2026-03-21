import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AdminOrdersService } from '../../../core/api/generated/admin-orders/admin-orders.service';
import type {
  AdminOrderListItemDto,
  OrdersControllerListParams,
  PaginatedOrdersResponseDtoMeta,
} from '../../../core/api/generated/schemas';
import { ToastService } from '../../../core/notification/toast.service';

type BooleanFilter = 'all' | 'true' | 'false';

interface OrdersMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

@Component({
  selector: 'app-admin-orders',
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './admin-orders.component.html',
  styleUrl: './admin-orders.component.css',
})
export class AdminOrdersComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly ordersApi = inject(AdminOrdersService);
  private readonly toast = inject(ToastService);

  readonly pageSizeOptions = ['20', '50', '100'];
  readonly booleanOptions: Array<{ value: BooleanFilter; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'true', label: 'Yes' },
    { value: 'false', label: 'No' },
  ];

  readonly filterForm = this.fb.nonNullable.group({
    search: [''],
    customerName: [''],
    customerEmail: [''],
    customerPhone: [''],
    userId: [''],
    productId: [''],
    statusId: [''],
    isPaid: ['all' as BooleanFilter],
    isActive: ['all' as BooleanFilter],
    dateFrom: [''],
    dateTo: [''],
    sortBy: ['created_at'],
    limit: ['50'],
  });

  loading = false;
  loadError: string | null = null;
  orders: AdminOrderListItemDto[] = [];
  meta: OrdersMeta = { page: 1, limit: 50, total: 0, totalPages: 1 };
  appliedParams: OrdersControllerListParams = { page: 1, limit: 50, sortBy: 'created_at' };

  ngOnInit(): void {
    this.loadOrders();
  }

  get limit(): number {
    return this.meta.limit;
  }

  get totalOrders(): number {
    return this.meta.total;
  }

  get totalPages(): number {
    return this.meta.totalPages;
  }

  get showingFrom(): number {
    if (this.meta.total === 0) return 0;
    return (this.meta.page - 1) * this.meta.limit + 1;
  }

  get showingTo(): number {
    return Math.min(this.meta.page * this.meta.limit, this.meta.total);
  }

  get canGoPrev(): boolean {
    return this.meta.page > 1;
  }

  get canGoNext(): boolean {
    return this.meta.page < this.meta.totalPages;
  }

  applyFilters(): void {
    this.loadOrders({
      ...this.buildListParams(),
      page: 1,
      limit: Number(this.filterForm.get('limit')!.value ?? '50'),
    });
  }

  resetFilters(): void {
    this.filterForm.reset({
      search: '',
      customerName: '',
      customerEmail: '',
      customerPhone: '',
      userId: '',
      productId: '',
      statusId: '',
      isPaid: 'all',
      isActive: 'all',
      dateFrom: '',
      dateTo: '',
      sortBy: 'created_at',
      limit: '50',
    });
    this.loadOrders({ page: 1, limit: 50, sortBy: 'created_at' });
  }

  onPageSizeChange(): void {
    this.loadOrders({
      ...this.buildListParams(),
      page: 1,
      limit: Number(this.filterForm.get('limit')!.value ?? '50'),
    });
  }

  changePage(page: number): void {
    if (page < 1 || page > this.meta.totalPages || page === this.meta.page) return;
    this.loadOrders({ ...this.appliedParams, page });
  }

  refresh(): void {
    this.loadOrders();
  }

  trackByOrderId(_: number, item: AdminOrderListItemDto): number {
    return item.order_id;
  }

  private loadOrders(params: OrdersControllerListParams = this.appliedParams): void {
    this.appliedParams = params;
    this.loading = true;
    this.loadError = null;
    this.ordersApi
      .ordersControllerList(params)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (response) => {
          this.orders = Array.isArray(response.data) ? response.data : [];
          this.meta = this.normalizeMeta(response.meta, params.page ?? 1, params.limit ?? 50);
        },
        error: (error: unknown) => {
          this.orders = [];
          this.meta = this.normalizeMeta(undefined, params.page ?? 1, params.limit ?? 50);
          this.loadError = this.getApiErrorMessage(error, 'Failed to load orders.');
          this.toast.error(this.loadError);
        },
      });
  }

  private buildListParams(): OrdersControllerListParams {
    const value = this.filterForm.getRawValue();
    return {
      search: this.emptyToUndefined(value.search),
      customer_name: this.emptyToUndefined(value.customerName),
      customer_email: this.emptyToUndefined(value.customerEmail),
      customer_phone: this.emptyToUndefined(value.customerPhone),
      user_id: this.toNumber(value.userId),
      product_id: this.toNumber(value.productId),
      status_id: this.toNumber(value.statusId),
      is_paid: this.toBoolean(value.isPaid),
      is_active: this.toBoolean(value.isActive),
      dateFrom: this.emptyToUndefined(value.dateFrom),
      dateTo: this.emptyToUndefined(value.dateTo),
      sortBy: this.emptyToUndefined(value.sortBy),
      page: this.appliedParams.page ?? 1,
      limit: Number(value.limit ?? '50'),
    };
  }

  private normalizeMeta(
    meta: PaginatedOrdersResponseDtoMeta | undefined,
    fallbackPage: number,
    fallbackLimit: number,
  ): OrdersMeta {
    const source = (meta ?? {}) as Record<string, unknown>;
    const page = this.toNumber(source['page']) ?? fallbackPage;
    const limit = this.toNumber(source['limit']) ?? this.toNumber(source['perPage']) ?? fallbackLimit;
    const total =
      this.toNumber(source['total']) ??
      this.toNumber(source['totalItems']) ??
      this.toNumber(source['itemCount']) ??
      this.orders.length;
    const totalPages =
      this.toNumber(source['totalPages']) ??
      this.toNumber(source['pageCount']) ??
      Math.max(1, Math.ceil(total / Math.max(limit, 1)));

    return { page, limit, total, totalPages: Math.max(1, totalPages) };
  }

  private emptyToUndefined(value: string | null | undefined): string | undefined {
    const normalized = String(value ?? '').trim();
    return normalized ? normalized : undefined;
  }

  private toNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const normalized = String(value ?? '').trim();
    if (!normalized) return undefined;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private toBoolean(value: BooleanFilter): boolean | undefined {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return undefined;
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
