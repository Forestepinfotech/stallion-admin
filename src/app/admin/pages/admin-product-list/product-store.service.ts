import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Product } from './product.model';

const STORAGE_KEY = 'products_admin_v1';

function uid() {
  return (
    'p_' + Math.random().toString(16).slice(2) + '_' + Date.now().toString(16)
  );
}
function nowIso() {
  return new Date().toISOString();
}

@Injectable({ providedIn: 'root' })
export class ProductStoreService {
  private readonly _products$ = new BehaviorSubject<Product[]>(this.load());
  readonly products$ = this._products$.asObservable();

  get snapshot() {
    return this._products$.value;
  }

  create(input: Omit<Product, 'product_id' | 'created_at' | 'updated_at'>) {
    const p: Product = {
      ...input,
      product_id: uid(),
      is_deleted: input.is_deleted ?? false,
      is_active: input.is_active ?? true,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    this.set([p, ...this.snapshot]);
  }

  update(product_id: string, patch: Partial<Product>) {
    const updated = this.snapshot.map((p) =>
      p.product_id === product_id
        ? { ...p, ...patch, updated_at: nowIso() }
        : p,
    );
    this.set(updated);
  }

  softDelete(product_id: string) {
    this.update(product_id, { is_deleted: true, is_active: false });
  }

  restore(product_id: string) {
    this.update(product_id, { is_deleted: false });
  }

  seedIfEmpty() {
    if (this.snapshot.length) return;
    const sample: Product[] = [
      {
        product_id: uid(),
        sku: 'SKU-001',
        title: 'Wheels',
        description: 'Comfort fit, ANC',
        long_description:
          'Over-ear headphones with active noise cancelling and 30h battery.',
        product_image_url: 'https://picsum.photos/seed/headphones/400/300',
        old_cost: 149.99,
        new_cost: 99.99,
        actual_cost: 70,
        stock_qty: 42,
        min_retail_qty: 1,
        min_dealer_qty: 10,
        is_active: true,
        is_deleted: false,
        is_popular: true,
        is_returnable: true,
        bar_code: '123456789012',
        created_at: nowIso(),
        updated_at: nowIso(),
      },
      {
        product_id: uid(),
        sku: 'SKU-002',
        title: 'Tire',
        description: 'Fitness + notifications',
        product_image_url: 'https://picsum.photos/seed/watch/400/300',
        old_cost: 199.99,
        new_cost: 179.99,
        actual_cost: 120,
        stock_qty: 8,
        low_stock_qty: 10,
        min_retail_qty: 1,
        min_dealer_qty: 5,
        is_active: true,
        is_deleted: false,
        is_popular: false,
        is_returnable: false,
        bar_code: '987654321098',
        created_at: nowIso(),
        updated_at: nowIso(),
      },
    ];
    this.set(sample);
  }

  private set(products: Product[]) {
    this._products$.next(products);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
  }

  private load(): Product[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
}
