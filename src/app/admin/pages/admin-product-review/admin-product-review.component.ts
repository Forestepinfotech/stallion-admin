import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ProductReviewService } from '../../../core/api/generated/product-review/product-review.service';
import { ProductsService } from '../../../core/api/generated/products/products.service';
import type {
  PaginatedProductReviewResponseDto,
  ProductReviewControllerListParams,
  ProductReviewControllerListSortBy,
  ProductReviewResponseDto,
} from '../../../core/api/generated/schemas';
import { Review } from './review.model';

type ProductOption = { product_id: string; title: string };
type RatingFilter = 'All' | '1' | '2' | '3' | '4' | '5';
type ActiveFilter = 'All' | 'Active' | 'Inactive';
type SortFilter =
  | 'newest'
  | 'oldest'
  | 'rating_high'
  | 'rating_low'
  | 'customer_asc'
  | 'customer_desc'
  | 'product_asc'
  | 'product_desc';

@Component({
  selector: 'app-admin-product-review',
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-product-review.component.html',
  styleUrl: './admin-product-review.component.css',
})
export class AdminProductReviewComponent implements OnInit {
  private readonly productReviewService = inject(ProductReviewService);
  private readonly productsService = inject(ProductsService);

  readonly pageSizeOptions = [6, 12, 24];
  readonly sortOptions: Array<{ value: SortFilter; label: string }> = [
    { value: 'newest', label: 'Newest first' },
    { value: 'oldest', label: 'Oldest first' },
    { value: 'rating_high', label: 'Rating high to low' },
    { value: 'rating_low', label: 'Rating low to high' },
    { value: 'customer_asc', label: 'Customer A-Z' },
    { value: 'customer_desc', label: 'Customer Z-A' },
    { value: 'product_asc', label: 'Product A-Z' },
    { value: 'product_desc', label: 'Product Z-A' },
  ];

  products: ProductOption[] = [];
  reviews: Review[] = [];

  selectedProductId = '';
  q = '';
  selectedRating: RatingFilter = 'All';
  selectedActive: ActiveFilter = 'All';
  filterStartDate = this.isoDateOffset(-30);
  filterEndDate = this.isoDateOffset(30);
  sortBy: SortFilter = 'newest';
  pageSize = 6;
  page = 1;

  appliedSelectedProductId = '';
  appliedQ = '';
  appliedSelectedRating: RatingFilter = 'All';
  appliedSelectedActive: ActiveFilter = 'All';
  appliedFilterStartDate = this.isoDateOffset(-30);
  appliedFilterEndDate = this.isoDateOffset(30);
  appliedSortBy: SortFilter = 'newest';

  total = 0;
  totalPages = 1;
  loading = false;
  loadingProducts = false;
  loadError = '';

  ngOnInit(): void {
    this.loadProducts();
    this.loadReviews();
  }

  productTitle(review: Review) {
    if (review.product_title) {
      return review.product_title;
    }

    return (
      this.products.find((p) => p.product_id === review.product_id)?.title ??
      review.product_id
    );
  }

  applyFilters() {
    if (!this.filterStartDate || !this.filterEndDate) {
      alert('Start date and end date are required.');
      return;
    }

    if (this.filterStartDate > this.filterEndDate) {
      alert('Filter start date must be before end date.');
      return;
    }

    this.appliedSelectedProductId = this.selectedProductId;
    this.appliedQ = this.q.trim();
    this.appliedSelectedRating = this.selectedRating;
    this.appliedSelectedActive = this.selectedActive;
    this.appliedFilterStartDate = this.filterStartDate;
    this.appliedFilterEndDate = this.filterEndDate;
    this.appliedSortBy = this.sortBy;
    this.page = 1;
    this.loadReviews();
  }

  resetFilters() {
    this.selectedProductId = '';
    this.q = '';
    this.selectedRating = 'All';
    this.selectedActive = 'All';
    this.filterStartDate = this.isoDateOffset(-30);
    this.filterEndDate = this.isoDateOffset(30);
    this.sortBy = 'newest';
    this.pageSize = 6;
    this.applyFilters();
  }

  onPageSizeChange() {
    this.page = 1;
    this.loadReviews();
  }

  setPage(next: number) {
    const clamped = Math.max(1, Math.min(next, this.totalPages));
    if (clamped === this.page) {
      return;
    }

    this.page = clamped;
    this.loadReviews();
  }

  starsArray(rating: number) {
    const n = Math.max(0, Math.min(5, Math.floor(rating || 0)));
    return Array.from({ length: 5 }, (_, i) => i < n);
  }

  retryLoad() {
    this.loadReviews();
  }

  private loadReviews() {
    this.loading = true;
    this.loadError = '';

    this.productReviewService
      .productReviewControllerList(this.buildReviewParams())
      .subscribe({
        next: (response) => {
          this.reviews = response.data.map((review) => this.mapReview(review));
          this.total = this.extractMetaNumber(response.meta, [
            'totalItems',
            'total',
            'itemCount',
            'totalCount',
          ]) ?? this.reviews.length;
          this.totalPages =
            this.extractMetaNumber(response.meta, [
              'totalPages',
              'pageCount',
              'page_count',
              'lastPage',
            ]) ?? Math.max(1, Math.ceil(this.total / this.pageSize));
          this.loading = false;
        },
        error: () => {
          this.reviews = [];
          this.total = 0;
          this.totalPages = 1;
          this.loading = false;
          this.loadError = 'Unable to load reviews right now.';
        },
      });
  }

  private loadProducts() {
    this.loadingProducts = true;

    this.productsService
      .productsControllerList(undefined, {
        params: {
          page: 1,
          limit: 100,
        },
      })
      .subscribe({
        next: (response) => {
          this.products = response.data.map((product) => ({
            product_id: String(product.product_id),
            title: product.title,
          }));
          this.loadingProducts = false;
        },
        error: () => {
          this.products = [];
          this.loadingProducts = false;
        },
      });
  }

  private buildReviewParams(): ProductReviewControllerListParams {
    return {
      page: this.page,
      limit: this.pageSize,
      search: this.appliedQ || undefined,
      product_id: this.appliedSelectedProductId || undefined,
      rating:
        this.appliedSelectedRating === 'All'
          ? undefined
          : this.appliedSelectedRating,
      is_active:
        this.appliedSelectedActive === 'All'
          ? undefined
          : this.appliedSelectedActive === 'Active'
            ? 'true'
            : 'false',
      dateFrom: this.appliedFilterStartDate || undefined,
      dateTo: this.appliedFilterEndDate || undefined,
      sortBy: this.appliedSortBy as ProductReviewControllerListSortBy,
    };
  }

  private mapReview(review: ProductReviewResponseDto): Review {
    return {
      review_id: String(review.review_id),
      product_id: String(review.product_id),
      name: this.asText(review.customer_name, 'Unknown customer'),
      email: this.asText(review.customer_email, 'No email'),
      rating: review.rating,
      comment: review.review_comment,
      product_title: this.asText(review.product_title),
      is_active: review.is_active,
      images: [],
      created_at: this.asText(review.created_at),
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

  private asText(value: unknown, fallback = ''): string {
    return typeof value === 'string' ? value : fallback;
  }

  private isoDateOffset(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
}
