import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ReviewStoreService } from './review-store.service';
import { Review } from './review.model';

type ProductOption = { product_id: string; title: string };
@Component({
  selector: 'app-admin-product-review',
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-product-review.component.html',
  styleUrl: './admin-product-review.component.css',
})
export class AdminProductReviewComponent {
  private store = inject(ReviewStoreService);

  // In real app, you can load these from your product list/store:
  products = signal<ProductOption[]>([
    { product_id: 'p_001', title: 'Impact Socket Set (Auto Tool)' },
    { product_id: 'p_002', title: 'Cordless Drill Kit (Auto Tool)' },
  ]);

  // UI state
  selectedProductId = signal<string>(''); // "" = all
  q = signal<string>('');

  pageSize = signal<number>(6);
  page = signal<number>(1);

  // data
  reviews = signal<Review[]>([]);

  constructor() {
    this.store.seedIfEmpty();
    const sub = this.store.reviews$.subscribe((rows) => this.reviews.set(rows));
    effect(() => () => sub.unsubscribe());
  }

  productTitle(product_id: string) {
    return (
      this.products().find((p) => p.product_id === product_id)?.title ??
      product_id
    );
  }

  // filtered list
  filtered = computed(() => {
    const term = this.q().toLowerCase().trim();
    const pid = this.selectedProductId();

    return this.reviews()
      .filter((r) => (pid ? r.product_id === pid : true))
      .filter((r) => {
        if (!term) return true;
        const hay = `${r.name} ${r.email} ${r.comment}`.toLowerCase();
        return hay.includes(term);
      });
  });

  total = computed(() => this.filtered().length);

  totalPages = computed(() => {
    const t = this.total();
    const size = this.pageSize();
    return Math.max(1, Math.ceil(t / size));
  });

  paged = computed(() => {
    const size = this.pageSize();
    const p = Math.min(this.page(), this.totalPages());
    const start = (p - 1) * size;
    return this.filtered().slice(start, start + size);
  });

  // reset page when filters change
  onFilterChange() {
    this.page.set(1);
  }

  setPage(next: number) {
    const clamped = Math.max(1, Math.min(next, this.totalPages()));
    this.page.set(clamped);
  }

  // stars
  starsArray(rating: number) {
    const n = Math.max(0, Math.min(5, Math.floor(rating || 0)));
    return Array.from({ length: 5 }, (_, i) => i < n);
  }
}
