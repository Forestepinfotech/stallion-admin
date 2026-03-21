import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { AdminReturnsService } from '../../../core/api/generated/admin-returns/admin-returns.service';
import type {
  AdminReturnsControllerListRequestsParams,
  ReturnRequestDetailDto,
  ReturnRequestListItemDto,
  ReturnRequestsListResponseDtoMeta,
  UpdateReturnStatusDto,
} from '../../../core/api/generated/schemas';
import { ToastService } from '../../../core/notification/toast.service';

type FilterStatus = 'all' | 'pending' | 'approved' | 'rejected' | 'refunded' | 'received' | 'requested';
type RefundFilterStatus = 'all' | 'none' | 'pending' | 'approved' | 'refunded' | 'failed';

interface ReturnMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

@Component({
  selector: 'app-admin-product-return',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './admin-product-return.component.html',
  styleUrl: './admin-product-return.component.css',
})
export class AdminProductReturnComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly returnsApi = inject(AdminReturnsService);
  private readonly toast = inject(ToastService);

  readonly statusOptions: Array<{ value: FilterStatus; label: string }> = [
    { value: 'all', label: 'All Status' },
    { value: 'requested', label: 'Requested' },
    { value: 'pending', label: 'Pending' },
    { value: 'received', label: 'Received' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'refunded', label: 'Refunded' },
  ];

  readonly refundStatusOptions: Array<{ value: RefundFilterStatus; label: string }> = [
    { value: 'all', label: 'All Refund States' },
    { value: 'none', label: 'No Refund' },
    { value: 'pending', label: 'Pending' },
    { value: 'approved', label: 'Approved' },
    { value: 'refunded', label: 'Refunded' },
    { value: 'failed', label: 'Failed' },
  ];

  readonly pageSizeOptions = ['10', '20', '50'];
  readonly updateStatusOptions = ['requested', 'pending', 'received', 'approved', 'rejected', 'refunded'];
  readonly updateRefundStatusOptions = ['none', 'pending', 'approved', 'refunded', 'failed'];

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

  readonly detailForm = this.fb.group({
    status: [''],
    refundStatus: [''],
    refundAmount: [null as number | null],
    refundEtaNote: [''],
    adminNote: [''],
  });

  requests: ReturnRequestListItemDto[] = [];
  selectedDetail: ReturnRequestDetailDto | null = null;
  meta: ReturnMeta = { page: 1, limit: 50, total: 0, totalPages: 1 };
  appliedParams: AdminReturnsControllerListRequestsParams = { page: 1, limit: 50 };

  loading = false;
  loadError: string | null = null;
  detailLoading = false;
  savingStatus = false;
  detailOpen = false;

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

  openDetails(item: ReturnRequestListItemDto): void {
    this.detailOpen = true;
    this.detailLoading = true;
    this.selectedDetail = null;

    this.returnsApi
      .adminReturnsControllerGetRequest(String(item.return_request_id))
      .pipe(finalize(() => (this.detailLoading = false)))
      .subscribe({
        next: (response) => {
          this.selectedDetail = response.data;
          this.detailForm.reset({
            status: this.toText(response.data.status),
            refundStatus: this.toText(response.data.refund_status),
            refundAmount: Number(response.data.refund_amount ?? 0),
            refundEtaNote: this.toText(response.data.refund_eta_note),
            adminNote: this.toText(response.data.admin_note),
          });
        },
        error: (error: unknown) => {
          this.toast.error(this.getApiErrorMessage(error, 'Failed to load return details.'));
          this.closeDetails();
        },
      });
  }

  closeDetails(): void {
    this.detailOpen = false;
    this.selectedDetail = null;
    this.detailForm.reset({
      status: '',
      refundStatus: '',
      refundAmount: null,
      refundEtaNote: '',
      adminNote: '',
    });
  }

  saveStatusUpdate(): void {
    if (!this.selectedDetail) return;

    const value = this.detailForm.getRawValue();
    const payload: UpdateReturnStatusDto = {
      status: this.emptyToUndefined(value.status),
      refund_status: this.emptyToUndefined(value.refundStatus),
      refund_amount: value.refundAmount ?? undefined,
      refund_eta_note: this.emptyToUndefined(value.refundEtaNote),
      admin_note: this.emptyToUndefined(value.adminNote),
    };

    this.savingStatus = true;
    this.returnsApi
      .adminReturnsControllerUpdateStatus(String(this.selectedDetail.return_request_id), payload)
      .pipe(finalize(() => (this.savingStatus = false)))
      .subscribe({
        next: (response) => {
          this.toast.success(response.message || 'Return request updated.');
          this.selectedDetail = response.data;
          this.requests = this.requests.map((item) =>
            item.return_request_id === response.data.return_request_id
              ? { ...item, status: response.data.status, refund_status: response.data.refund_status }
              : item,
          );
          this.detailForm.patchValue({
            status: this.toText(response.data.status),
            refundStatus: this.toText(response.data.refund_status),
            refundAmount: Number(response.data.refund_amount ?? 0),
            refundEtaNote: this.toText(response.data.refund_eta_note),
            adminNote: this.toText(response.data.admin_note),
          });
        },
        error: (error: unknown) => {
          this.toast.error(this.getApiErrorMessage(error, 'Failed to update return status.'));
        },
      });
  }

  badgeClass(status: string): string {
    switch (status.toLowerCase()) {
      case 'pending':
      case 'requested':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'approved':
      case 'received':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'rejected':
      case 'failed':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'refunded':
        return 'bg-sky-50 text-sky-700 border-sky-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  }

  formatStatus(value: string | null | undefined): string {
    const normalized = this.toText(value).trim();
    if (!normalized) return '-';
    return normalized.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
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
    return typeof value === 'string' ? value : '';
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
