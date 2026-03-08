import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BuyerOrdersStore } from './buyer-orders.store';
import { BuyerOrder, BuyerType } from './buyer-orders.model';
@Component({
  selector: 'app-admin-product-buyer',
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-product-buyer.component.html',
  styleUrl: './admin-product-buyer.component.css',
})
export class AdminProductBuyerComponent {
  private store = inject(BuyerOrdersStore);

  tab = signal<BuyerType>('customer'); // customer | dealer
  q = signal<string>('');

  pageSize = signal<number>(6);
  page = signal<number>(1);

  orders = signal<BuyerOrder[]>([]);

  constructor() {
    this.store.seedIfEmpty();
    const sub = this.store.orders$.subscribe((rows) => this.orders.set(rows));
    effect(() => () => sub.unsubscribe());
  }

  filtered = computed(() => {
    const type = this.tab();
    const term = this.q().toLowerCase().trim();

    return this.orders()
      .filter((o) => o.buyer.type === type)
      .filter((o) => {
        if (!term) return true;

        const addr = `${o.buyer.address_line1} ${o.buyer.address_line2 ?? ''} ${o.buyer.city} ${o.buyer.province} ${o.buyer.postal_code} ${o.buyer.country}`;
        const items = o.items
          .map((i) => `${i.product_title} ${i.sku ?? ''}`)
          .join(' ');

        const hay =
          `${o.buyer.name} ${o.buyer.email} ${o.buyer.phone ?? ''} ${addr} ${items}`.toLowerCase();
        return hay.includes(term);
      })
      .sort((a, b) => (a.order_date < b.order_date ? 1 : -1)); // newest first
  });

  total = computed(() => this.filtered().length);

  totalPages = computed(() =>
    Math.max(1, Math.ceil(this.total() / this.pageSize())),
  );

  paged = computed(() => {
    const size = this.pageSize();
    const p = Math.min(this.page(), this.totalPages());
    const start = (p - 1) * size;
    return this.filtered().slice(start, start + size);
  });

  setTab(t: BuyerType) {
    this.tab.set(t);
    this.page.set(1);
  }

  onFilterChange() {
    this.page.set(1);
  }

  setPage(next: number) {
    const clamped = Math.max(1, Math.min(next, this.totalPages()));
    this.page.set(clamped);
  }

  fullAddress(o: BuyerOrder) {
    const b = o.buyer;
    const line2 = b.address_line2 ? `, ${b.address_line2}` : '';
    return `${b.address_line1}${line2}, ${b.city}, ${b.province} ${b.postal_code}, ${b.country}`;
  }

  totalQty(o: BuyerOrder) {
    return o.items.reduce((sum, it) => sum + (it.qty || 0), 0);
  }
}
