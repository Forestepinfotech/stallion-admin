import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { FormsModule } from '@angular/forms';

type ReturnStatus = 'Pending' | 'Approved' | 'Rejected' | 'Refunded';

type ReturnItem = {
  id: string;
  orderNo: string;
  customer: string;
  productType: 'Tire' | 'Rim' | 'Cover';
  productName: string;
  sku: string;
  qty: number;
  reason: string;
  status: ReturnStatus;
  requestDate: string; // yyyy-mm-dd
  notes?: string;
};
@Component({
  selector: 'app-admin-product-return',
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './admin-product-return.component.html',
  styleUrl: './admin-product-return.component.css',
})
export class AdminProductReturnComponent {
  // UI
  query = '';
  filterStatus: 'All' | ReturnStatus = 'All';
  modalOpen = false;
  detailOpen = false;

  selected: ReturnItem | null = null;

  returns: ReturnItem[] = [
    {
      id: crypto.randomUUID(),
      orderNo: 'ORD-10291',
      customer: 'Ali Khan',
      productType: 'Tire',
      productName: 'Michelin Pilot Sport 4',
      sku: 'TIRE-20555R16-MIC',
      qty: 2,
      reason: 'Wrong size ordered',
      status: 'Pending',
      requestDate: this.isoDateOffset(-1),
      notes: 'Customer requested exchange.',
    },
    {
      id: crypto.randomUUID(),
      orderNo: 'ORD-10260',
      customer: 'Sara Ahmed',
      productType: 'Rim',
      productName: 'Alloy Rim 17x7.5',
      sku: 'RIM-17X75-AL',
      qty: 4,
      reason: 'Damaged on delivery',
      status: 'Approved',
      requestDate: this.isoDateOffset(-6),
      notes: 'Photos provided. Approve pickup.',
    },
    {
      id: crypto.randomUUID(),
      orderNo: 'ORD-10210',
      customer: 'John Smith',
      productType: 'Cover',
      productName: 'Wheel Cover 16"',
      sku: 'COV-16-BLK',
      qty: 1,
      reason: 'Not satisfied',
      status: 'Refunded',
      requestDate: this.isoDateOffset(-18),
      notes: 'Refund processed.',
    },
  ];

  form;

  constructor(private fb: FormBuilder) {
    this.form = this.fb.nonNullable.group({
      orderNo: this.fb.nonNullable.control('', [
        Validators.required,
        Validators.minLength(4),
      ]),
      customer: this.fb.nonNullable.control('', [
        Validators.required,
        Validators.minLength(2),
      ]),
      productType: this.fb.nonNullable.control<'Tire' | 'Rim' | 'Cover'>(
        'Tire',
        Validators.required,
      ),
      productName: this.fb.nonNullable.control('', [
        Validators.required,
        Validators.minLength(2),
      ]),
      sku: this.fb.nonNullable.control('', [
        Validators.required,
        Validators.minLength(3),
      ]),
      qty: this.fb.nonNullable.control(1, [
        Validators.required,
        Validators.min(1),
      ]),
      reason: this.fb.nonNullable.control('', [
        Validators.required,
        Validators.minLength(5),
      ]),
      status: this.fb.nonNullable.control<ReturnStatus>(
        'Pending',
        Validators.required,
      ),
      requestDate: this.fb.nonNullable.control(
        this.isoDateOffset(0),
        Validators.required,
      ),
      notes: this.fb.nonNullable.control(''),
    });
  }

  // List
  get filtered(): ReturnItem[] {
    const q = this.query.trim().toLowerCase();

    return this.returns
      .filter((r) => {
        const matchesQuery =
          !q ||
          r.orderNo.toLowerCase().includes(q) ||
          r.customer.toLowerCase().includes(q) ||
          r.productName.toLowerCase().includes(q) ||
          r.sku.toLowerCase().includes(q);

        const matchesStatus =
          this.filterStatus === 'All' ? true : r.status === this.filterStatus;

        return matchesQuery && matchesStatus;
      })
      .sort((a, b) => b.requestDate.localeCompare(a.requestDate));
  }

  // Modal create
  openCreate() {
    this.form.reset({
      orderNo: '',
      customer: '',
      productType: 'Tire',
      productName: '',
      sku: '',
      qty: 1,
      reason: '',
      status: 'Pending',
      requestDate: this.isoDateOffset(0),
      notes: '',
    });
    this.modalOpen = true;
  }

  closeCreate() {
    this.modalOpen = false;
  }

  saveReturn() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const v = this.form.getRawValue();

    const newItem: ReturnItem = {
      id: crypto.randomUUID(),
      orderNo: v.orderNo.trim().toUpperCase(),
      customer: v.customer.trim(),
      productType: v.productType,
      productName: v.productName.trim(),
      sku: v.sku.trim().toUpperCase(),
      qty: Number(v.qty),
      reason: v.reason.trim(),
      status: v.status,
      requestDate: v.requestDate,
      notes: v.notes?.trim(),
    };

    this.returns = [newItem, ...this.returns];
    this.closeCreate();
    alert('Return request created (demo). Connect backend API next.');
  }

  // Details
  openDetails(item: ReturnItem) {
    this.selected = item;
    this.detailOpen = true;
  }

  closeDetails() {
    this.detailOpen = false;
    this.selected = null;
  }

  // Status helpers
  badgeClass(s: ReturnStatus) {
    switch (s) {
      case 'Pending':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'Approved':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'Rejected':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'Refunded':
        return 'bg-sky-50 text-sky-700 border-sky-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  }

  isInvalid(name: string) {
    const c = this.form.get(name);
    return !!c && c.invalid && (c.touched || c.dirty);
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
