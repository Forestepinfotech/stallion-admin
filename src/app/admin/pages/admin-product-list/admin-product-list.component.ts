import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { ProductCategoryService } from '../../../core/api/generated/product-category/product-category.service';
import { ProductSubCategoryService } from '../../../core/api/generated/product-sub-category/product-sub-category.service';
import { ProductsService } from '../../../core/api/generated/products/products.service';
import type {
  CreateProductsDto,
  ProductCategoryResponseDto,
  ProductDetailDto,
  ProductSubCategoryResponseDto,
  ProductSummaryDto,
  UpdateProductsDto,
} from '../../../core/api/generated/schemas';
import { ToastService } from '../../../core/notification/toast.service';

type ProductForm = {
  product_id?: string;
  category_id: string;
  sub_category_id: string;
  sku: string;
  title: string;
  short_description: string;
  description: string;
  thumbnail_image: string;
  compare_at_price: string;
  price: string;
  cost_price: string;
  stock_qty: string;
  low_stock_threshold: string;
  brand_id: string;
  barcode: string;
  status: string;
  visibility: string;
  shipping_class: string;
  supplier: string;
  is_active: boolean;
  is_deleted: boolean;
  featured: boolean;
  returnable: boolean;
};

type ProductRow = {
  product_id: number;
  title: string;
  sku: string;
  description: string;
  barcode: string;
  price: number | null;
  compare_at_price: number | null;
  cost_price: number | null;
  currency: string;
  stock_qty: number | null;
  low_stock_threshold: number | null;
  is_active: boolean;
  is_deleted: boolean;
  featured: boolean;
  returnable: boolean;
  thumbnail_image: string;
  category_name: string;
  sub_category_name: string;
  status: string;
  visibility: string;
};

