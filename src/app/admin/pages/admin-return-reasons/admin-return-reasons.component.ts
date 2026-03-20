import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { AdminReturnsService } from '../../../core/api/generated/admin-returns/admin-returns.service';
import type {
  AdminReturnsControllerListReasonsParams,
  CreateReturnReasonDto,
  ReturnReasonDto,
  ReturnReasonsListResponseDtoMeta,
  UpdateReturnReasonDto,
} from '../../../core/api/generated/schemas';
import { ToastService } from '../../../core/notification/toast.service';

type ReasonFilterStatus = 'all' | 'active' | 'inactive';

interface ReasonMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

@Component({
  selector: 'app-admin-return-reasons',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './admin-return-reasons.component.html',
  styleUrl: './admin-return-reasons.component.css',
})
export class AdminReturnReasonsComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly returnsApi = inject(AdminReturnsService);
  private readonly toast = inject(ToastService);

  readonly filterStatusOptions: Array<{ value: ReasonFilterStatus; label: string }> = [
    { value: 'all', label: 'All Reasons' },
    { value: 'active', label: 'Active Only' },
    { value: 'inactive', label: 'Inactive Only' },
  ];
  readonly pageSizeOptions = ['10', '20', '50'];

  readonly filterForm = this.fb.nonNullable.group({
    q: [''],
    status: ['all' as ReasonFilterStatus],
    limit: ['50'],
  });

  readonly reasonForm = this.fb.nonNullable.group({
    reasonName: ['', [Validators.required, Validators.minLength(2)]],
    description: [''],
    isActive: [true],
    sortOrder: [1, [Validators.required, Validators.min(0)]],
  });

  reasons: ReturnReasonDto[] = [];
  selectedReason: ReturnReasonDto | null = null;
  meta: ReasonMeta = { page: 1, limit: 50, total: 0, totalPages: 1 };
  appliedParams: AdminReturnsControllerListReasonsParams = { page: 1, limit: 50 };
  loading = false;
  saving = false;

  ngOnInit(): void {
    this.loadReasons();
  }

  get isEditMode(): boolean {
    return this.selectedReason !== null;
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
    this.loadReasons();
  }

  resetFilters(): void {
    this.filterForm.reset({ q: '', status: 'all', limit: '50' });
    this.appliedParams = { page: 1, limit: 50 };
    this.loadReasons();
  }

  onPageSizeChange(): void {
    this.appliedParams = {
      ...this.buildListParams(),
      page: 1,
      limit: Number(this.filterForm.get('limit')!.value ?? '50'),
    };
    this.loadReasons();
  }

  changePage(page: number): void {
    if (page < 1 || page > this.meta.totalPages || page === this.meta.page) return;
    this.appliedParams = { ...this.appliedParams, page };
    this.loadReasons();
  }

  startCreate(): void {
    this.selectedReason = null;
    this.reasonForm.reset({
      reasonName: '',
      description: '',
      isActive: true,
      sortOrder: this.getNextSortOrder(),
    });
    this.reasonForm.markAsPristine();
    this.reasonForm.markAsUntouched();
  }

  selectReason(reason: ReturnReasonDto): void {
    this.selectedReason = reason;
    this.reasonForm.reset({
      reasonName: reason.reason_name,
      description: this.toText(reason.description),
      isActive: reason.is_active,
      sortOrder: reason.sort_order,
    });
    this.reasonForm.markAsPristine();
    this.reasonForm.markAsUntouched();
  }

  saveReason(): void {
    if (this.reasonForm.invalid) {
      this.reasonForm.markAllAsTouched();
      return;
    }

    const value = this.reasonForm.getRawValue();
    const basePayload = {
      reason_name: value.reasonName.trim(),
      description: value.description.trim() || undefined,
      is_active: value.isActive,
      sort_order: Number(value.sortOrder),
    };

    this.saving = true;
    const request = this.selectedReason
      ? this.returnsApi.adminReturnsControllerUpdateReason(String(this.selectedReason.reason_id), basePayload satisfies UpdateReturnReasonDto)
      : this.returnsApi.adminReturnsControllerCreateReason(basePayload satisfies CreateReturnReasonDto);

    request.pipe(finalize(() => (this.saving = false))).subscribe({
      next: (response) => {
        this.toast.success(this.selectedReason ? 'Return reason updated.' : 'Return reason created.');
        const saved = response.data;
        this.selectedReason = saved;
        this.reasonForm.reset({
          reasonName: saved.reason_name,
          description: this.toText(saved.description),
          isActive: saved.is_active,
          sortOrder: saved.sort_order,
        });
        this.reasonForm.markAsPristine();
        this.reasonForm.markAsUntouched();
        this.loadReasons();
      },
      error: (error: unknown) => {
        this.toast.error(this.getApiErrorMessage(error, 'Failed to save return reason.'));
      },
    });
  }

  refresh(): void {
    this.loadReasons();
  }

  trackByReasonId(_: number, item: ReturnReasonDto): number {
    return item.reason_id;
  }

  badgeClass(isActive: boolean): string {
    return isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-700 border-gray-200';
  }

  isInvalid(name: string): boolean {
    const control = this.reasonForm.get(name);
    return Boolean(control && control.invalid && (control.touched || control.dirty));
  }

  private loadReasons(): void {
    this.loading = true;
    this.returnsApi
      .adminReturnsControllerListReasons(this.appliedParams)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (response) => {
          this.reasons = Array.isArray(response.data) ? response.data : [];
          this.meta = this.normalizeMeta(response.meta, this.appliedParams.page ?? 1, this.appliedParams.limit ?? 10, this.reasons.length);
          if (this.selectedReason) {
            const fresh = this.reasons.find((item) => item.reason_id === this.selectedReason?.reason_id);
            if (fresh) this.selectedReason = fresh;
          }
        },
        error: (error: unknown) => {
          this.reasons = [];
          this.meta = this.normalizeMeta(undefined, this.appliedParams.page ?? 1, this.appliedParams.limit ?? 10, 0);
          this.toast.error(this.getApiErrorMessage(error, 'Failed to load return reasons.'));
        },
      });
  }

  private buildListParams(): AdminReturnsControllerListReasonsParams {
    const value = this.filterForm.getRawValue();
    return {
      q: this.emptyToUndefined(value.q),
      is_active: value.status === 'all' ? undefined : value.status === 'active',
      page: this.appliedParams.page ?? 1,
      limit: Number(value.limit ?? '50'),
    };
  }

  private normalizeMeta(
    meta: ReturnReasonsListResponseDtoMeta | undefined,
    fallbackPage: number,
    fallbackLimit: number,
    currentCount: number,
  ): ReasonMeta {
    const source = (meta ?? {}) as Record<string, unknown>;
    const page = this.toNumber(source['page']) ?? fallbackPage;
    const limit = this.toNumber(source['limit']) ?? this.toNumber(source['perPage']) ?? fallbackLimit;
    const total = this.toNumber(source['total']) ?? this.toNumber(source['totalItems']) ?? this.toNumber(source['itemCount']) ?? currentCount;
    const totalPages = this.toNumber(source['totalPages']) ?? this.toNumber(source['pageCount']) ?? Math.max(1, Math.ceil(total / Math.max(limit, 1)));
    return { page, limit, total, totalPages: Math.max(1, totalPages) };
  }

  private getNextSortOrder(): number {
    return this.reasons.length > 0 ? Math.max(...this.reasons.map((item) => item.sort_order)) + 1 : 1;
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
