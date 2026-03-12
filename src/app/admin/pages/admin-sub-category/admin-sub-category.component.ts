import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { ProductCategoryService } from '../../../core/api/generated/product-category/product-category.service';
import { ProductSubCategoryService } from '../../../core/api/generated/product-sub-category/product-sub-category.service';
import type {
  CreateProductSubCategoryDto,
  ProductCategoryResponseDto,
  ProductSubCategoryResponseDto,
  UpdateProductSubCategoryDto,
} from '../../../core/api/generated/schemas';
import { ToastService } from '../../../core/notification/toast.service';

type StatusFilter = 'all' | 'active' | 'inactive';
type SubCategoryListItem = ProductSubCategoryResponseDto & {
  created_at?: string;
};

@Component({
  selector: 'app-admin-sub-category',
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-sub-category.component.html',
  styleUrl: './admin-sub-category.component.css',
})
export class AdminSubCategoryComponent implements OnInit {
  readonly pageSizeOptions = [20, 50, 100];

  categories: ProductCategoryResponseDto[] = [];
  subCategories: SubCategoryListItem[] = [];

  selectedCategoryId: number | null = null;
  searchQuery = '';
  statusFilter: StatusFilter = 'all';
  dateFrom = '';
  dateTo = '';
  tableCategoryFilterId: 'all' | number = 'all';

  appliedSearchQuery = '';
  appliedStatusFilter: StatusFilter = 'all';
  appliedDateFrom = '';
  appliedDateTo = '';
  appliedTableCategoryFilterId: 'all' | number = 'all';

  page = 1;
  pageSize = 20;
  totalItems = 0;

  loading = true;
  saving = false;
  deletingId: number | null = null;
  togglingId: number | null = null;

  editingSubCategoryId: number | null = null;
  subCategoryName = '';
  subCategoryActive = true;
  subCategoryImage = '';

  constructor(
    private readonly productCategoryService: ProductCategoryService,
    private readonly productSubCategoryService: ProductSubCategoryService,
    private readonly toastService: ToastService,
  ) {}

  ngOnInit(): void {
    this.loadCategories();
    this.loadSubCategories();
  }

  get selectedCategoryName(): string {
    if (this.selectedCategoryId === null) {
      return 'Select category';
    }

    return (
      this.categories.find((item) => item.category_id === this.selectedCategoryId)?.category_name ??
      'Select category'
    );
  }

  get tableCategoryName(): string {
    if (this.appliedTableCategoryFilterId === 'all') {
      return 'All Categories';
    }

    return (
      this.categories.find((item) => item.category_id === this.appliedTableCategoryFilterId)?.category_name ??
      'Selected Category'
    );
  }

  get selectedCategoryTotal(): number {
    if (this.selectedCategoryId === null) {
      return 0;
    }

    if (
      this.appliedTableCategoryFilterId !== 'all' &&
      this.appliedTableCategoryFilterId === this.selectedCategoryId
    ) {
      return this.totalItems;
    }

    return this.subCategories.filter((item) => item.category_id === this.selectedCategoryId).length;
  }

  get activeCount(): number {
    return this.subCategories.filter((item) => item.is_active).length;
  }

  get inactiveCount(): number {
    return this.subCategories.filter((item) => !item.is_active).length;
  }

