import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AdminCouponsStore } from './admin-coupons.store';
import { TargetOption } from './admin-coupons.models';

@Component({
  selector: 'app-admin-coupon-detail',
  imports: [CommonModule, RouterLink],
  templateUrl: './admin-coupon-detail.component.html',
})
export class AdminCouponDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly couponsStore = inject(AdminCouponsStore);

  ngOnInit(): void {
    this.couponsStore.loadCategoryOptions();
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.couponsStore.loadCoupon(id);
    }
  }

  get coupon() {
    return this.couponsStore.couponDetail;
  }

  get loading() {
    return this.couponsStore.detailLoading;
  }

  get error() {
    return this.couponsStore.detailError;
  }

  isActive(startDate: string, endDate: string, status: string) {
    const today = this.isoDateOffset(0);
    return status === 'Active' && startDate <= today && endDate >= today;
  }

  discountSummary(value: number, type: string) {
    return type === 'Percent' ? `${value}% off` : `$${value} off`;
  }

  targetSummary(
    appliesTo: string,
    categories: TargetOption[],
    products: TargetOption[],
  ) {
    if (appliesTo === 'Selected Categories') {
      return this.resolveLabels(categories);
    }

    if (appliesTo === 'Selected Products') {
      return this.resolveLabels(products);
    }

    return 'Storewide';
  }

  private resolveLabels(options: TargetOption[]) {
    const labels = options
      .map((option) => option.name)
      .filter((value): value is string => !!value);

    return labels.length ? labels.join(', ') : 'None selected';
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
