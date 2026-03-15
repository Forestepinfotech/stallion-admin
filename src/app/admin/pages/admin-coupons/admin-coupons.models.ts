export type CouponType = 'Percent' | 'Fixed';
export type CouponStatus = 'Active' | 'Inactive';
export type CouponEligibility = 'All Customers' | 'First Order Only';
export type CouponScope = 'All Products' | 'Selected Categories' | 'Selected Products';

export type TargetOption = {
  id: string;
  name: string;
};

export type Coupon = {
  id: string;
  code: string;
  description: string;
  customerEligibility: CouponEligibility;
  appliesTo: CouponScope;
  selectedCategoryIds: string[];
  selectedProductIds: string[];
  selectedCategoryTargets: TargetOption[];
  selectedProductTargets: TargetOption[];
  perCustomerLimit: number;
  stackable: boolean;
  freeShipping: boolean;
  autoApply: boolean;
  type: CouponType;
  value: number;
  minOrder: number;
  maxDiscount: number;
  usageLimit: number;
  usedCount: number;
  startDate: string;
  endDate: string;
  status: CouponStatus;
  createdAt: string;
};
