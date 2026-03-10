import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import {
  FormBuilder,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { finalize } from 'rxjs';
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
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
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

  categoryModalOpen = false;
  confirmOpen = false;
  categoryMode: 'create' | 'edit' = 'create';
  selectedCategory: ProductCategoryResponseDto | null = null;

  categories: ProductCategoryResponseDto[] = [];
  filteredCategories: ProductCategoryResponseDto[] = [];

  readonly categoryForm;

  constructor(
    private readonly fb: FormBuilder,
    private readonly productCategoryService: ProductCategoryService,
    private readonly toastService: ToastService,
  ) {
    this.categoryForm = this.fb.group({
      category_name: ['', [Validators.required, Validators.minLength(2)]],
      is_active: [true, [Validators.required]],
      category_image: [''],
    });
  }

  ngOnInit(): void {
    this.loadCategories();
  }

  get totalCount(): number {
    return this.filteredCategories.length;
  }

  get activeCount(): number {
    return this.filteredCategories.filter((item) => item.is_active).length;
  }

  get inactiveCount(): number {
    return this.filteredCategories.filter((item) => !item.is_active).length;
  }

  get totalPages(): number {
    return Math.max(
      1,
      Math.ceil(this.filteredCategories.length / this.pageSize),
    );
  }

  get paginatedCategories(): ProductCategoryResponseDto[] {
    const start = (this.page - 1) * this.pageSize;
    return this.filteredCategories.slice(start, start + this.pageSize);
  }

  applyFilters(): void {
    this.appliedQuery = this.query.trim().toLowerCase();
    this.appliedStatusFilter = this.statusFilter;

    this.filteredCategories = this.categories.filter((item) => {
      const matchesQuery =
        !this.appliedQuery ||
        item.category_name.toLowerCase().includes(this.appliedQuery);

      const matchesStatus =
        this.appliedStatusFilter === 'All'
          ? true
          : item.is_active === (this.appliedStatusFilter === 'Active');

      return matchesQuery && matchesStatus;
    });

    this.page = 1;
  }

  resetFilters(): void {
    this.query = '';
    this.statusFilter = 'All';
    this.applyFilters();
  }

  changePageSize(size: number): void {
    this.pageSize = Number(size) || 50;
    this.page = 1;
  }

  prevPage(): void {
    if (this.page > 1) {
      this.page -= 1;
    }
  }

  nextPage(): void {
    if (this.page < this.totalPages) {
      this.page += 1;
    }
  }

  openCreateCategory(): void {
    this.categoryMode = 'create';
    this.selectedCategory = null;
    this.categoryForm.reset({
      category_name: '',
      is_active: true,
      category_image: '',
    });
    this.categoryModalOpen = true;
  }

  openEditCategory(category: ProductCategoryResponseDto): void {
    this.categoryMode = 'edit';
    this.selectedCategory = category;
    this.categoryForm.reset({
      category_name: category.category_name,
      is_active: category.is_active,
      category_image: category.category_image ?? '',
    });
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

  saveCategory(): void {
    if (this.categoryForm.invalid || this.saving) {
      this.categoryForm.markAllAsTouched();
      return;
    }

    const value = this.categoryForm.getRawValue();
    const payload: CreateProductCategoryDto = {
      category_name: String(value.category_name).trim(),
      category_image: String(value.category_image ?? '').trim(),
      is_active: Boolean(value.is_active),
      is_deleted: false,
    };

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

  async onCategoryImageSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.toastService.warning('Please select an image file.');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      this.toastService.warning('Image must be 2MB or smaller.');
      return;
    }

    try {
      const base64 = await this.fileToBase64(file);
      this.categoryForm.patchValue({ category_image: base64 });
    } catch {
      this.toastService.error('Failed to read the selected image.');
    }
  }

  removeCategoryImage(): void {
    this.categoryForm.patchValue({ category_image: '' });
  }

  invalid(controlName: keyof typeof this.categoryForm.controls): boolean {
    const control = this.categoryForm.get(controlName);
    return !!control && control.invalid && (control.touched || control.dirty);
  }

  trackByCategoryId(_: number, item: ProductCategoryResponseDto): number {
    return item.category_id;
  }

  private loadCategories(): void {
    this.loading = true;
    this.productCategoryService
      .productCategoryControllerList()
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (response) => {
          this.categories = response.data ?? [];
          this.applyFilters();
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

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
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
