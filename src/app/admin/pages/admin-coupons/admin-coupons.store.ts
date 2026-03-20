import { Injectable, signal } from '@angular/core';
import { map, Observable, of, tap } from 'rxjs';
import { AdminProductCategoryService as ProductCategoryService } from '../../../core/api/generated/admin-product-category/admin-product-category.service';
import { AdminProductsService as ProductsService } from '../../../core/api/generated/admin-products/admin-products.service';
import { AdminCouponsService as CouponsService } from '../../../core/api/generated/admin-coupons/admin-coupons.service';
import type {
  CouponsControllerListParams,
  CouponsResponseDto,
  CreateCouponsDto,
  PaginatedCouponsResponseDto,
  PaginatedProductCategoryResponseDto,
  ProductSearchSuggestionDto,
  UpdateCouponsDto,
} from '../../../core/api/generated/schemas';
import { ToastService } from '../../../core/notification/toast.service';
import {
  Coupon,
  CouponEligibility,
  CouponScope,
  CouponStatus,
  CouponType,
  TargetOption,
} from './admin-coupons.models';

const API_ELIGIBILITY_TO_UI: Record<string, CouponEligibility> = {
  all_customers: 'All Customers',
  first_order_only: 'First Order Only',
};

const UI_ELIGIBILITY_TO_API: Record<CouponEligibility, 'all_customers' | 'first_order_only'> = {
  'All Customers': 'all_customers',
  'First Order Only': 'first_order_only',
};

const API_SCOPE_TO_UI: Record<string, CouponScope> = {
  all_products: 'All Products',
  selected_categories: 'Selected Categories',
  selected_products: 'Selected Products',
};

const UI_SCOPE_TO_API: Record<
  CouponScope,
  'all_products' | 'selected_categories' | 'selected_products'
> = {
  'All Products': 'all_products',
  'Selected Categories': 'selected_categories',
  'Selected Products': 'selected_products',
};

const API_TYPE_TO_UI: Record<string, CouponType> = {
  percent: 'Percent',
  fixed: 'Fixed',
};

const UI_TYPE_TO_API: Record<CouponType, 'percent' | 'fixed'> = {
  Percent: 'percent',
  Fixed: 'fixed',
};

const API_STATUS_TO_UI: Record<string, CouponStatus> = {
  active: 'Active',
  inactive: 'Inactive',
};

const UI_STATUS_TO_API: Record<CouponStatus, 'active' | 'inactive'> = {
  Active: 'active',
  Inactive: 'inactive',
};

export type CouponFormValue = {
  code: string;
  description: string;
  customerEligibility: CouponEligibility;
  appliesTo: CouponScope;
  selectedCategoryIds: string[];
  selectedProductIds: string[];
  perCustomerLimit: number;
  stackable: boolean;
  freeShipping: boolean;
  autoApply: boolean;
  type: CouponType;
  value: number;
  minOrder: number;
  maxDiscount: number;
  usageLimit: number;
  startDate: string;
  endDate: string;
  status: CouponStatus;
};

export type CouponListQuery = {
  page: number;
  limit: number;
  search?: string;
  status?: 'active' | 'inactive';
  dateFrom?: string;
  dateTo?: string;
};

@Injectable({ providedIn: 'root' })
export class AdminCouponsStore {
  private readonly couponsState = signal<Coupon[]>([]);
  private readonly couponDetailState = signal<Coupon | null>(null);
  private readonly categoryOptionsState = signal<TargetOption[]>([]);
  private readonly productOptionsState = signal<TargetOption[]>([]);
  private readonly categorySearchResultsState = signal<TargetOption[]>([]);
  private readonly productSearchResultsState = signal<TargetOption[]>([]);
  private readonly loadingState = signal(false);
  private readonly detailLoadingState = signal(false);
  private readonly savingState = signal(false);
  private readonly deletingState = signal(false);
  private readonly initializedState = signal(false);
  private readonly errorState = signal<string | null>(null);
  private readonly detailErrorState = signal<string | null>(null);
  private readonly totalItemsState = signal(0);
  private readonly totalPagesState = signal(1);
  private readonly currentPageState = signal(1);
  private readonly pageSizeState = signal(50);

  constructor(
    private readonly couponsService: CouponsService,
    private readonly productCategoryService: ProductCategoryService,
    private readonly productsService: ProductsService,
    private readonly toastService: ToastService,
  ) {}

