import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ProductStoreService } from './product-store.service';
import { Product } from './product.model';

type ProductForm = {
  product_id?: string;

  sku: string;
  title: string;
  description: string;
  long_description: string;

  product_image_url: string;
  old_cost: string;
  new_cost: string;
  actual_cost: string;

  stock_qty: string;
  min_retail_qty: string;
  min_dealer_qty: string;

  is_active: boolean;
  is_deleted: boolean;
  is_popular: boolean;
  is_returnable: boolean;
  low_stock_qty: string;
  bar_code: string;
};

function toStr(n: number | null | undefined) {
  return n === null || n === undefined ? '' : String(n);
}
function toNumOrNull(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
@Component({
  selector: 'app-admin-product-list',
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-product-list.component.html',
  styleUrl: './admin-product-list.component.css',
})
export class AdminProductListComponent {
  private store = inject(ProductStoreService);

  // UI state
  q = signal('');
  showDeleted = signal(false);
  modalOpen = signal(false);
  modalMode = signal<'create' | 'edit'>('create');

  // data
  products = signal<Product[]>([]);
  readonly filtered = computed(() => {
    const term = this.q().toLowerCase().trim();
    const showDel = this.showDeleted();
    const lowOnly = this.showOnlyLowStock();

    return this.products()
      .filter((p) => (showDel ? true : !p.is_deleted))
      .filter((p) => {
        if (!lowOnly) return true;
        const low = p.low_stock_qty ?? 0;
        const stock = p.stock_qty ?? 0;
        return low > 0 && stock <= low;
      })
      .filter((p) => {
        if (!term) return true;
        const hay =
          `${p.sku} ${p.title} ${p.description ?? ''} ${p.bar_code ?? ''}`.toLowerCase();
        return hay.includes(term);
      });
  });

  // form
  form = signal<ProductForm>(this.emptyForm());

  constructor() {
    // subscribe to store
    this.store.seedIfEmpty();
    const sub = this.store.products$.subscribe((rows) =>
      this.products.set(rows),
    );
    effect(() => () => sub.unsubscribe());
  }

  openCreate() {
    this.modalMode.set('create');
    this.form.set(this.emptyForm());
    this.modalOpen.set(true);
  }

  openEdit(p: Product) {
    this.modalMode.set('edit');
    this.form.set({
      product_id: p.product_id,
      sku: p.sku ?? '',
      title: p.title ?? '',
      description: p.description ?? '',
      long_description: p.long_description ?? '',
      product_image_url: p.product_image_url ?? '',
      old_cost: toStr(p.old_cost),
      new_cost: toStr(p.new_cost),
      actual_cost: toStr(p.actual_cost),
      stock_qty: toStr(p.stock_qty),
      min_retail_qty: toStr(p.min_retail_qty),
      min_dealer_qty: toStr(p.min_dealer_qty),
      is_active: p.is_active ?? true,
      is_deleted: p.is_deleted ?? false,
      is_popular: p.is_popular ?? false,
      is_returnable: p.is_returnable ?? false,
      bar_code: p.bar_code ?? '',
      low_stock_qty:toStr(p.low_stock_qty),
    });
    this.modalOpen.set(true);
  }

  closeModal() {
    this.modalOpen.set(false);
  }

  save() {
    const f = this.form();
    if (!f.sku.trim() || !f.title.trim()) {
      alert('SKU and Title are required.');
      return;
    }

    const payload: Partial<Product> = {
      sku: f.sku.trim(),
      title: f.title.trim(),
      description: f.description.trim() || undefined,
      long_description: f.long_description.trim() || undefined,
      product_image_url: f.product_image_url.trim() || undefined,

      old_cost: toNumOrNull(f.old_cost),
      new_cost: toNumOrNull(f.new_cost),
      actual_cost: toNumOrNull(f.actual_cost),

      stock_qty: toNumOrNull(f.stock_qty),
      min_retail_qty: toNumOrNull(f.min_retail_qty),
      min_dealer_qty: toNumOrNull(f.min_dealer_qty),

      is_active: !!f.is_active,
      is_deleted: !!f.is_deleted,
      is_popular: !!f.is_popular,
      is_returnable: !!f.is_returnable,

      bar_code: f.bar_code.trim() || undefined,
    };

    if (this.modalMode() === 'create') {
      this.store.create(payload as any);
    } else {
      if (!f.product_id) return;
      this.store.update(f.product_id, payload);
    }

    this.closeModal();
  }

  delete(p: Product) {
    const ok = confirm(`Delete "${p.title}"? (soft delete)`);
    if (!ok) return;
    this.store.softDelete(p.product_id);
  }

  restore(p: Product) {
    this.store.restore(p.product_id);
  }

  private emptyForm(): ProductForm {
    return {
      sku: '',
      title: '',
      description: '',
      long_description: '',
      product_image_url: '',
      old_cost: '',
      new_cost: '',
      actual_cost: '',
      stock_qty: '',
      min_retail_qty: '',
      min_dealer_qty: '',
      is_active: true,
      is_deleted: false,
      is_popular: false,
      is_returnable: false,
      bar_code: '',
      low_stock_qty:'',
    };
  }
  // form is a signal<ProductForm>
  patchForm<K extends keyof ProductForm>(key: K, value: ProductForm[K]) {
    this.form.update((curr) => ({ ...curr, [key]: value }));
  }

  showOnlyLowStock = signal(false);

  // Example: update your computed filtered()
}