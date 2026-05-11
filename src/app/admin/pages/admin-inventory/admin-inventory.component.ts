import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { AdminInventoryService } from '../../../core/api/generated/admin-inventory/admin-inventory.service';
import type {
  InventoryControllerListParams,
  InventoryDetailDto,
  InventoryListItemDto,
  InventoryListResponseDtoMeta,
  InventorySummaryDto,
  UpdateInventoryDto,
} from '../../../core/api/generated/schemas';
import { ToastService } from '../../../core/notification/toast.service';

type InventoryTypeFilter = 'all' | 'Tire' | 'Rim' | 'Cover';
type InventoryStatusFilter = 'all' | 'active' | 'inactive';
type InventoryStockStatusFilter = 'all' | 'in_stock' | 'low_stock' | 'out_of_stock';
type LowStockFilter = 'all' | 'yes' | 'no';

interface InventoryMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

@Component({
  selector: 'app-admin-inventory',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './admin-inventory.component.html',
  styleUrl: './admin-inventory.component.css',
})
export class AdminInventoryComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly inventoryApi = inject(AdminInventoryService);
  private readonly toast = inject(ToastService);

  readonly pageSizeOptions = ['20', '50', '100'];
  readonly typeOptions: Array<{ value: InventoryTypeFilter; label: string }> = [
    { value: 'all', label: 'All Types' },
    { value: 'Tire', label: 'Tire' },
    { value: 'Rim', label: 'Rim' },
    { value: 'Cover', label: 'Cover' },
  ];
  readonly statusOptions: Array<{ value: InventoryStatusFilter; label: string }> = [
    { value: 'all', label: 'All Status' },
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
  ];
  readonly stockStatusOptions: Array<{ value: InventoryStockStatusFilter; label: string }> = [
    { value: 'all', label: 'All Stock States' },
    { value: 'in_stock', label: 'In Stock' },
    { value: 'low_stock', label: 'Low Stock' },
    { value: 'out_of_stock', label: 'Out of Stock' },
  ];
  readonly lowStockOptions: Array<{ value: LowStockFilter; label: string }> = [
    { value: 'all', label: 'All Stock Levels' },
    { value: 'yes', label: 'Low Stock Only' },
    { value: 'no', label: 'Normal Stock Only' },
  ];

  readonly filterForm = this.fb.nonNullable.group({
    q: [''],
    type: ['all' as InventoryTypeFilter],
    status: ['all' as InventoryStatusFilter],
    stockStatus: ['all' as InventoryStockStatusFilter],
    lowStockOnly: ['all' as LowStockFilter],
    dateFrom: [''],
    dateTo: [''],
    limit: ['50'],
  });

  readonly stockForm = this.fb.nonNullable.group({
    stockQty: [0, [Validators.required, Validators.min(0)]],
    lowStockThreshold: [0, [Validators.required, Validators.min(0)]],
    status: ['active', Validators.required],
    isActive: [true],
    inventorySource: [''],
    warehouseBin: [''],
    leadTimeDays: [0, [Validators.required, Validators.min(0)]],
  });

  items: InventoryListItemDto[] = [];
  summary: InventorySummaryDto = { products: 0, available: 0, sold: 0, low_stock: 0 };
  meta: InventoryMeta = { page: 1, limit: 50, total: 0, totalPages: 1 };
  appliedParams: InventoryControllerListParams = { page: 1, limit: 50 };

  selectedDetail: InventoryDetailDto | null = null;
  modalOpen = false;
  loading = false;
  loadError: string | null = null;
  detailLoading = false;
  saving = false;

  ngOnInit(): void {
    this.loadInventory();
  }

  get totalProducts(): number {
    return this.summary.products ?? 0;
  }

  get totalAvailable(): number {
    return this.summary.available ?? 0;
  }

  get totalSold(): number {
    return this.summary.sold ?? 0;
  }

  get lowStockCount(): number {
    return this.summary.low_stock ?? 0;
  }

  get hasResults(): boolean {
    return this.items.length > 0;
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
    this.loadInventory({
      ...this.buildListParams(),
      page: 1,
      limit: Number(this.filterForm.get('limit')!.value ?? '50'),
    });
  }

  resetFilters(): void {
    this.filterForm.reset({
      q: '',
      type: 'all',
      status: 'all',
      stockStatus: 'all',
      lowStockOnly: 'all',
      dateFrom: '',
      dateTo: '',
      limit: '50',
    });
    this.loadInventory({ page: 1, limit: 50 });
  }

  onPageSizeChange(): void {
    this.loadInventory({
      ...this.buildListParams(),
      page: 1,
      limit: Number(this.filterForm.get('limit')!.value ?? '50'),
    });
  }

  changePage(page: number): void {
    if (page < 1 || page > this.meta.totalPages || page === this.meta.page) return;
    this.loadInventory({ ...this.appliedParams, page });
  }

  refresh(): void {
    this.loadInventory();
  }

  lowStock(item: InventoryListItemDto | InventoryDetailDto): boolean {
    return Boolean(item.low_stock);
  }

  stockStatusPreview(): 'in_stock' | 'low_stock' | 'out_of_stock' {
    const qty = Number(this.stockForm.get('stockQty')?.value ?? 0);
    const threshold = Number(this.stockForm.get('lowStockThreshold')?.value ?? 0);
    if (!Number.isFinite(qty) || qty <= 0) return 'out_of_stock';
    if (Number.isFinite(threshold) && threshold > 0 && qty <= threshold) return 'low_stock';
    return 'in_stock';
  }

  typeBadge(typeName: unknown): string {
    switch (this.toText(typeName).toLowerCase()) {
      case 'tire':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'rim':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'cover':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  }

  trackByProductId(_: number, item: InventoryListItemDto): number {
    return item.product_id;
  }

  openUpdate(item: InventoryListItemDto): void {
    this.modalOpen = true;
    this.detailLoading = true;
    this.selectedDetail = null;

    this.inventoryApi
      .inventoryControllerGet(String(item.product_id))
      .pipe(finalize(() => (this.detailLoading = false)))
      .subscribe({
        next: (response) => {
          this.selectedDetail = response.data;
          this.stockForm.reset({
            stockQty: Number(response.data.available_qty ?? 0),
            lowStockThreshold: Number(response.data.low_stock_threshold ?? 0),
            status: this.toText(response.data.status) || 'active',
            isActive: Boolean(response.data.is_active),
            inventorySource: this.toText(response.data.inventory_source),
            warehouseBin: this.toText(response.data.warehouse_bin),
            leadTimeDays: Number(response.data.lead_time_days ?? 0),
          });
        },
        error: (error: unknown) => {
          this.toast.error(this.getApiErrorMessage(error, 'Failed to load inventory details.'));
          this.closeModal();
        },
      });
  }

  closeModal(): void {
    this.modalOpen = false;
    this.detailLoading = false;
    this.selectedDetail = null;
    this.stockForm.reset({
      stockQty: 0,
      lowStockThreshold: 0,
      status: 'active',
      isActive: true,
      inventorySource: '',
      warehouseBin: '',
      leadTimeDays: 0,
    });
  }

  saveStock(): void {
    if (!this.selectedDetail) return;

    if (this.stockForm.invalid) {
      this.stockForm.markAllAsTouched();
      return;
    }

    const value = this.stockForm.getRawValue();
    const payload: UpdateInventoryDto = {
      stock_qty: Number(value.stockQty),
      low_stock_threshold: Number(value.lowStockThreshold),
      status: this.emptyToUndefined(value.status),
      is_active: value.isActive,
      inventory_source: this.emptyToUndefined(value.inventorySource),
      warehouse_bin: this.emptyToUndefined(value.warehouseBin),
      lead_time_days: Number(value.leadTimeDays),
    };

    this.saving = true;
    this.inventoryApi
      .inventoryControllerUpdate(String(this.selectedDetail.product_id), payload)
      .pipe(finalize(() => (this.saving = false)))
      .subscribe({
        next: (response) => {
          this.toast.success(response.message || 'Inventory updated.');
          this.selectedDetail = response.data;
          this.loadInventory();
          this.closeModal();
        },
        error: (error: unknown) => {
          this.toast.error(this.getApiErrorMessage(error, 'Failed to update inventory.'));
        },
      });
  }

  private loadInventory(params: InventoryControllerListParams = this.appliedParams): void {
    this.appliedParams = params;
    this.loading = true;
    this.loadError = null;
    this.inventoryApi
      .inventoryControllerList(params)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (response) => {
          this.items = Array.isArray(response.data) ? response.data : [];
          this.summary = response.summary ?? { products: 0, available: 0, sold: 0, low_stock: 0 };
          this.meta = this.normalizeMeta(response.meta, params.page ?? 1, params.limit ?? 50);
        },
        error: (error: unknown) => {
          this.items = [];
          this.summary = { products: 0, available: 0, sold: 0, low_stock: 0 };
          this.meta = this.normalizeMeta(undefined, params.page ?? 1, params.limit ?? 50);
          this.loadError = this.getApiErrorMessage(error, 'Failed to load inventory.');
          this.toast.error(this.loadError);
        },
      });
  }

  private buildListParams(): InventoryControllerListParams {
    const value = this.filterForm.getRawValue();
    return {
      q: this.emptyToUndefined(value.q),
      type: value.type === 'all' ? undefined : value.type,
      status: value.status === 'all' ? undefined : value.status,
      stock_status: value.stockStatus === 'all' ? undefined : value.stockStatus,
      low_stock_only:
        value.lowStockOnly === 'all' ? undefined : value.lowStockOnly === 'yes',
      date_from: this.emptyToUndefined(value.dateFrom),
      date_to: this.emptyToUndefined(value.dateTo),
      page: this.appliedParams.page ?? 1,
      limit: Number(value.limit ?? '50'),
    };
  }

  private normalizeMeta(
    meta: InventoryListResponseDtoMeta | undefined,
    fallbackPage: number,
    fallbackLimit: number,
  ): InventoryMeta {
    const source = (meta ?? {}) as Record<string, unknown>;
    const page = this.toNumber(source['page']) ?? fallbackPage;
    const limit = this.toNumber(source['limit']) ?? this.toNumber(source['perPage']) ?? fallbackLimit;
    const total =
      this.toNumber(source['total']) ??
      this.toNumber(source['totalItems']) ??
      this.toNumber(source['itemCount']) ??
      this.items.length;
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
