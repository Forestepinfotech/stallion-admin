import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { AdminReturnsService } from '../../../core/api/generated/admin-returns/admin-returns.service';
import type {
  AdminReturnsControllerListRequestsParams,
  ReturnRequestListItemDto,
  ReturnRequestsListResponseDtoMeta,
} from '../../../core/api/generated/schemas';
import { ToastService } from '../../../core/notification/toast.service';
import { ReturnApprovalDrawerComponent } from '../../orders/components/return-approval-drawer/return-approval-drawer.component';
import { StatusBadgeComponent, type StatusBadgeVariant } from '../../components/status-badge/status-badge.component';

type FilterStatus = 'all' | 'pending' | 'in_review' | 'approved' | 'rejected' | 'cancelled';
type RefundFilterStatus = 'all' | 'pending' | 'processing' | 'refunded' | 'failed';

interface ReturnMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

@Component({
  selector: 'app-admin-product-return',
  imports: [CommonModule, ReactiveFormsModule, ReturnApprovalDrawerComponent, StatusBadgeComponent],
  templateUrl: './admin-product-return.component.html',
  styleUrl: './admin-product-return.component.css',
})
export class AdminProductReturnComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly returnsApi = inject(AdminReturnsService);
  private readonly toast = inject(ToastService);

  readonly statusOptions: Array<{ value: FilterStatus; label: string }> = [
    { value: 'all', label: 'All Status' },
    { value: 'pending', label: 'Pending' },
    { value: 'in_review', label: 'In Review' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'cancelled', label: 'Cancelled' },
  ];

  readonly refundStatusOptions: Array<{ value: RefundFilterStatus; label: string }> = [
    { value: 'all', label: 'All Refund States' },
    { value: 'pending', label: 'Pending' },
    { value: 'refunded', label: 'Refunded' },
    { value: 'processing', label: 'Processing' },
    { value: 'failed', label: 'Failed' },
  ];

  readonly pageSizeOptions = ['10', '20', '50'];

  readonly filterForm = this.fb.nonNullable.group({
    q: [''],
    status: ['all' as FilterStatus],
    refundStatus: ['all' as RefundFilterStatus],
    dateFrom: [''],
    dateTo: [''],
    orderNumber: [''],
    returnNumber: [''],
    limit: ['50'],
  });

  requests: ReturnRequestListItemDto[] = [];
  meta: ReturnMeta = { page: 1, limit: 50, total: 0, totalPages: 1 };
  appliedParams: AdminReturnsControllerListRequestsParams = { page: 1, limit: 50 };

  loading = false;
  loadError: string | null = null;

  returnDrawerOpen = false;
  returnDrawerRequestId: string | null = null;

  ngOnInit(): void {
    this.loadRequests();
  }

  get hasResults(): boolean {
    return this.requests.length > 0;
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
    this.appliedParams = {
      ...this.buildListParams(),
      page: 1,
      limit: Number(this.filterForm.get('limit')!.value ?? '50'),
    };
    this.loadRequests();
  }

  resetFilters(): void {
    this.filterForm.reset({
      q: '',
      status: 'all',
      refundStatus: 'all',
      dateFrom: '',
      dateTo: '',
      orderNumber: '',
      returnNumber: '',
      limit: '50',
    });
    this.appliedParams = { page: 1, limit: 50 };
    this.loadRequests();
  }

  changePage(page: number): void {
    if (page < 1 || page > this.meta.totalPages || page === this.meta.page) return;
    this.appliedParams = { ...this.appliedParams, page };
    this.loadRequests();
  }

  onPageSizeChange(): void {
    this.appliedParams = {
      ...this.appliedParams,
      ...this.buildListParams(),
      page: 1,
      limit: Number(this.filterForm.get('limit')!.value ?? '50'),
    };
    this.loadRequests();
  }

  refresh(): void {
    this.loadRequests();
  }

  openReturn(item: ReturnRequestListItemDto): void {
    this.returnDrawerRequestId = String(item.return_request_id);
    this.returnDrawerOpen = true;
  }

  closeReturn(): void {
    this.returnDrawerOpen = false;
    this.returnDrawerRequestId = null;
  }

  refreshAfterReturnChange(): void {
    this.loadRequests();
  }

  returnStatusBadge(status: unknown): { label: string; variant: StatusBadgeVariant } {
    const s = this.toText(status)?.toLowerCase() ?? '';
    switch (s) {
      case 'approved':
        return { label: 'Approved', variant: 'success' };
      case 'rejected':
        return { label: 'Rejected', variant: 'danger' };
      case 'cancelled':
        return { label: 'Cancelled', variant: 'neutral' };
      case 'in_review':
        return { label: 'In Review', variant: 'info' };
      case 'pending':
      default:
        return { label: s ? s.replace(/_/g, ' ') : 'Pending', variant: 'warning' };
    }
  }

  refundStatusBadge(status: unknown): { label: string; variant: StatusBadgeVariant } {
    const s = this.toText(status)?.toLowerCase() ?? '';
    switch (s) {
      case 'refunded':
        return { label: 'Refunded', variant: 'success' };
      case 'failed':
        return { label: 'Failed', variant: 'danger' };
      case 'processing':
        return { label: 'Processing', variant: 'info' };
      case 'pending':
      default:
        return { label: s ? s.replace(/_/g, ' ') : 'Pending', variant: 'warning' };
    }
  }

  trackByReturnId(_: number, item: ReturnRequestListItemDto): number {
    return item.return_request_id;
  }

  private loadRequests(): void {
    this.loading = true;
    this.loadError = null;
    this.returnsApi
      .adminReturnsControllerListRequests(this.appliedParams)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (response) => {
          this.requests = Array.isArray(response.data) ? response.data : [];
          this.meta = this.normalizeMeta(response.meta, this.appliedParams.page ?? 1, this.appliedParams.limit ?? 10);
        },
        error: (error: unknown) => {
          this.requests = [];
          this.meta = this.normalizeMeta(undefined, this.appliedParams.page ?? 1, this.appliedParams.limit ?? 10);
          this.loadError = this.getApiErrorMessage(error, 'Failed to load return requests.');
          this.toast.error(this.loadError);
        },
      });
  }

  private buildListParams(): AdminReturnsControllerListRequestsParams {
    const value = this.filterForm.getRawValue();
    return {
      q: this.emptyToUndefined(value.q),
      status: value.status === 'all' ? undefined : value.status,
      refund_status: value.refundStatus === 'all' ? undefined : value.refundStatus,
      date_from: this.emptyToUndefined(value.dateFrom),
      date_to: this.emptyToUndefined(value.dateTo),
      order_number: this.emptyToUndefined(value.orderNumber),
      return_number: this.emptyToUndefined(value.returnNumber),
      limit: Number(value.limit ?? '50'),
      page: this.appliedParams.page ?? 1,
    };
  }

  private normalizeMeta(
    meta: ReturnRequestsListResponseDtoMeta | undefined,
    fallbackPage: number,
    fallbackLimit: number,
  ): ReturnMeta {
    const source = (meta ?? {}) as Record<string, unknown>;
    const page = this.toNumber(source['page']) ?? fallbackPage;
    const limit = this.toNumber(source['limit']) ?? this.toNumber(source['perPage']) ?? fallbackLimit;
    const total =
      this.toNumber(source['total']) ??
      this.toNumber(source['totalItems']) ??
      this.toNumber(source['itemCount']) ??
      this.requests.length;
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

  private toText(value: unknown): string {
    if (typeof value === 'string') return value;
    if (value === null || value === undefined) return '';
    return String(value);
  }

  private toNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
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
