import { Component, DestroyRef, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  debounceTime,
  distinctUntilChanged,
  filter,
  Subject,
  switchMap,
  tap,
} from 'rxjs';
import {
  Coupon,
  CouponEligibility,
  CouponScope,
  CouponStatus,
  CouponType,
  TargetOption,
} from './admin-coupons.models';
import {
  AdminCouponsStore,
  CouponFormValue,
  CouponListQuery,
} from './admin-coupons.store';
import { ToastService } from '../../../core/notification/toast.service';

@Component({
  selector: 'app-admin-coupons',
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterLink],
  templateUrl: './admin-coupons.component.html',
  styleUrl: './admin-coupons.component.css',
})
export class AdminCouponsComponent implements OnInit {
  private readonly couponsStore = inject(AdminCouponsStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly toastService = inject(ToastService);
  private readonly categorySearch$ = new Subject<string>();
  private readonly productSearch$ = new Subject<string>();

  // UI
  query = '';
  filterStatus: 'All' | CouponStatus = 'All';
  filterStartDate = this.isoDateOffset(-30);
  filterEndDate = this.isoDateOffset(30);
  appliedQuery = '';
  appliedStatus: 'All' | CouponStatus = 'All';
  appliedStartDate = this.isoDateOffset(-30);
  appliedEndDate = this.isoDateOffset(30);
  currentPage = 1;
  pageSize = 50;
  readonly pageSizeOptions = [20, 50, 100];
  modalOpen = false;
  confirmOpen = false;
  mode: 'create' | 'edit' = 'create';
  selectedId: string | null = null;
  categorySearch = '';
  productSearch = '';

  // form created in constructor (avoids fb init error)
  form;

  constructor(private fb: FormBuilder) {
    this.form = this.fb.group({
      code: ['', [Validators.required, Validators.minLength(3)]],
      description: ['', [Validators.required, Validators.maxLength(180)]],
      customerEligibility: [
        'All Customers' as CouponEligibility,
        Validators.required,
      ],
      appliesTo: ['All Products' as CouponScope, Validators.required],
      selectedCategoryIds: [[] as string[]],
      selectedProductIds: [[] as string[]],
      perCustomerLimit: [1, [Validators.required, Validators.min(1)]],
      stackable: [false],
      freeShipping: [false],
      autoApply: [false],
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

    this.form.get('appliesTo')!.valueChanges.subscribe((scope) => {
      if (scope === 'Selected Categories') {
        this.form.patchValue({ selectedProductIds: [] }, { emitEvent: false });
        return;
      }

      if (scope === 'Selected Products') {
        this.form.patchValue({ selectedCategoryIds: [] }, { emitEvent: false });
        return;
      }

      this.form.patchValue(
        { selectedCategoryIds: [], selectedProductIds: [] },
        { emitEvent: false },
      );
    });
  }

  ngOnInit(): void {
    this.categorySearch$
      .pipe(
        tap((query) => {
          if (query.trim().length < 4) {
            this.couponsStore.clearCategorySearchResults();
          }
        }),
        filter((query) => query.trim().length >= 3),
        debounceTime(1000),
        distinctUntilChanged(),
        switchMap((query) => this.couponsStore.searchCategories(query)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();

    this.productSearch$
      .pipe(
        tap((query) => {
          if (query.trim().length < 4) {
            this.couponsStore.clearProductSearchResults();
          }
        }),
        filter((query) => query.trim().length >= 4),
        debounceTime(1000),
        distinctUntilChanged(),
        switchMap((query) => this.couponsStore.searchProducts(query)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();

    this.reloadCoupons();
    this.couponsStore.loadCategoryOptions();
  }

  // derived list
  get filtered(): Coupon[] {
    const today = this.isoDateOffset(0);

    return this.couponsStore.coupons
      .map((c) => ({
        ...c,
        // auto inactivate if expired
        status: c.endDate < today ? 'Inactive' : c.status,
      }))
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  }

  get paginatedCoupons(): Coupon[] {
    return this.filtered;
  }

  get totalPages() {
    return this.couponsStore.totalPages;
  }

  get pageStart() {
    if (this.filtered.length === 0) return 0;
    return (this.currentPage - 1) * this.pageSize + 1;
  }

  get pageEnd() {
    if (this.filtered.length === 0) return 0;
    return this.pageStart + this.filtered.length - 1;
  }

  // stats
  get totalCount() {
    return this.couponsStore.totalItems;
  }

  get loading() {
    return this.couponsStore.loading;
  }

  get saving() {
    return this.couponsStore.saving;
  }

  get deleting() {
    return this.couponsStore.deleting;
  }

  get loadError() {
    return this.couponsStore.error;
  }

  get categoryOptions(): TargetOption[] {
    return this.couponsStore.categoryOptions;
  }

  get productOptions(): TargetOption[] {
    return this.couponsStore.productOptions;
  }

  get activeCount() {
    return this.filtered.filter((c) => this.isActive(c)).length;
  }
  get inactiveCount() {
    return this.filtered.filter((c) => !this.isActive(c)).length;
  }

  isActive(c: Coupon) {
    const today = this.isoDateOffset(0);
    return c.status === 'Active' && c.startDate <= today && c.endDate >= today;
  }

  usagePercent(c: Coupon) {
    if (c.usageLimit <= 0) return 0;
    return Math.min((c.usedCount / c.usageLimit) * 100, 100);
  }

  applyFilters() {
    if (!this.filterStartDate || !this.filterEndDate) {
      alert('Start date and end date are required to filter coupons.');
      return;
    }

    if (this.filterStartDate > this.filterEndDate) {
      alert('Filter start date must be before end date.');
      return;
    }

    this.appliedQuery = this.query;
    this.appliedStatus = this.filterStatus;
    this.appliedStartDate = this.filterStartDate;
    this.appliedEndDate = this.filterEndDate;
    this.currentPage = 1;
    this.reloadCoupons();
  }

  resetFilters() {
    this.query = '';
    this.filterStatus = 'All';
    this.filterStartDate = this.isoDateOffset(-30);
    this.filterEndDate = this.isoDateOffset(30);
    this.applyFilters();
  }

  onPageSizeChange() {
    this.currentPage = 1;
    this.reloadCoupons();
  }

  goToPage(page: number) {
    const nextPage = Math.min(Math.max(page, 1), this.totalPages);
    if (nextPage === this.currentPage) {
      return;
    }

    this.currentPage = nextPage;
    this.reloadCoupons();
  }

  openCreate() {
    this.mode = 'create';
    this.selectedId = null;
    this.categorySearch = '';
    this.productSearch = '';
    this.form.reset({
      code: '',
      description: '',
      customerEligibility: 'All Customers',
      appliesTo: 'All Products',
      selectedCategoryIds: [],
      selectedProductIds: [],
      perCustomerLimit: 1,
      stackable: false,
      freeShipping: false,
      autoApply: false,
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
    this.categorySearch = '';
    this.productSearch = '';
    this.form.reset({
      code: c.code,
      description: c.description,
      customerEligibility: c.customerEligibility,
      appliesTo: c.appliesTo,
      selectedCategoryIds: [...c.selectedCategoryIds],
      selectedProductIds: [...c.selectedProductIds],
      perCustomerLimit: c.perCustomerLimit,
      stackable: c.stackable,
      freeShipping: c.freeShipping,
      autoApply: c.autoApply,
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
    this.categorySearch = '';
    this.productSearch = '';
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
    this.couponsStore
      .remove(this.selectedId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.currentPage = Math.min(this.currentPage, this.totalPages);
          this.closeConfirm();
        },
      });
  }

  save() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const v = this.form.getRawValue();

    // Validate date order
    if (v.endDate! < v.startDate!) {
      this.toastService.warning('End date must be after start date.');
      return;
    }

    if (
      v.appliesTo === 'Selected Categories' &&
      (!v.selectedCategoryIds || v.selectedCategoryIds.length === 0)
    ) {
      this.toastService.warning(
        'Select at least one category for this coupon.',
      );
      return;
    }

    if (
      v.appliesTo === 'Selected Products' &&
      (!v.selectedProductIds || v.selectedProductIds.length === 0)
    ) {
      this.toastService.warning('Select at least one product for this coupon.');
      return;
    }

    // Normalize coupon code
    const code = String(v.code).trim().toUpperCase();
    const payload: CouponFormValue = {
      code,
      description: String(v.description ?? '').trim(),
      customerEligibility: v.customerEligibility!,
      appliesTo: v.appliesTo!,
      selectedCategoryIds: [...(v.selectedCategoryIds ?? [])],
      selectedProductIds: [...(v.selectedProductIds ?? [])],
      perCustomerLimit: Number(v.perCustomerLimit),
      stackable: !!v.stackable,
      freeShipping: !!v.freeShipping,
      autoApply: !!v.autoApply,
      type: v.type!,
      value: Number(v.value),
      minOrder: Number(v.minOrder),
      maxDiscount: v.type === 'Percent' ? Number(v.maxDiscount) : 0,
      usageLimit: Number(v.usageLimit),
      startDate: v.startDate!,
      endDate: v.endDate!,
      status: v.status!,
    };

    if (this.mode === 'create') {
      if (this.couponsStore.coupons.some((c) => c.code === code)) {
        this.toastService.warning('Coupon code already exists.');
        return;
      }

      this.couponsStore
        .create(payload)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => {
            this.currentPage = Math.min(this.currentPage, this.totalPages);
            this.closeModal();
          },
        });
      return;
    }

    this.couponsStore
      .update(this.selectedId!, payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.currentPage = Math.min(this.currentPage, this.totalPages);
          this.closeModal();
        },
      });
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

  addSelection(
    controlName: 'selectedCategoryIds' | 'selectedProductIds',
    id: string,
  ) {
    const control = this.form.get(controlName);
    const current = Array.isArray(control?.value) ? [...control.value] : [];
    if (current.includes(id)) return;
    const next = [...current, id];

    control?.setValue(next);
    control?.markAsDirty();
    control?.markAsTouched();
  }

  removeSelection(
    controlName: 'selectedCategoryIds' | 'selectedProductIds',
    id: string,
  ) {
    const control = this.form.get(controlName);
    const current = Array.isArray(control?.value) ? [...control.value] : [];
    const next = current.filter((item) => item !== id);

    control?.setValue(next);
    control?.markAsDirty();
    control?.markAsTouched();
  }

  get categorySearchResults() {
    return this.couponsStore.categorySearchResults.filter(
      (option) => !this.selectedCategoryIds.includes(option.id),
    );
  }

  get productSearchResults() {
    return this.couponsStore.productSearchResults.filter(
      (option) => !this.selectedProductIds.includes(option.id),
    );
  }

  get selectedCategories() {
    return this.resolveTargets(this.selectedCategoryIds, this.categoryOptions);
  }

  get selectedProducts() {
    return this.resolveTargets(this.selectedProductIds, this.productOptions);
  }

  get selectedCategoryIds() {
    const value = this.form.get('selectedCategoryIds')?.value;
    return Array.isArray(value) ? value : [];
  }

  get selectedProductIds() {
    const value = this.form.get('selectedProductIds')?.value;
    return Array.isArray(value) ? value : [];
  }

  selectedTargetSummary(coupon: Coupon) {
    if (coupon.appliesTo === 'Selected Categories') {
      return this.labelForTargets(coupon.selectedCategoryTargets);
    }

    if (coupon.appliesTo === 'Selected Products') {
      return this.labelForTargets(coupon.selectedProductTargets);
    }

    return 'Storewide';
  }

  discountSummary(coupon: Coupon) {
    if (coupon.type === 'Percent') {
      return `${coupon.value}% off`;
    }

    return `$${coupon.value} off`;
  }

  onProductSearchChange(query: string) {
    this.productSearch = query;
    this.productSearch$.next(query);
  }

  onCategorySearchChange(query: string) {
    this.categorySearch = query;
    this.categorySearch$.next(query);
  }

  retryLoad() {
    this.reloadCoupons(true);
    this.couponsStore.loadCategoryOptions();
  }

  private reloadCoupons(force = false) {
    this.couponsStore.loadCoupons(this.buildCouponListQuery(), force);
  }

  private buildCouponListQuery(): CouponListQuery {
    return {
      page: this.currentPage,
      limit: this.pageSize,
      search: this.appliedQuery.trim() || undefined,
      status:
        this.appliedStatus === 'All'
          ? undefined
          : (this.appliedStatus.toLowerCase() as 'active' | 'inactive'),
      dateFrom: this.appliedStartDate || undefined,
      dateTo: this.appliedEndDate || undefined,
    };
  }

  private labelForTargets(targets: TargetOption[]) {
    const labels = targets
      .map((target) => target.name)
      .filter((value): value is string => !!value);

    return labels.length ? labels.join(', ') : 'None selected';
  }

  private resolveTargets(ids: string[], options: TargetOption[]) {
    return ids
      .map((id) => options.find((option) => option.id === id))
      .filter((value): value is TargetOption => !!value);
  }
}
