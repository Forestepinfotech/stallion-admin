import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { FormsModule } from '@angular/forms';

type CouponType = 'Percent' | 'Fixed';
type CouponStatus = 'Active' | 'Inactive';

type Coupon = {
  id: string;
  code: string;
  type: CouponType;
  value: number; // percent or fixed amount
  minOrder: number;
  maxDiscount: number; // only used for percent coupons
  usageLimit: number;
  usedCount: number;
  startDate: string; // ISO string (yyyy-mm-dd)
  endDate: string; // ISO string (yyyy-mm-dd)
  status: CouponStatus;
  createdAt: string;
};
@Component({
  selector: 'app-admin-coupons',
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './admin-coupons.component.html',
  styleUrl: './admin-coupons.component.css',
})
export class AdminCouponsComponent {
  // UI
  query = '';
  filterStatus: 'All' | CouponStatus = 'All';
  modalOpen = false;
  confirmOpen = false;
  mode: 'create' | 'edit' = 'create';
  selectedId: string | null = null;

  // demo data (replace with backend later)
  coupons: Coupon[] = [
    {
      id: crypto.randomUUID(),
      code: 'WELCOME10',
      type: 'Percent',
      value: 10,
      minOrder: 50,
      maxDiscount: 30,
      usageLimit: 200,
      usedCount: 45,
      startDate: this.isoDateOffset(-10),
      endDate: this.isoDateOffset(30),
      status: 'Active',
      createdAt: new Date().toISOString(),
    },
    {
      id: crypto.randomUUID(),
      code: 'FLAT25',
      type: 'Fixed',
      value: 25,
      minOrder: 100,
      maxDiscount: 0,
      usageLimit: 100,
      usedCount: 70,
      startDate: this.isoDateOffset(-3),
      endDate: this.isoDateOffset(10),
      status: 'Active',
      createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    },
    {
      id: crypto.randomUUID(),
      code: 'EXPIRED5',
      type: 'Percent',
      value: 5,
      minOrder: 25,
      maxDiscount: 10,
      usageLimit: 50,
      usedCount: 50,
      startDate: this.isoDateOffset(-40),
      endDate: this.isoDateOffset(-5),
      status: 'Inactive',
      createdAt: new Date(Date.now() - 86400000 * 20).toISOString(),
    },
  ];

  // form created in constructor (avoids fb init error)
  form;

  constructor(private fb: FormBuilder) {
    this.form = this.fb.group({
      code: ['', [Validators.required, Validators.minLength(3)]],
      type: ['Percent' as CouponType, Validators.required],
      value: [10, [Validators.required, Validators.min(1)]],
      minOrder: [0, [Validators.required, Validators.min(0)]],
      maxDiscount: [0, [Validators.required, Validators.min(0)]],
      usageLimit: [100, [Validators.required, Validators.min(1)]],
      startDate: [this.isoDateOffset(0), Validators.required],
      endDate: [this.isoDateOffset(30), Validators.required],
      status: ['Active' as CouponStatus, Validators.required],
    });

    // If fixed type, maxDiscount not needed (set to 0)
    this.form.get('type')!.valueChanges.subscribe((t) => {
      if (t === 'Fixed') this.form.patchValue({ maxDiscount: 0 });
    });
  }

  // derived list
  get filtered(): Coupon[] {
    const q = this.query.trim().toLowerCase();
    const today = this.isoDateOffset(0);

    return this.coupons
      .map((c) => ({
        ...c,
        // auto inactivate if expired
        status: c.endDate < today ? 'Inactive' : c.status,
      }))
      .filter((c) => {
        const matchesQuery =
          !q ||
          c.code.toLowerCase().includes(q) ||
          c.type.toLowerCase().includes(q);

        const matchesStatus =
          this.filterStatus === 'All' ? true : c.status === this.filterStatus;

        return matchesQuery && matchesStatus;
      })
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  }

  // stats
  get totalCount() {
    return this.coupons.length;
  }
  get activeCount() {
    return this.coupons.filter((c) => this.isActive(c)).length;
  }
  get inactiveCount() {
    return this.coupons.filter((c) => !this.isActive(c)).length;
  }

  isActive(c: Coupon) {
    const today = this.isoDateOffset(0);
    return c.status === 'Active' && c.startDate <= today && c.endDate >= today;
  }

  usagePercent(c: Coupon) {
    if (c.usageLimit <= 0) return 0;
    return Math.min((c.usedCount / c.usageLimit) * 100, 100);
  }

  openCreate() {
    this.mode = 'create';
    this.selectedId = null;
    this.form.reset({
      code: '',
      type: 'Percent',
      value: 10,
      minOrder: 0,
      maxDiscount: 0,
      usageLimit: 100,
      startDate: this.isoDateOffset(0),
      endDate: this.isoDateOffset(30),
      status: 'Active',
    });
    this.modalOpen = true;
  }

  openEdit(c: Coupon) {
    this.mode = 'edit';
    this.selectedId = c.id;
    this.form.reset({
      code: c.code,
      type: c.type,
      value: c.value,
      minOrder: c.minOrder,
      maxDiscount: c.maxDiscount,
      usageLimit: c.usageLimit,
      startDate: c.startDate,
      endDate: c.endDate,
      status: c.status,
    });
    this.modalOpen = true;
  }

  closeModal() {
    this.modalOpen = false;
  }

  openDelete(c: Coupon) {
    this.selectedId = c.id;
    this.confirmOpen = true;
  }

  closeConfirm() {
    this.confirmOpen = false;
    this.selectedId = null;
  }

  confirmDelete() {
    if (!this.selectedId) return;
    this.coupons = this.coupons.filter((c) => c.id !== this.selectedId);
    this.closeConfirm();
  }

  save() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const v = this.form.getRawValue();

    // Validate date order
    if (v.endDate! < v.startDate!) {
      alert('End date must be after start date.');
      return;
    }

    // Normalize coupon code
    const code = String(v.code).trim().toUpperCase();

    if (this.mode === 'create') {
      // prevent duplicates
      if (this.coupons.some((c) => c.code === code)) {
        alert('Coupon code already exists.');
        return;
      }

      const newCoupon: Coupon = {
        id: crypto.randomUUID(),
        code,
        type: v.type!,
        value: Number(v.value),
        minOrder: Number(v.minOrder),
        maxDiscount: v.type === 'Percent' ? Number(v.maxDiscount) : 0,
        usageLimit: Number(v.usageLimit),
        usedCount: 0,
        startDate: v.startDate!,
        endDate: v.endDate!,
        status: v.status!,
        createdAt: new Date().toISOString(),
      };
      this.coupons = [newCoupon, ...this.coupons];
    } else {
      const id = this.selectedId!;
      this.coupons = this.coupons.map((c) =>
        c.id === id
          ? {
              ...c,
              code,
              type: v.type!,
              value: Number(v.value),
              minOrder: Number(v.minOrder),
              maxDiscount: v.type === 'Percent' ? Number(v.maxDiscount) : 0,
              usageLimit: Number(v.usageLimit),
              startDate: v.startDate!,
              endDate: v.endDate!,
              status: v.status!,
            }
          : c,
      );
    }

    this.closeModal();
  }

  private isoDateOffset(days: number) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  isInvalid(name: string) {
    const c = this.form.get(name);
    return !!c && c.invalid && (c.touched || c.dirty);
  }
}