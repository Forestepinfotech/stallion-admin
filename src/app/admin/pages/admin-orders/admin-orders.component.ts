import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize, forkJoin } from 'rxjs';
import { AdminOrdersService } from '../../../core/api/generated/admin-orders/admin-orders.service';
import type {
  AdminOrderListItemDto,
  OrdersControllerListParams,
  PaginatedOrdersResponseDtoMeta,
} from '../../../core/api/generated/schemas';
import { ToastService } from '../../../core/notification/toast.service';
import { StatusBadgeComponent } from '../../components/status-badge/status-badge.component';
import { ShippingApprovalDrawerComponent } from '../../orders/components/shipping-approval-drawer/shipping-approval-drawer.component';
import {
  approvalBadge,
  fulfillmentBadge,
  orderActionsForListRow,
  paymentBadge,
  refundBadge,
  returnBadge,
} from '../../orders/utils/order-status.util';

type BooleanFilter = 'all' | 'true' | 'false';
type OrdersQuickView =
  | 'all'
  | 'awaiting_approval'
  | 'ready_to_ship'
  | 'packing'
  | 'shipped'
  | 'return_requested'
  | 'refund_requested';

interface OrdersMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

@Component({
  selector: 'app-admin-orders',
  imports: [CommonModule, ReactiveFormsModule, RouterLink, StatusBadgeComponent, ShippingApprovalDrawerComponent],
  templateUrl: './admin-orders.component.html',
  styleUrl: './admin-orders.component.css',
})
export class AdminOrdersComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly ordersApi = inject(AdminOrdersService);
  private readonly toast = inject(ToastService);

  readonly pageSizeOptions = ['20', '50', '100'];
  readonly booleanOptions: Array<{ value: BooleanFilter; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'true', label: 'Yes' },
    { value: 'false', label: 'No' },
  ];

  readonly filterForm = this.fb.nonNullable.group({
    search: [''],
    customerName: [''],
    customerEmail: [''],
    customerPhone: [''],
    userId: [''],
    productId: [''],
    statusId: [''],
    isPaid: ['all' as BooleanFilter],
    isActive: ['all' as BooleanFilter],
    dateFrom: [''],
    dateTo: [''],
    sortBy: ['created_at'],
    limit: ['50'],
  });

  loading = false;
  loadError: string | null = null;
  orders: AdminOrderListItemDto[] = [];
  quickView: OrdersQuickView = 'all';
  selected = new Set<number>();
  bulkApproving = false;

  shippingDrawerOpen = false;
  shippingDrawerOrderId: string | null = null;

  meta: OrdersMeta = { page: 1, limit: 50, total: 0, totalPages: 1 };
  appliedParams: OrdersControllerListParams = { page: 1, limit: 50, sortBy: 'created_at' };

  ngOnInit(): void {
    this.loadOrders();
  }

  get limit(): number {
    return this.meta.limit;
  }

  get totalOrders(): number {
    return this.meta.total;
  }

  get totalPages(): number {
    return this.meta.totalPages;
  }

  get showingFrom(): number {
    if (this.meta.total === 0) return 0;
    return (this.meta.page - 1) * this.meta.limit + 1;
  }

  get showingTo(): number {
    return Math.min(this.meta.page * this.meta.limit, this.meta.total);
  }

  get canGoPrev(): boolean {
    return this.meta.page > 1;
  }

  get canGoNext(): boolean {
    return this.meta.page < this.meta.totalPages;
  }

  applyFilters(): void {
    this.loadOrders({
      ...this.buildListParams(),
      page: 1,
      limit: Number(this.filterForm.get('limit')!.value ?? '50'),
    });
  }

  resetFilters(): void {
    this.filterForm.reset({
      search: '',
      customerName: '',
      customerEmail: '',
      customerPhone: '',
      userId: '',
      productId: '',
      statusId: '',
      isPaid: 'all',
      isActive: 'all',
      dateFrom: '',
      dateTo: '',
      sortBy: 'created_at',
      limit: '50',
    });
    this.loadOrders({ page: 1, limit: 50, sortBy: 'created_at' });
  }

  onPageSizeChange(): void {
    this.loadOrders({
      ...this.buildListParams(),
      page: 1,
      limit: Number(this.filterForm.get('limit')!.value ?? '50'),
    });
  }

  changePage(page: number): void {
    if (page < 1 || page > this.meta.totalPages || page === this.meta.page) return;
    this.loadOrders({ ...this.appliedParams, page });
  }

  refresh(): void {
    this.loadOrders();
  }

  trackByOrderId(_: number, item: AdminOrderListItemDto): number {
    return item.order_id;
  }

  displayedOrders(): AdminOrderListItemDto[] {
    const list = this.orders;
    switch (this.quickView) {
      case 'awaiting_approval':
        return list.filter((o) => o.approval_status === 'pending' && o.payment_status === 'paid');
      case 'ready_to_ship':
        return list.filter(
          (o) =>
            o.payment_status === 'paid' &&
            (o.approval_status === 'approved' || o.approval_status === 'not_required') &&
            (o.fulfillment_status === 'pending' || o.fulfillment_status === 'processing') &&
            o.overall_status !== 'cancelled',
        );
      case 'packing':
        return list.filter((o) => o.fulfillment_status === 'processing');
      case 'shipped':
        return list.filter((o) => o.fulfillment_status === 'shipped' || o.fulfillment_status === 'delivered');
      case 'return_requested':
        return list.filter((o) => o.return_state === 'requested' || o.return_state === 'in_review');
      case 'refund_requested':
        return list.filter((o) => o.refund_state === 'requested' || o.refund_state === 'in_review');
      default:
        return list;
    }
  }

  setQuickView(view: OrdersQuickView): void {
    this.quickView = view;
    this.selected.clear();
  }

  toggleAll(checked: boolean): void {
    this.selected.clear();
    if (!checked) return;
    for (const o of this.displayedOrders()) {
      this.selected.add(o.order_id);
    }
  }

  toggleOne(orderId: number, checked: boolean): void {
    if (checked) this.selected.add(orderId);
    else this.selected.delete(orderId);
  }

  isSelected(orderId: number): boolean {
    return this.selected.has(orderId);
  }

  openShipping(orderId: number): void {
    this.shippingDrawerOrderId = String(orderId);
    this.shippingDrawerOpen = true;
  }

  closeShipping(): void {
    this.shippingDrawerOpen = false;
    this.shippingDrawerOrderId = null;
  }

  approveFromList(orderId: number): void {
    const order = this.orders.find((o) => o.order_id === orderId);
    if (!order) return;
    const actions = orderActionsForListRow(order);
    if (!actions.canApprove) return;
    this.ordersApi.ordersControllerApprove(String(orderId)).subscribe({
      next: () => {
        this.toast.success('Order approved.');
        this.loadOrders();
      },
      error: (error: unknown) => this.toast.error(this.getApiErrorMessage(error, 'Failed to approve order.')),
    });
  }

  bulkApproveSelected(): void {
    if (this.bulkApproving) return;
    const selectedOrders = this.orders.filter((o) => this.selected.has(o.order_id));
    const targets = selectedOrders.filter((o) => orderActionsForListRow(o).canApprove);
    if (targets.length === 0) {
      this.toast.error('No selected orders are eligible for approval.');
      return;
    }

    this.bulkApproving = true;
    forkJoin(targets.map((o) => this.ordersApi.ordersControllerApprove(String(o.order_id))))
      .pipe(finalize(() => (this.bulkApproving = false)))
      .subscribe({
        next: () => {
          this.toast.success(`Approved ${targets.length} order(s).`);
          this.selected.clear();
          this.loadOrders();
        },
        error: (error: unknown) => {
          this.toast.error(this.getApiErrorMessage(error, 'Bulk approve failed.'));
        },
      });
  }

  paymentBadgeFor(order: AdminOrderListItemDto) {
    return paymentBadge(order.payment_status);
  }
  approvalBadgeFor(order: AdminOrderListItemDto) {
    return approvalBadge(order.approval_status);
  }
  fulfillmentBadgeFor(order: AdminOrderListItemDto) {
    return fulfillmentBadge(order.fulfillment_status);
  }
  returnBadgeFor(order: AdminOrderListItemDto) {
    return returnBadge(order.return_state);
  }
  refundBadgeFor(order: AdminOrderListItemDto) {
    return refundBadge(order.refund_state);
  }
  actionsFor(order: AdminOrderListItemDto) {
    return orderActionsForListRow(order);
  }

  private loadOrders(params: OrdersControllerListParams = this.appliedParams): void {
    this.appliedParams = params;
    this.loading = true;
    this.loadError = null;
    this.ordersApi
      .ordersControllerList(params)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (response) => {
          this.orders = Array.isArray(response.data) ? response.data : [];
          this.selected.clear();
          this.meta = this.normalizeMeta(response.meta, params.page ?? 1, params.limit ?? 50);
        },
        error: (error: unknown) => {
          this.orders = [];
          this.selected.clear();
          this.meta = this.normalizeMeta(undefined, params.page ?? 1, params.limit ?? 50);
          this.loadError = this.getApiErrorMessage(error, 'Failed to load orders.');
          this.toast.error(this.loadError);
        },
      });
  }

  private buildListParams(): OrdersControllerListParams {
    const value = this.filterForm.getRawValue();
    return {
      search: this.emptyToUndefined(value.search),
      customer_name: this.emptyToUndefined(value.customerName),
      customer_email: this.emptyToUndefined(value.customerEmail),
      customer_phone: this.emptyToUndefined(value.customerPhone),
      user_id: this.toNumber(value.userId),
      product_id: this.toNumber(value.productId),
      status_id: this.toNumber(value.statusId),
      is_paid: this.toBoolean(value.isPaid),
      is_active: this.toBoolean(value.isActive),
      dateFrom: this.emptyToUndefined(value.dateFrom),
      dateTo: this.emptyToUndefined(value.dateTo),
      sortBy: this.emptyToUndefined(value.sortBy),
      page: this.appliedParams.page ?? 1,
      limit: Number(value.limit ?? '50'),
    };
  }

  private normalizeMeta(
    meta: PaginatedOrdersResponseDtoMeta | undefined,
    fallbackPage: number,
    fallbackLimit: number,
  ): OrdersMeta {
    const source = (meta ?? {}) as Record<string, unknown>;
    const page = this.toNumber(source['page']) ?? fallbackPage;
    const limit = this.toNumber(source['limit']) ?? this.toNumber(source['perPage']) ?? fallbackLimit;
    const total =
      this.toNumber(source['total']) ??
      this.toNumber(source['totalItems']) ??
      this.toNumber(source['itemCount']) ??
      this.orders.length;
    const totalPages =
      this.toNumber(source['totalPages']) ??
      this.toNumber(source['pageCount']) ??
      Math.max(1, Math.ceil(total / Math.max(limit, 1)));

    return { page, limit, total, totalPages: Math.max(1, totalPages) };
  }

  private emptyToUndefined(value: string | null | undefined): string | undefined {
    const normalized = String(value ?? '').trim();
    return normalized ? normalized : undefined;
  }

  private toNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const normalized = String(value ?? '').trim();
    if (!normalized) return undefined;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private toBoolean(value: BooleanFilter): boolean | undefined {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return undefined;
  }

  private getApiErrorMessage(error: unknown, fallback: string): string {
    if (
      typeof error === 'object' &&
      error !== null &&
      'error' in error &&
      typeof error.error === 'object' &&
      error.error !== null &&
      'message' in error.error
    ) {
      const message = error.error.message;
      if (typeof message === 'string') return message;
      if (Array.isArray(message) && message.length > 0) return String(message[0]);
    }

    if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
      return error.message;
    }

    return fallback;
  }
}