  get filteredSubCategories(): SubCategoryListItem[] {
    return this.subCategories;
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.totalItems / this.pageSize));
  }

  get paginatedSubCategories(): SubCategoryListItem[] {
    return this.filteredSubCategories;
  }

  get hasImagePreview(): boolean {
    return this.subCategoryImage.trim().length > 0;
  }

  get isEditing(): boolean {
    return this.editingSubCategoryId !== null;
  }

  onCategoryChange(): void {
    if (this.selectedCategoryId === null || this.appliedTableCategoryFilterId === 'all') {
      return;
    }

    this.tableCategoryFilterId = this.selectedCategoryId;
  }

  changePageSize(size: number): void {
    this.pageSize = Number(size) || 20;
    this.page = 1;
    this.loadSubCategories();
  }

  prevPage(): void {
    if (this.page > 1) {
      this.page -= 1;
      this.loadSubCategories();
    }
  }

  nextPage(): void {
    if (this.page < this.totalPages) {
      this.page += 1;
      this.loadSubCategories();
    }
  }

  async onSubCategoryImageSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !file.type.startsWith('image/') || file.size > 2 * 1024 * 1024) {
      this.toastService.warning('Please choose an image file smaller than 2 MB.');
      return;
    }

    this.subCategoryImage = await this.fileToBase64(file);
    input.value = '';
  }

  clearDraftImage(): void {
    this.subCategoryImage = '';
  }

  applyFilters(): void {
    this.appliedSearchQuery = this.searchQuery.trim();
    this.appliedStatusFilter = this.statusFilter;
    this.appliedDateFrom = this.dateFrom;
    this.appliedDateTo = this.dateTo;
    this.appliedTableCategoryFilterId = this.tableCategoryFilterId;
    this.page = 1;
    this.loadSubCategories();
  }

  resetFilters(): void {
    this.searchQuery = '';
    this.statusFilter = 'all';
    this.dateFrom = '';
    this.dateTo = '';
    this.tableCategoryFilterId = 'all';
    this.appliedSearchQuery = '';
    this.appliedStatusFilter = 'all';
    this.appliedDateFrom = '';
    this.appliedDateTo = '';
    this.appliedTableCategoryFilterId = 'all';
    this.page = 1;
    this.loadSubCategories();
  }

  saveSubCategory(): void {
    const name = this.subCategoryName.trim();
    if (!name || this.selectedCategoryId === null || this.saving) {
      return;
    }

    const duplicate = this.subCategories.some(
      (item) =>
        item.sub_category_id !== this.editingSubCategoryId &&
        item.category_id === this.selectedCategoryId &&
        item.sub_category.toLowerCase() === name.toLowerCase(),
    );
    if (duplicate) {
      this.toastService.warning('A sub category with this name already exists in the selected category.');
      return;
    }

    const createPayload: CreateProductSubCategoryDto = {
      category_id: this.selectedCategoryId,
      sub_category: name,
      sub_category_image: this.subCategoryImage || undefined,
      is_active: this.subCategoryActive,
      is_deleted: false,
    };

    const request =
      this.editingSubCategoryId === null
        ? this.productSubCategoryService.productSubCategoryControllerCreate(createPayload)
        : this.productSubCategoryService.productSubCategoryControllerUpdate(
            String(this.editingSubCategoryId),
            this.toUpdatePayload(createPayload),
          );

    this.saving = true;
    request.pipe(finalize(() => (this.saving = false))).subscribe({
      next: () => {
        this.toastService.success(
          this.isEditing ? 'Sub category updated successfully.' : 'Sub category created successfully.',
        );
        this.resetDraft();
        this.loadSubCategories();
      },
      error: (error) => {
        this.toastService.error(
          this.getErrorMessage(error, 'Failed to save sub category.'),
        );
      },
    });
  }

  startEdit(item: SubCategoryListItem): void {
    this.editingSubCategoryId = item.sub_category_id;
    this.selectedCategoryId = item.category_id;
    this.subCategoryName = item.sub_category;
    this.subCategoryActive = item.is_active;
    this.subCategoryImage = this.getImageSrc(item.sub_category_image);
  }

  cancelEdit(): void {
    this.resetDraft();
  }

  toggleStatus(id: number): void {
    const item = this.subCategories.find((entry) => entry.sub_category_id === id);
    if (!item || this.togglingId === id) {
      return;
    }

    this.togglingId = id;
    this.productSubCategoryService
      .productSubCategoryControllerUpdate(String(id), {
        is_active: !item.is_active,
      })
      .pipe(finalize(() => (this.togglingId = null)))
      .subscribe({
        next: () => {
          this.toastService.success('Sub category status updated successfully.');
          this.loadSubCategories();
        },
        error: (error) => {
          this.toastService.error(
            this.getErrorMessage(error, 'Failed to update sub category status.'),
          );
        },
      });
  }

  deleteSubCategory(id: number): void {
    if (this.deletingId === id) {
      return;
    }

    this.deletingId = id;
    this.productSubCategoryService
      .productSubCategoryControllerRemove(String(id))
      .pipe(finalize(() => (this.deletingId = null)))
      .subscribe({
        next: () => {
          this.toastService.success('Sub category deleted successfully.');
          if (this.editingSubCategoryId === id) {
            this.resetDraft();
          }
          if (this.page > 1 && this.subCategories.length === 1) {
            this.page -= 1;
          }
          this.loadSubCategories();
        },
        error: (error) => {
          this.toastService.error(
            this.getErrorMessage(error, 'Failed to delete sub category.'),
          );
        },
      });
  }

  getCategoryName(categoryId: number): string {
    return (
      this.categories.find((item) => item.category_id === categoryId)?.category_name ?? 'Unknown category'
    );
  }

  trackBySubCategoryId(_: number, item: SubCategoryListItem): number {
    return item.sub_category_id;
  }

  getTableImageSrc(item: SubCategoryListItem): string {
    return this.getImageSrc(item.sub_category_image);
  }

  private loadCategories(): void {
    this.productCategoryService
      .productCategoryControllerList({
        params: {
          page: 1,
          limit: 500,
          is_deleted: false,
        },
      })
      .subscribe({
        next: (response) => {
          this.categories = response.data ?? [];
          if (this.selectedCategoryId === null && this.categories.length > 0) {
            this.selectedCategoryId = this.categories[0].category_id;
          }
        },
        error: (error) => {
          this.toastService.error(
            this.getErrorMessage(error, 'Failed to load categories.'),
          );
        },
      });
  }

  private loadSubCategories(): void {
    const params: Record<string, string | number | boolean> = {
      page: this.page,
      limit: this.pageSize,
      is_deleted: false,
    };

    if (this.appliedSearchQuery) {
      params['search'] = this.appliedSearchQuery;
    }

    if (this.appliedStatusFilter !== 'all') {
      params['is_active'] = this.appliedStatusFilter === 'active';
    }

    if (this.appliedTableCategoryFilterId !== 'all') {
      params['category_id'] = this.appliedTableCategoryFilterId;
    }

    this.loading = true;
    this.productSubCategoryService
      .productSubCategoryControllerList({
        params,
      })
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (response) => {
          this.subCategories = (response.data ?? []) as SubCategoryListItem[];
          this.totalItems = Number(response.meta?.['total'] ?? response.data?.length ?? 0);
        },
        error: (error) => {
          this.subCategories = [];
          this.totalItems = 0;
          this.toastService.error(
            this.getErrorMessage(error, 'Failed to load sub categories.'),
          );
        },
      });
  }

  private resetDraft(): void {
    this.editingSubCategoryId = null;
    this.subCategoryName = '';
    this.subCategoryActive = true;
    this.subCategoryImage = '';
  }

  private toUpdatePayload(
    payload: CreateProductSubCategoryDto,
  ): UpdateProductSubCategoryDto {
    return {
      category_id: payload.category_id,
      sub_category: payload.sub_category,
      sub_category_image: payload.sub_category_image,
      is_active: payload.is_active,
      is_deleted: payload.is_deleted,
    };
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  private getImageSrc(image: ProductSubCategoryResponseDto['sub_category_image']): string {
    return typeof image === 'string' ? image : '';
  }

  private getErrorMessage(error: unknown, fallback: string): string {
    if (
      typeof error === 'object' &&
      error !== null &&
      'error' in error &&
      typeof error.error === 'object' &&
      error.error !== null &&
      'message' in error.error
    ) {
      const message = error.error.message;
      if (typeof message === 'string') {
        return message;
      }
      if (Array.isArray(message) && message.length > 0) {
        return String(message[0]);
      }
    }

    if (
      typeof error === 'object' &&
      error !== null &&
      'message' in error &&
      typeof error.message === 'string'
    ) {
      return error.message;
    }

    return fallback;
  }
}
