import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { CategoryModalComponent } from '../../components/category-modal/category-modal.component';
import { ProductCategoryService } from '../../../core/api/generated/product-category/product-category.service';
import type {
  CreateProductCategoryDto,
  ProductCategoryResponseDto,
  UpdateProductCategoryDto,
} from '../../../core/api/generated/schemas';
import { ToastService } from '../../../core/notification/toast.service';

type CategoryStatusFilter = 'All' | 'Active' | 'Inactive';

@Component({
  selector: 'app-admin-category',
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterLink, CategoryModalComponent],
  templateUrl: './admin-category.component.html',
  styleUrl: './admin-category.component.css',
})
export class AdminCategoryComponent implements OnInit {
  readonly statusOptions: CategoryStatusFilter[] = [
    'All',
    'Active',
    'Inactive',
  ];
  readonly pageSizeOptions = [20, 50, 100];

  query = '';
  statusFilter: CategoryStatusFilter = 'All';
  appliedQuery = '';
  appliedStatusFilter: CategoryStatusFilter = 'All';

  loading = true;
  saving = false;
  deleting = false;

  page = 1;
  pageSize = 50;
  totalItems = 0;

  categoryModalOpen = false;
  confirmOpen = false;
  categoryMode: 'create' | 'edit' = 'create';
  selectedCategory: ProductCategoryResponseDto | null = null;

  categories: ProductCategoryResponseDto[] = [];
  filteredCategories: ProductCategoryResponseDto[] = [];

  constructor(
    private readonly productCategoryService: ProductCategoryService,
    private readonly toastService: ToastService,
  ) {}

  ngOnInit(): void {
    this.loadCategories();
  }

  get totalCount(): number {
    return this.totalItems;
  }

  get activeCount(): number {
    return this.filteredCategories.filter((item) => item.is_active).length;
  }

  get inactiveCount(): number {
    return this.filteredCategories.filter((item) => !item.is_active).length;
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.totalItems / this.pageSize));
  }

  get paginatedCategories(): ProductCategoryResponseDto[] {
    return this.filteredCategories;
  }

  applyFilters(): void {
    this.appliedQuery = this.query.trim();
    this.appliedStatusFilter = this.statusFilter;
    this.page = 1;
    this.loadCategories();
  }

  resetFilters(): void {
    this.query = '';
    this.statusFilter = 'All';
    this.appliedQuery = '';
    this.appliedStatusFilter = 'All';
    this.page = 1;
    this.loadCategories();
  }

  changePageSize(size: number): void {
    this.pageSize = Number(size) || 50;
    this.page = 1;
    this.loadCategories();
  }

  prevPage(): void {
    if (this.page > 1) {
      this.page -= 1;
      this.loadCategories();
    }
  }

  nextPage(): void {
    if (this.page < this.totalPages) {
      this.page += 1;
      this.loadCategories();
    }
  }

  openCreateCategory(): void {
    this.categoryMode = 'create';
    this.selectedCategory = null;
    this.categoryModalOpen = true;
  }

  openEditCategory(category: ProductCategoryResponseDto): void {
    this.categoryMode = 'edit';
    this.selectedCategory = category;
    this.categoryModalOpen = true;
  }

  closeCategoryModal(): void {
    if (this.saving) {
      return;
    }

    this.categoryModalOpen = false;
    this.selectedCategory = null;
  }

  openDeleteCategory(category: ProductCategoryResponseDto): void {
    this.selectedCategory = category;
    this.confirmOpen = true;
  }

  closeConfirm(): void {
    if (this.deleting) {
      return;
    }

    this.confirmOpen = false;
    this.selectedCategory = null;
  }

  saveCategory(payload: CreateProductCategoryDto): void {
    this.saving = true;

    const request =
      this.categoryMode === 'create'
        ? this.productCategoryService.productCategoryControllerCreate(payload)
        : this.productCategoryService.productCategoryControllerUpdate(
            String(this.selectedCategory?.category_id),
            this.toUpdatePayload(payload),
          );

    request.pipe(finalize(() => (this.saving = false))).subscribe({
      next: () => {
        this.toastService.success(
          this.categoryMode === 'create'
            ? 'Category created successfully.'
            : 'Category updated successfully.',
        );
        this.categoryModalOpen = false;
        this.selectedCategory = null;
        this.loadCategories();
      },
      error: (error) => {
        this.toastService.error(
          this.getErrorMessage(error, 'Failed to save category.'),
        );
      },
    });
  }

  confirmDelete(): void {
    if (!this.selectedCategory || this.deleting) {
      return;
    }

    this.deleting = true;
    this.productCategoryService
      .productCategoryControllerRemove(
        String(this.selectedCategory.category_id),
      )
      .pipe(finalize(() => (this.deleting = false)))
      .subscribe({
        next: () => {
          this.toastService.success('Category deleted successfully.');
          this.confirmOpen = false;
          this.selectedCategory = null;
          this.loadCategories();
        },
        error: (error) => {
          this.toastService.error(
            this.getErrorMessage(error, 'Failed to delete category.'),
          );
        },
      });
  }

  onCategoryModalWarning(message: string): void {
    this.toastService.warning(message);
  }

  onCategoryModalError(message: string): void {
    this.toastService.error(message);
  }

  trackByCategoryId(_: number, item: ProductCategoryResponseDto): number {
    return item.category_id;
  }

  private loadCategories(): void {
    const params: Record<string, string | number | boolean> = {
      page: this.page,
      limit: this.pageSize,
    };

    if (this.appliedQuery) {
      params['search'] = this.appliedQuery;
    }

    if (this.appliedStatusFilter !== 'All') {
      params['is_active'] = this.appliedStatusFilter === 'Active';
    }

    this.loading = true;
    this.productCategoryService
      .productCategoryControllerList({
        params,
      })
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (response) => {
          this.categories = response.data ?? [];
          this.filteredCategories = response.data ?? [];
          this.totalItems = Number(response.meta?.['total'] ?? response.data?.length ?? 0);
        },
        error: (error) => {
          this.toastService.error(
            this.getErrorMessage(error, 'Failed to load categories.'),
          );
        },
      });
  }

  private toUpdatePayload(
    payload: CreateProductCategoryDto,
  ): UpdateProductCategoryDto {
    return {
      category_name: payload.category_name,
      category_image: payload.category_image,
      is_active: payload.is_active,
      is_deleted: payload.is_deleted,
    };
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