function toStr(value: number | string | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

function toStringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function toNumberString(value: unknown): string {
  return typeof value === 'number' || typeof value === 'string' ? String(value) : '';
}

function toNumericValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toNumOrUndefined(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

@Component({
  selector: 'app-admin-product-list',
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-product-list.component.html',
  styleUrl: './admin-product-list.component.css',
})
export class AdminProductListComponent implements OnInit {
  private readonly productsService = inject(ProductsService);
  private readonly productCategoryService = inject(ProductCategoryService);
  private readonly productSubCategoryService = inject(ProductSubCategoryService);
  private readonly toastService = inject(ToastService);
  private readonly router = inject(Router);

  q = signal('');
  showDeleted = signal(false);
  statusFilter = signal<'all' | 'active' | 'inactive'>('all');
  stockFilter = signal<'all' | 'in_stock' | 'low_stock' | 'out_of_stock'>('all');
  selectedCategoryId = signal<string>('all');
  selectedSubCategoryId = signal<string>('all');
  dateFrom = signal('');
  dateTo = signal('');
  modalOpen = signal(false);
  modalMode = signal<'create' | 'edit'>('create');
  page = signal(1);
  pageSize = signal(20);
  totalItems = signal(0);

  loading = false;
  saving = false;
  deletingId: number | null = null;
  loadingCategories = false;
  loadingSubCategories = false;

  products = signal<ProductRow[]>([]);
  categories = signal<ProductCategoryResponseDto[]>([]);
  subCategories = signal<ProductSubCategoryResponseDto[]>([]);

  form = signal<ProductForm>(this.emptyForm());

  ngOnInit(): void {
    this.loadCategories();
    this.loadProducts();
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.totalItems() / this.pageSize()));
  }

  get startItem(): number {
    return this.totalItems() === 0 ? 0 : (this.page() - 1) * this.pageSize() + 1;
  }

  get endItem(): number {
    return Math.min(this.page() * this.pageSize(), this.totalItems());
  }

  onSearchChange(value: string): void {
    this.q.set(value);
    this.page.set(1);
    this.loadProducts();
  }

  onStatusChange(value: 'all' | 'active' | 'inactive'): void {
    this.statusFilter.set(value);
    this.page.set(1);
    this.loadProducts();
  }

  onStockFilterChange(value: 'all' | 'in_stock' | 'low_stock' | 'out_of_stock'): void {
    this.stockFilter.set(value);
    this.page.set(1);
    this.loadProducts();
  }

  onShowDeletedChange(checked: boolean): void {
    this.showDeleted.set(checked);
    this.page.set(1);
    this.loadProducts();
  }

  onCategoryFilterChange(value: string): void {
    this.selectedCategoryId.set(value);
    this.selectedSubCategoryId.set('all');
    this.page.set(1);
    this.loadSubCategoriesForFilter();
    this.loadProducts();
  }

  onSubCategoryFilterChange(value: string): void {
    this.selectedSubCategoryId.set(value);
    this.page.set(1);
    this.loadProducts();
  }

  onPageSizeChange(value: number): void {
    this.pageSize.set(Number(value) || 10);
    this.page.set(1);
    this.loadProducts();
  }

  onDateFromChange(value: string): void {
    this.dateFrom.set(value);
    this.page.set(1);
    this.loadProducts();
  }

  onDateToChange(value: string): void {
    this.dateTo.set(value);
    this.page.set(1);
    this.loadProducts();
  }

  setPage(page: number): void {
    const next = Math.min(Math.max(1, page), this.totalPages);
    if (next === this.page()) return;
    this.page.set(next);
    this.loadProducts();
  }

  nextPage(): void {
    this.setPage(this.page() + 1);
  }

  prevPage(): void {
    this.setPage(this.page() - 1);
  }

  openCreate(): void {
    this.router.navigate(['/admin/products']);
  }

  openEdit(product: ProductRow): void {
    this.router.navigate(['/admin/products'], {
      queryParams: { edit: product.product_id },
    });
  }

  viewProduct(productId: number): void {
    this.router.navigate(['/admin/products-list', productId]);
  }

  closeModal(): void {
    if (this.saving) return;
    this.modalOpen.set(false);
  }

  save(): void {
    const form = this.form();
    if (!form.sku.trim() || !form.title.trim()) {
      this.toastService.warning('SKU and product title are required.');
      return;
    }

    if (!form.category_id || !form.sub_category_id) {
      this.toastService.warning('Category and sub category are required.');
      return;
    }

    this.saving = true;

    const request =
      this.modalMode() === 'create'
        ? this.productsService.productsControllerCreate(this.toCreatePayload(form))
        : this.productsService.productsControllerUpdate(
            String(form.product_id),
            this.toUpdatePayload(form),
          );

    request.pipe(finalize(() => (this.saving = false))).subscribe({
      next: (response) => {
        this.toastService.success(response.message || 'Product saved successfully.');
        this.closeModal();
        this.loadProducts();
      },
      error: (error) => {
        this.toastService.error(this.getErrorMessage(error, 'Failed to save product.'));
      },
    });
  }

  delete(product: ProductRow): void {
    const confirmed = confirm(`Delete "${product.title}"?`);
    if (!confirmed) return;

    this.deletingId = product.product_id;
    this.productsService
      .productsControllerRemove(String(product.product_id))
      .pipe(finalize(() => (this.deletingId = null)))
      .subscribe({
        next: (response) => {
          this.toastService.success(response.message || 'Product deleted successfully.');
          this.loadProducts();
        },
        error: (error) => {
          this.toastService.error(this.getErrorMessage(error, 'Failed to delete product.'));
        },
      });
  }

  restore(product: ProductRow): void {
    this.deletingId = product.product_id;
    this.productsService
      .productsControllerUpdate(String(product.product_id), {
        is_deleted: false,
        is_active: true,
      })
      .pipe(finalize(() => (this.deletingId = null)))
      .subscribe({
        next: (response) => {
          this.toastService.success(response.message || 'Product restored successfully.');
          this.loadProducts();
        },
        error: (error) => {
          this.toastService.error(this.getErrorMessage(error, 'Failed to restore product.'));
        },
      });
  }

  patchForm<K extends keyof ProductForm>(key: K, value: ProductForm[K]): void {
    this.form.update((current) => ({ ...current, [key]: value }));
  }

  onModalCategoryChange(value: string): void {
    this.patchForm('category_id', value);
    this.patchForm('sub_category_id', '');
    this.loadModalSubCategories(value);
  }

  private loadProducts(): void {
    this.loading = true;
    this.productsService
      .productsControllerList(this.buildListParams(), {
        params: {
          page: this.page(),
          limit: this.pageSize(),
        },
      })
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (response) => {
          this.products.set((response.data ?? []).map((item) => this.mapSummaryToRow(item)));
          this.totalItems.set(this.extractTotal(response.meta, response.data?.length ?? 0));
        },
        error: (error) => {
          this.products.set([]);
          this.totalItems.set(0);
          this.toastService.error(this.getErrorMessage(error, 'Failed to load products.'));
        },
      });
  }

  private loadCategories(): void {
    this.loadingCategories = true;
    this.productCategoryService
      .productCategoryControllerList({
        params: { page: 1, limit: 500, is_deleted: false },
      })
      .pipe(finalize(() => (this.loadingCategories = false)))
      .subscribe({
        next: (response) => {
          this.categories.set(response.data ?? []);
        },
        error: () => {
          this.categories.set([]);
        },
      });
  }

  private loadSubCategoriesForFilter(): void {
    const categoryId = this.selectedCategoryId();
    if (categoryId === 'all') {
      this.subCategories.set([]);
      return;
    }

    this.loadingSubCategories = true;
    this.productSubCategoryService
      .productSubCategoryControllerList({
        params: { page: 1, limit: 500, category_id: Number(categoryId), is_deleted: false },
      })
      .pipe(finalize(() => (this.loadingSubCategories = false)))
      .subscribe({
        next: (response) => {
          this.subCategories.set(response.data ?? []);
        },
        error: () => {
          this.subCategories.set([]);
        },
      });
  }

  private loadModalSubCategories(categoryId: string): void {
    if (!categoryId) {
      return;
    }

    this.loadingSubCategories = true;
    this.productSubCategoryService
      .productSubCategoryControllerList({
        params: { page: 1, limit: 500, category_id: Number(categoryId), is_deleted: false },
      })
      .pipe(finalize(() => (this.loadingSubCategories = false)))
      .subscribe({
        next: (response) => {
          this.subCategories.set(response.data ?? []);
        },
        error: () => {
          this.subCategories.set([]);
        },
      });
  }

  private buildListParams(): Record<string, string | number | boolean> {
    const params: Record<string, string | number | boolean> = {
      search: this.q().trim(),
    };

    if (this.statusFilter() !== 'all') {
      params['is_active'] = this.statusFilter() === 'active';
    }

    if (this.selectedCategoryId() !== 'all') {
      params['category_id'] = Number(this.selectedCategoryId());
    }

    if (this.selectedSubCategoryId() !== 'all') {
      params['sub_category_id'] = Number(this.selectedSubCategoryId());
    }

    if (this.dateFrom()) {
      params['dateFrom'] = this.dateFrom();
    }

    if (this.dateTo()) {
      params['dateTo'] = this.dateTo();
    }

    return params;
  }

  private mapSummaryToRow(item: ProductSummaryDto): ProductRow {
    return {
      product_id: item.product_id,
      title: item.title,
      sku: item.sku,
      description: '',
      barcode: typeof item.barcode === 'string' ? item.barcode : '',
      price: toNumericValue(item.price),
      compare_at_price: toNumericValue(item.compare_at_price),
      cost_price: toNumericValue(item.cost_price),
      currency: typeof item.currency === 'string' ? item.currency : 'CAD',
      stock_qty: toNumericValue(item.stock_qty),
      low_stock_threshold: null,
      is_active: Boolean(item.is_active),
      is_deleted: false,
      featured: Boolean(item.featured),
      returnable: false,
      thumbnail_image: typeof item.thumbnail_image === 'string' ? item.thumbnail_image : '',
      category_name: typeof item.category_name === 'string' ? item.category_name : '',
      sub_category_name: typeof item.sub_category_name === 'string' ? item.sub_category_name : '',
      status: typeof item.status === 'string' ? item.status : '',
      visibility: typeof item.visibility === 'string' ? item.visibility : '',
    };
  }

  private mapDetailToForm(item: ProductDetailDto): ProductForm {
    return {
      product_id: String(item.product_id),
      category_id: toNumberString(item.category_id),
      sub_category_id: toNumberString(item.sub_category_id),
      sku: item.sku ?? '',
      title: item.title ?? '',
      short_description: toStringValue(item.short_description),
      description: toStringValue(item.description),
      thumbnail_image: toStringValue(item.thumbnail_image),
      compare_at_price: toNumberString(item.compare_at_price),
      price: toNumberString(item.price),
      cost_price: toNumberString(item.cost_price),
      stock_qty: toNumberString(item.stock_qty),
      low_stock_threshold: toNumberString(item.low_stock_threshold),
      brand_id: toNumberString(item.brand_id),
      barcode: toStringValue(item.barcode),
      status: toStringValue(item.status) || 'draft',
      visibility: toStringValue(item.visibility) || 'catalog_search',
      shipping_class: toStringValue(item.shipping_class),
      supplier: toStringValue(item.supplier),
      is_active: Boolean(item.is_active ?? true),
      is_deleted: Boolean(item.is_deleted ?? false),
      featured: Boolean(item.featured ?? false),
      returnable: Boolean(item.returnable ?? false),
    };
  }

  private toCreatePayload(form: ProductForm): CreateProductsDto {
    return {
      category_id: Number(form.category_id),
      sub_category_id: Number(form.sub_category_id),
      sku: form.sku.trim(),
      title: form.title.trim(),
      short_description: form.short_description.trim() || undefined,
      description: form.description.trim() || undefined,
      thumbnail_image: form.thumbnail_image.trim() || undefined,
      compare_at_price: toNumOrUndefined(form.compare_at_price),
      price: toNumOrUndefined(form.price),
      cost_price: toNumOrUndefined(form.cost_price),
      stock_qty: toNumOrUndefined(form.stock_qty),
      low_stock_threshold: toNumOrUndefined(form.low_stock_threshold),
      brand_id: toNumOrUndefined(form.brand_id),
      barcode: form.barcode.trim() || undefined,
      status: form.status || undefined,
      visibility: form.visibility || undefined,
      shipping_class: form.shipping_class.trim() || undefined,
      supplier: form.supplier.trim() || undefined,
      is_active: form.is_active,
      is_deleted: form.is_deleted,
      featured: form.featured,
      returnable: form.returnable,
    };
  }

  private toUpdatePayload(form: ProductForm): UpdateProductsDto {
    return this.toCreatePayload(form);
  }

  private extractTotal(meta: unknown, fallback: number): number {
    if (typeof meta === 'object' && meta !== null) {
      const value = (meta as Record<string, unknown>)['total'];
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }

    return fallback;
  }

  private emptyForm(): ProductForm {
    return {
      category_id: '',
      sub_category_id: '',
      sku: '',
      title: '',
      short_description: '',
      description: '',
      thumbnail_image: '',
      compare_at_price: '',
      price: '',
      cost_price: '',
      stock_qty: '',
      low_stock_threshold: '',
      brand_id: '',
      barcode: '',
      status: 'draft',
      visibility: 'catalog_search',
      shipping_class: '',
      supplier: '',
      is_active: true,
      is_deleted: false,
      featured: false,
      returnable: true,
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
      if (typeof message === 'string') return message;
      if (Array.isArray(message) && message.length > 0) return String(message[0]);
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
