import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

type ProductType = 'Tire' | 'Rim' | 'Cover';

type InventoryItem = {
  id: string;
  type: ProductType;
  name: string;
  sku: string;
  price: number;
  available: number;
  sold: number;
  updatedAt: string; // yyyy-mm-dd
};

@Component({
  selector: 'app-admin-inventory',
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './admin-inventory.component.html',
  styleUrl: './admin-inventory.component.css',
})
export class AdminInventoryComponent {
  // UI
  query = '';
  filterType: 'All' | ProductType = 'All';
  modalOpen = false;

  selected: InventoryItem | null = null;

  items: InventoryItem[] = [
    {
      id: crypto.randomUUID(),
      type: 'Tire',
      name: 'Michelin Pilot Sport 4 (205/55R16)',
      sku: 'TIRE-20555R16-MIC',
      price: 229.99,
      available: 18,
      sold: 64,
      updatedAt: this.isoDateOffset(-1),
    },
    {
      id: crypto.randomUUID(),
      type: 'Rim',
      name: 'Alloy Rim 17x7.5 (5x114.3)',
      sku: 'RIM-17X75-AL',
      price: 189.0,
      available: 6,
      sold: 41,
      updatedAt: this.isoDateOffset(-2),
    },
    {
      id: crypto.randomUUID(),
      type: 'Cover',
      name: 'Wheel Cover 16" Black',
      sku: 'COV-16-BLK',
      price: 24.99,
      available: 3,
      sold: 120,
      updatedAt: this.isoDateOffset(-3),
    },
    {
      id: crypto.randomUUID(),
      type: 'Tire',
      name: 'Bridgestone Turanza T005 (225/45R17)',
      sku: 'TIRE-22545R17-BRD',
      price: 249.5,
      available: 28,
      sold: 23,
      updatedAt: this.isoDateOffset(-7),
    },
  ];

  // Form (non-nullable to avoid null issues)
  stockForm;

  constructor(private fb: FormBuilder) {
    this.stockForm = this.fb.nonNullable.group({
      available: this.fb.nonNullable.control(0, [
        Validators.required,
        Validators.min(0),
      ]),
      sold: this.fb.nonNullable.control(0, [
        Validators.required,
        Validators.min(0),
      ]),
    });
  }

  // ======= Derived / summary =======
  get filtered(): InventoryItem[] {
    const q = this.query.trim().toLowerCase();
    return this.items
      .filter((x) => {
        const matchesQuery =
          !q ||
          x.name.toLowerCase().includes(q) ||
          x.sku.toLowerCase().includes(q) ||
          x.type.toLowerCase().includes(q);

        const matchesType =
          this.filterType === 'All' ? true : x.type === this.filterType;

        return matchesQuery && matchesType;
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  get totalProducts() {
    return this.items.length;
  }

  get totalAvailable() {
    return this.items.reduce((sum, x) => sum + x.available, 0);
  }

  get totalSold() {
    return this.items.reduce((sum, x) => sum + x.sold, 0);
  }

  get lowStockCount() {
    return this.items.filter((x) => x.available <= 5).length;
  }

  // ======= UI helpers =======
  lowStock(x: InventoryItem) {
    return x.available <= 5;
  }

  typeBadge(t: ProductType) {
    switch (t) {
      case 'Tire':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'Rim':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      default:
        return 'bg-amber-50 text-amber-700 border-amber-200';
    }
  }

  // ======= Modal =======
  openUpdate(item: InventoryItem) {
    this.selected = item;
    this.stockForm.reset({
      available: item.available,
      sold: item.sold,
    });
    this.modalOpen = true;
  }

  closeModal() {
    this.modalOpen = false;
    this.selected = null;
  }

  saveStock() {
    if (!this.selected) return;

    if (this.stockForm.invalid) {
      this.stockForm.markAllAsTouched();
      return;
    }

    const v = this.stockForm.getRawValue();

    this.items = this.items.map((x) =>
      x.id === this.selected!.id
        ? {
            ...x,
            available: Number(v.available),
            sold: Number(v.sold),
            updatedAt: this.isoDateOffset(0),
          }
        : x,
    );

    this.closeModal();
    alert('Inventory updated (demo). Connect backend API here.');
  }

  private isoDateOffset(days: number) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
}
