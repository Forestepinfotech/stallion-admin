import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AdminCouponsStore } from './admin-coupons.store';
import { TargetOption } from './admin-coupons.models';
import { AdminCouponRedemptionService } from '../../../core/api/generated/admin-coupon-redemption/admin-coupon-redemption.service';
import { PaginatedCouponRedemptionResponseDto } from '../../../core/api/generated/schemas';

type CouponUsageRow = {
  id: string;
  couponId: string;
  userId: string;
  orderId: string;
  createdBy: string | null;
  isDeleted: boolean;
};

@Component({
  selector: 'app-admin-coupon-detail',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './admin-coupon-detail.component.html',
})
export class AdminCouponDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly couponsStore = inject(AdminCouponsStore);
  private readonly couponRedemptionService = inject(AdminCouponRedemptionService);

  protected usageRows: CouponUsageRow[] = [];
  protected usageLoading = false;
  protected usageError: string | null = null;
  protected usagePage = 1;
  protected usagePageSize = 10;
  protected readonly usagePageSizeOptions = [10, 20, 50];

  ngOnInit(): void {
    this.couponsStore.loadCategoryOptions();
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.couponsStore.loadCoupon(id);
      this.loadUsageRows(id);
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

  get usageTotalItems() {
    return this.usageRows.length;
  }

  get usageTotalPages() {
    return Math.max(1, Math.ceil(this.usageTotalItems / this.usagePageSize));
  }

  get paginatedUsageRows() {
    const start = (this.usagePage - 1) * this.usagePageSize;
    return this.usageRows.slice(start, start + this.usagePageSize);
  }

  get usagePageStart() {
    if (this.usageTotalItems === 0) return 0;
    return (this.usagePage - 1) * this.usagePageSize + 1;
  }

  get usagePageEnd() {
    if (this.usageTotalItems === 0) return 0;
    return Math.min(this.usagePage * this.usagePageSize, this.usageTotalItems);
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

  onUsagePageSizeChange() {
    this.usagePage = 1;
  }

  goToUsagePage(page: number) {
    this.usagePage = Math.min(Math.max(page, 1), this.usageTotalPages);
  }

  retryUsage() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.loadUsageRows(id);
    }
  }

  private loadUsageRows(couponId: string) {
    this.usageLoading = true;
    this.usageError = null;

    this.couponRedemptionService
      .couponRedemptionControllerList({
        params: { coupon_id: couponId },
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response: PaginatedCouponRedemptionResponseDto) => {
          const filtered = (response.data ?? [])
            .filter((item) => String(item.coupon_id) === couponId)
            .map((item) => ({
              id: String(item.red_id),
              couponId: String(item.coupon_id),
              userId: String(item.user_id),
              orderId: String(item.order_id),
              createdBy:
                item.created_by === undefined || item.created_by === null
                  ? null
                  : String(item.created_by),
              isDeleted: !!item.is_deleted,
            }))
            .sort((a, b) => Number(b.id) - Number(a.id));

          this.usageRows = filtered;
          this.usagePage = 1;
          this.usageLoading = false;
        },
        error: () => {
          this.usageError = 'Unable to load coupon usage right now.';
          this.usageRows = [];
          this.usageLoading = false;
        },
      });
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