  get coupons(): Coupon[] {
    return this.couponsState();
  }

  get couponDetail(): Coupon | null {
    return this.couponDetailState();
  }

  get categoryOptions(): TargetOption[] {
    return this.categoryOptionsState();
  }

  get productOptions(): TargetOption[] {
    return this.productOptionsState();
  }

  get categorySearchResults(): TargetOption[] {
    return this.categorySearchResultsState();
  }

  get productSearchResults(): TargetOption[] {
    return this.productSearchResultsState();
  }

  get loading(): boolean {
    return this.loadingState();
  }

  get detailLoading(): boolean {
    return this.detailLoadingState();
  }

  get saving(): boolean {
    return this.savingState();
  }

  get deleting(): boolean {
    return this.deletingState();
  }

  get error(): string | null {
    return this.errorState();
  }

  get detailError(): string | null {
    return this.detailErrorState();
  }

  get totalItems(): number {
    return this.totalItemsState();
  }

  get totalPages(): number {
    return this.totalPagesState();
  }

  get currentPage(): number {
    return this.currentPageState();
  }

  get pageSize(): number {
    return this.pageSizeState();
  }

  clearCategorySearchResults(): void {
    this.categorySearchResultsState.set([]);
  }

  clearProductSearchResults(): void {
    this.productSearchResultsState.set([]);
  }

  loadCoupons(query: CouponListQuery, force = false): void {
    if (this.loadingState() && !force) {
      return;
    }

    this.loadingState.set(true);
    this.errorState.set(null);
    this.currentPageState.set(query.page);
    this.pageSizeState.set(query.limit);

    this.couponsService
      .couponsControllerList(this.mapListQueryToParams(query))
      .pipe(
        map((response) => this.mapCouponsResponse(response, query)),
        tap({
          next: ({ coupons, totalItems, totalPages }) => {
            this.couponsState.set(coupons);
            this.totalItemsState.set(totalItems);
            this.totalPagesState.set(totalPages);
            this.initializedState.set(true);
          },
          error: () => {
            this.errorState.set('Unable to load coupons right now.');
            this.toastService.error('Unable to load coupons right now.');
          },
        }),
      )
      .subscribe({
        complete: () => {
          this.loadingState.set(false);
        },
        error: () => {
          this.loadingState.set(false);
        },
      });
  }

  loadCoupon(id: string): void {
    if (!id) {
      this.couponDetailState.set(null);
      return;
    }

    this.detailLoadingState.set(true);
    this.detailErrorState.set(null);

    this.couponsService
      .couponsControllerGet(id)
      .pipe(
        map((response) => this.mapCouponResponse(response)),
        tap({
          next: (coupon) => {
            this.couponDetailState.set(coupon);
            this.upsertCoupon(coupon);
          },
          error: () => {
            this.couponDetailState.set(null);
            this.detailErrorState.set('Unable to load coupon details.');
          },
        }),
      )
      .subscribe({
        complete: () => {
          this.detailLoadingState.set(false);
        },
        error: () => {
          this.detailLoadingState.set(false);
        },
      });
  }

  loadCategoryOptions(): void {
    if (this.categoryOptionsState().length > 0) {
      return;
    }

    this.productCategoryService
      .productCategoryControllerList({
        params: {
          page: 1,
          limit: 20,
        },
      })
      .pipe(
        map((response: PaginatedProductCategoryResponseDto) =>
          response.data.map((category) => ({
            id: String(category.category_id),
            name: category.category_name,
          })),
        ),
        tap({
          next: (options) => {
            this.mergeCategoryOptions(options);
          },
          error: () => {
            this.toastService.error('Unable to load coupon category targets.');
          },
        }),
      )
      .subscribe();
  }

  searchCategories(query: string): Observable<TargetOption[]> {
    const term = query.trim();

    if (!term) {
      this.categorySearchResultsState.set([]);
      return of([]);
    }

    return this.productCategoryService
      .productCategoryControllerList({
        params: {
          page: 1,
          limit: 8,
          search: term,
        },
      })
      .pipe(
        map((response: PaginatedProductCategoryResponseDto) =>
          response.data.map((category) => ({
            id: String(category.category_id),
            name: category.category_name,
          })),
        ),
        tap({
          next: (options) => {
            this.mergeCategoryOptions(options);
            this.categorySearchResultsState.set(options);
          },
          error: () => {
            this.categorySearchResultsState.set([]);
            this.toastService.error('Unable to search categories for coupon targeting.');
          },
        }),
      );
  }

  searchProducts(query: string): Observable<TargetOption[]> {
    const term = query.trim();

    if (!term) {
      this.productSearchResultsState.set([]);
      return of([]);
    }

    return this.productsService
      .productsControllerSearchSuggestions({ term, limit: 8 })
      .pipe(
        map((response) =>
          response
            .filter((item: ProductSearchSuggestionDto) => item.type === 'product')
            .map((item: ProductSearchSuggestionDto) => ({
              id: String(item.id),
              name: item.label,
            })),
        ),
        tap({
          next: (options) => {
            this.productOptionsState.set(options);
            this.productSearchResultsState.set(options);
          },
          error: () => {
            this.productSearchResultsState.set([]);
            this.toastService.error('Unable to search products for coupon targeting.');
          },
        }),
      );
  }

  create(coupon: CouponFormValue): Observable<Coupon> {
    this.savingState.set(true);

    return this.couponsService
      .couponsControllerCreate(this.mapFormValueToCreateDto(coupon))
      .pipe(
        map((response) => this.mapCouponResponse(response)),
        tap({
          next: (createdCoupon) => {
            this.upsertCoupon(createdCoupon, true);
            this.toastService.success('Coupon created successfully.');
          },
          error: () => {
            this.toastService.error('Unable to create coupon.');
          },
        }),
        tap({
          next: () => {
            this.savingState.set(false);
          },
          error: () => {
            this.savingState.set(false);
          },
        }),
      );
  }

  update(id: string, coupon: CouponFormValue): Observable<Coupon> {
    this.savingState.set(true);

    return this.couponsService
      .couponsControllerUpdate(id, this.mapFormValueToUpdateDto(coupon))
      .pipe(
        map((response) => this.mapCouponResponse(response)),
        tap({
          next: (updatedCoupon) => {
            this.upsertCoupon(updatedCoupon);
            if (this.couponDetailState()?.id === updatedCoupon.id) {
              this.couponDetailState.set(updatedCoupon);
            }
            this.toastService.success('Coupon updated successfully.');
          },
          error: () => {
            this.toastService.error('Unable to update coupon.');
          },
        }),
        tap({
          next: () => {
            this.savingState.set(false);
          },
          error: () => {
            this.savingState.set(false);
          },
        }),
      );
  }

  remove(id: string): Observable<void> {
    this.deletingState.set(true);

    return this.couponsService.couponsControllerRemove(id).pipe(
      map(() => undefined),
      tap({
        next: () => {
          this.couponsState.set(
            this.couponsState().filter((coupon) => coupon.id !== id),
          );
          if (this.couponDetailState()?.id === id) {
            this.couponDetailState.set(null);
          }
          this.toastService.success('Coupon deleted successfully.');
        },
        error: () => {
          this.toastService.error('Unable to delete coupon.');
        },
      }),
      tap({
        next: () => {
          this.deletingState.set(false);
        },
        error: () => {
          this.deletingState.set(false);
        },
      }),
    );
  }

  findById(id: string): Coupon | null {
    return this.couponsState().find((coupon) => coupon.id === id) ?? null;
  }

  private mapCouponsResponse(
    response: PaginatedCouponsResponseDto,
    query: CouponListQuery,
  ): { coupons: Coupon[]; totalItems: number; totalPages: number } {
    const coupons = response.data.map((coupon) => this.mapCouponResponse(coupon));
    const totalItems = this.extractMetaNumber(response.meta, [
      'totalItems',
      'total',
      'itemCount',
      'totalCount',
    ]) ?? coupons.length;
    const totalPages =
      this.extractMetaNumber(response.meta, [
        'totalPages',
        'pageCount',
        'page_count',
        'lastPage',
      ]) ?? Math.max(1, Math.ceil(totalItems / query.limit));

    return { coupons, totalItems, totalPages };
  }

  private mapCouponResponse(response: CouponsResponseDto): Coupon {
    return {
      id: String(response.coupon_id),
      code: response.coupon_code,
      description: this.asText(response.description),
      customerEligibility:
        API_ELIGIBILITY_TO_UI[response.customer_eligibility] ?? 'All Customers',
      appliesTo: API_SCOPE_TO_UI[response.applies_to] ?? 'All Products',
      selectedCategoryIds: response.category_targets.map((item) =>
        String(item.category_id),
      ),
      selectedProductIds: response.product_targets.map((item) =>
        String(item.product_id),
      ),
      selectedCategoryTargets: response.category_targets.map((item) => ({
        id: String(item.category_id),
        name: this.asText(item.category_name, `Category #${item.category_id}`),
      })),
      selectedProductTargets: response.product_targets.map((item) => ({
        id: String(item.product_id),
        name: this.asText(
          item.title ?? item.sku,
          `Product #${item.product_id}`,
        ),
      })),
      perCustomerLimit: response.per_customer_limit ?? 0,
      stackable: response.stackable,
      freeShipping: response.free_shipping,
      autoApply: response.auto_apply,
      type: API_TYPE_TO_UI[response.coupon_type] ?? 'Percent',
      value: response.coupon_value,
      minOrder: response.min_order_amount ?? 0,
      maxDiscount: response.max_discount_amount ?? 0,
      usageLimit: response.usage_limit ?? 0,
      usedCount: response.used_count ?? 0,
      startDate: this.toDateOnly(response.start_at),
      endDate: this.toDateOnly(response.expire_at),
      status: API_STATUS_TO_UI[response.status] ?? 'Inactive',
      createdAt: response.created_at,
    };
  }

  private mapFormValueToCreateDto(coupon: CouponFormValue): CreateCouponsDto {
    return {
      coupon_code: coupon.code.trim().toUpperCase(),
      description: coupon.description.trim(),
      customer_eligibility: UI_ELIGIBILITY_TO_API[coupon.customerEligibility],
      applies_to: UI_SCOPE_TO_API[coupon.appliesTo],
      target_category_ids:
        coupon.appliesTo === 'Selected Categories'
          ? coupon.selectedCategoryIds
              .map((id) => Number(id))
              .filter((id) => Number.isFinite(id))
          : undefined,
      target_product_ids:
        coupon.appliesTo === 'Selected Products'
          ? coupon.selectedProductIds
              .map((id) => Number(id))
              .filter((id) => Number.isFinite(id))
          : undefined,
      coupon_type: UI_TYPE_TO_API[coupon.type],
      coupon_value: coupon.value,
      min_order_amount: coupon.minOrder,
      max_discount_amount: coupon.type === 'Percent' ? coupon.maxDiscount : 0,
      usage_limit: coupon.usageLimit,
      per_customer_limit: coupon.perCustomerLimit,
      start_at: this.toDateTime(coupon.startDate),
      expire_at: this.toDateTime(coupon.endDate),
      status: UI_STATUS_TO_API[coupon.status],
      stackable: coupon.stackable,
      free_shipping: coupon.freeShipping,
      auto_apply: coupon.autoApply,
    };
  }

  private mapFormValueToUpdateDto(coupon: CouponFormValue): UpdateCouponsDto {
    return this.mapFormValueToCreateDto(coupon);
  }

  private upsertCoupon(coupon: Coupon, prepend = false): void {
    const withoutCurrent = this.couponsState().filter(
      (item) => item.id !== coupon.id,
    );

    this.couponsState.set(
      prepend ? [coupon, ...withoutCurrent] : [...withoutCurrent, coupon],
    );
  }

  private toDateOnly(value: unknown): string {
    const text = this.asText(value);
    return text ? text.slice(0, 10) : '';
  }

  private toDateTime(value: string): string | undefined {
    return value ? `${value}T00:00:00.000Z` : undefined;
  }

  private asText(value: unknown, fallback = ''): string {
    return typeof value === 'string' ? value : fallback;
  }

  private mergeCategoryOptions(options: TargetOption[]): void {
    const merged = new Map(
      this.categoryOptionsState().map((option) => [option.id, option] as const),
    );

    for (const option of options) {
      merged.set(option.id, option);
    }

    this.categoryOptionsState.set([...merged.values()]);
  }

  private mapListQueryToParams(query: CouponListQuery): CouponsControllerListParams {
    return {
      page: query.page,
      limit: query.limit,
      search: query.search,
      status: query.status,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    };
  }

  private extractMetaNumber(
    meta: Record<string, unknown>,
    keys: string[],
  ): number | null {
    for (const key of keys) {
      const value = meta[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === 'string') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
    }

    return null;
  }
}
