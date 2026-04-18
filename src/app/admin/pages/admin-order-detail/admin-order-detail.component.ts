import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AdminOrdersService } from '../../../core/api/generated/admin-orders/admin-orders.service';
import { AdminPaymentsService } from '../../../core/api/generated/admin-payments/admin-payments.service';
import type { AdminOrderDetailDto } from '../../../core/api/generated/schemas';
import { ToastService } from '../../../core/notification/toast.service';
import { StatusBadgeComponent } from '../../components/status-badge/status-badge.component';
import type { StatusBadgeVariant } from '../../components/status-badge/status-badge.component';
import { TimelineComponent, type TimelineItem } from '../../components/timeline/timeline.component';
import { ReturnApprovalDrawerComponent } from '../../orders/components/return-approval-drawer/return-approval-drawer.component';
import { ShippingApprovalDrawerComponent } from '../../orders/components/shipping-approval-drawer/shipping-approval-drawer.component';
import { approvalBadge, fulfillmentBadge, paymentBadge, refundBadge, returnBadge } from '../../orders/utils/order-status.util';

@Component({
  selector: 'app-admin-order-detail',
  imports: [
    CommonModule,
    RouterLink,
    StatusBadgeComponent,
    ShippingApprovalDrawerComponent,
    ReturnApprovalDrawerComponent,
    TimelineComponent,
  ],
  templateUrl: './admin-order-detail.component.html',
  styleUrl: './admin-order-detail.component.css',
})
export class AdminOrderDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly ordersApi = inject(AdminOrdersService);
  private readonly paymentsApi = inject(AdminPaymentsService);
  private readonly toast = inject(ToastService);

  loading = false;
  order: AdminOrderDetailDto | null = null;
  loadError: string | null = null;
  orderId: string | null = null;

  markingPaid = false;
  approving = false;
  refunding = false;
  refundStartedAt: Date | null = null;
  refundUiMessage: string | null = null;
  refundUiError: string | null = null;

  tab = signal<'summary' | 'items' | 'shipping' | 'returns' | 'refunds' | 'timeline'>('summary');

  shippingDrawerOpen = false;
  returnDrawerOpen = false;
  returnDrawerRequestId: string | null = null;

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.toast.error('Order id is missing.');
      return;
    }

    this.orderId = id;
    this.loadOrder(id);
  }

  retry(): void {
    if (!this.orderId) return;
    this.loadOrder(this.orderId);
  }

  display(value: unknown, fallback = '-'): string {
    if (value === null || value === undefined) return fallback;
    const asString = String(value).trim();
    return asString.length ? asString : fallback;
  }

  fullName(first: unknown, last: unknown, fallback = '-'): string {
    const firstName =
      typeof first === 'string'
        ? first.trim()
        : first == null
          ? ''
          : String(first).trim();
    const lastName =
      typeof last === 'string'
        ? last.trim()
        : last == null
          ? ''
          : String(last).trim();
    const combined = [firstName, lastName].filter(Boolean).join(' ').trim();
    return combined.length ? combined : fallback;
  }

  initials(value: unknown, fallback = '?'): string {
    const raw =
      typeof value === 'string' ? value : value == null ? '' : String(value);
    const cleaned = raw.trim();
    if (!cleaned) return fallback;
    const parts = cleaned.split(/\s+/g).filter(Boolean);
    const a = parts[0]?.[0] ?? '';
    const b = parts.length > 1 ? (parts[1]?.[0] ?? '') : '';
    const out = (a + b).toUpperCase();
    return out || fallback;
  }

  currencyCode(value: unknown, fallback = 'USD'): string {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) return trimmed.toUpperCase();
    }
    return fallback;
  }

  itemImageUrl(item: unknown): string | null {
    const i = item as any;
    const candidates: unknown[] = [
      i?.image_url,
      i?.product_image_url,
      i?.product_image,
      i?.thumbnail_url,
      i?.thumb_url,
      i?.media_url,
      i?.image,
      i?.product?.image_url,
      i?.product?.product_image_url,
      i?.product?.thumbnail_url,
      i?.product?.media_url,
      i?.product?.image,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim().length > 0)
        return candidate;
    }

    const images = i?.images;
    if (Array.isArray(images) && images.length > 0) {
      const first = images[0];
      if (typeof first === 'string' && first.trim().length > 0) return first;
      if (first && typeof first === 'object') {
        const url =
          (first as any)?.url ??
          (first as any)?.media_url ??
          (first as any)?.image_url;
        if (typeof url === 'string' && url.trim().length > 0) return url;
      }
    }

    const productImages =
      i?.product?.images ?? i?.product?.media ?? i?.product?.media_assets;
    if (Array.isArray(productImages) && productImages.length > 0) {
      const first = productImages[0];
      if (typeof first === 'string' && first.trim().length > 0) return first;
      if (first && typeof first === 'object') {
        const url =
          (first as any)?.url ??
          (first as any)?.media_url ??
          (first as any)?.image_url;
        if (typeof url === 'string' && url.trim().length > 0) return url;
      }
    }

    return null;
  }

  markPaid(): void {
    if (!this.orderId || !this.order) return;
    if (this.refunding) {
      this.toast.error('Refund is in progress. Please wait.');
      return;
    }
    if (this.order.is_paid) return;
    if (!confirm('Confirm payment from gateway for this order?')) return;

    this.markingPaid = true;
    this.paymentsApi
      .adminPaymentsControllerConfirmFromGateway(this.orderId)
      .pipe(finalize(() => (this.markingPaid = false)))
      .subscribe({
        next: (response) => {
          if (response?.is_paid) {
            this.toast.success('Gateway payment confirmed.');
          } else {
            this.toast.error(
              `Gateway did not confirm payment${response?.gateway_status ? ` (${response.gateway_status}).` : '.'}`,
            );
          }
          this.loadOrder(this.orderId!);
        },
        error: (error: unknown) => {
          this.toast.error(
            this.getApiErrorMessage(
              error,
              'Failed to confirm payment from gateway.',
            ),
          );
        },
      });
  }

  approveOrder(): void {
    if (!this.orderId || !this.order) return;
    if (this.refunding) {
      this.toast.error('Refund is in progress. Please wait.');
      return;
    }
    if (!this.order.is_paid) {
      this.toast.error('Order is not marked as paid yet.');
      return;
    }
    if (this.order.is_approved) return;
    if (!confirm('Approve this order?')) return;

    this.approving = true;
    this.ordersApi
      .ordersControllerApprove(this.orderId)
      .pipe(finalize(() => (this.approving = false)))
      .subscribe({
        next: () => {
          this.toast.success('Order approved.');
          this.loadOrder(this.orderId!);
        },
        error: (error: unknown) => {
          this.toast.error(
            this.getApiErrorMessage(error, 'Failed to approve order.'),
          );
        },
      });
  }

  refundOrder(): void {
    if (!this.orderId || !this.order) return;
    if (this.refunding) return;
    if (!this.order.is_paid) {
      this.toast.error('Order is not marked as paid yet.');
      return;
    }
    if (Array.isArray(this.order.refunds) && this.order.refunds.length > 0)
      return;

    const confirmed = confirm(
      'WARNING: This will issue a refund for this order. This action cannot be undone.\n\nDo you want to continue?',
    );
    if (!confirmed) return;

    this.refundUiError = null;
    this.refundUiMessage = 'Submitting refund request...';
    this.refundStartedAt = new Date();
    this.refunding = true;
    this.paymentsApi
      .adminPaymentsControllerRefund({
        order_id: this.order.order_id,
        order_number: this.order.order_number,
      })
      .pipe(finalize(() => (this.refunding = false)))
      .subscribe({
        next: (response) => {
          this.refundUiMessage = `Refund created${response?.status ? ` (${response.status}).` : '.'} Refreshing order...`;
          this.toast.success(
            `Refund created${response?.status ? ` (${response.status}).` : '.'}`,
          );
          this.loadOrder(this.orderId!);
        },
        error: (error: unknown) => {
          this.refundUiMessage = null;
          this.refundUiError = this.getApiErrorMessage(
            error,
            'Failed to refund order.',
          );
          this.toast.error(this.refundUiError);
        },
      });
  }

  setTab(tab: 'summary' | 'items' | 'shipping' | 'returns' | 'refunds' | 'timeline'): void {
    this.tab.set(tab);
  }

  openShipping(): void {
    if (!this.orderId) return;
    this.shippingDrawerOpen = true;
  }

  closeShipping(): void {
    this.shippingDrawerOpen = false;
  }

  openReturn(returnRequestId: number): void {
    this.returnDrawerRequestId = String(returnRequestId);
    this.returnDrawerOpen = true;
  }

  closeReturn(): void {
    this.returnDrawerOpen = false;
    this.returnDrawerRequestId = null;
  }

  refreshAfterWorkflow(): void {
    if (!this.orderId) return;
    this.loadOrder(this.orderId);
  }

  paymentBadgeLabel(value: AdminOrderDetailDto): { label: string; variant: any } {
    return paymentBadge(value.payment_status);
  }
  approvalBadgeLabel(value: AdminOrderDetailDto): { label: string; variant: any } {
    return approvalBadge(value.approval_status);
  }
  fulfillmentBadgeLabel(value: AdminOrderDetailDto): { label: string; variant: any } {
    return fulfillmentBadge(value.fulfillment_status);
  }
  returnBadgeLabel(value: AdminOrderDetailDto): { label: string; variant: any } {
    return returnBadge(value.return_state);
  }
  refundBadgeLabel(value: AdminOrderDetailDto): { label: string; variant: any } {
    return refundBadge(value.refund_state);
  }

  orderTimeline(order: AdminOrderDetailDto): TimelineItem[] {
    const items: TimelineItem[] = [];
    for (const log of order.logs ?? []) {
      items.push({
        id: log.order_log_id ?? `${log.event_type}-${log.created_at}`,
        at: log.created_at,
        title: log.event_type,
        description: this.toText(log.message),
        meta: log.metadata ?? null,
      });
    }
    return items.sort((a, b) => new Date(b.at as any).getTime() - new Date(a.at as any).getTime());
  }

  customerSelectedShipping(order: AdminOrderDetailDto): { service_code: string | number | null; service_name: string | null } | null {
    const o = order as any;
    const fromSnapshot =
      o?.checkout_shipping_snapshot ??
      o?.checkout_shipping ??
      o?.shipping_snapshot ??
      o?.shipping_quote_snapshot ??
      null;
    if (fromSnapshot && typeof fromSnapshot === 'object') {
      const sc = (fromSnapshot as any)?.service_code ?? (fromSnapshot as any)?.serviceCode ?? null;
      const sn = (fromSnapshot as any)?.service_name ?? (fromSnapshot as any)?.serviceName ?? null;
      return sc || sn ? { service_code: sc, service_name: typeof sn === 'string' ? sn : sn == null ? null : String(sn) } : null;
    }

    const service_code =
      o?.customer_selected_service_code ??
      o?.selected_shipping_service_code ??
      o?.shipping_method_code ??
      o?.netparcel_service_code ??
      o?.selected_service_code ??
      o?.shipping_service_code ??
      o?.service_code ??
      null;
    const service_name =
      o?.customer_selected_service_name ??
      o?.selected_shipping_service_name ??
      o?.shipping_method_name ??
      o?.netparcel_service_name ??
      o?.selected_service_name ??
      o?.shipping_service_name ??
      o?.service_name ??
      null;

    const sn = typeof service_name === 'string' ? service_name.trim() : service_name == null ? null : String(service_name);
    return service_code || sn ? { service_code, service_name: sn } : null;
  }

  shipmentBadge(shipment: any): { label: string; variant: StatusBadgeVariant } {
    const deliveredAt = shipment?.delivered_at ?? null;
    if (deliveredAt) return { label: 'Delivered', variant: 'success' };

    const shippedAt = shipment?.shipped_at ?? null;
    if (shippedAt) return { label: 'Shipped', variant: 'info' };

    const hasTracking = Boolean(
      (typeof shipment?.tracking_number === 'string' &&
        shipment.tracking_number.trim().length > 0) ||
        shipment?.tracking_number,
    );
    if (hasTracking) return { label: 'In Transit', variant: 'info' };

    return { label: 'Pending', variant: 'warning' };
  }

  objectEntries(value: unknown): Array<{ key: string; value: unknown }> {
    if (!value || typeof value !== 'object') return [];
    if (Array.isArray(value)) return [];
    return Object.keys(value as Record<string, unknown>)
      .sort((a, b) => a.localeCompare(b))
      .map((key) => ({ key, value: (value as any)[key] }));
  }

  isArray(value: unknown): boolean {
    return Array.isArray(value);
  }

  isScalar(value: unknown): boolean {
    const t = typeof value;
    return value == null || t === 'string' || t === 'number' || t === 'boolean';
  }

  jsonPreview(value: unknown, maxLen = 900): string {
    if (value == null) return '';
    try {
      const json = JSON.stringify(value, null, 2);
      if (typeof json !== 'string') return String(value);
      return json.length > maxLen ? `${json.slice(0, maxLen)}\n…` : json;
    } catch {
      return String(value);
    }
  }

  shipmentPackageRows(rawPackages: unknown): Array<{
    index: number;
    weight: number | null;
    length: number | null;
    width: number | null;
    height: number | null;
    description: string | null;
    raw: unknown;
  }> {
    const list: unknown[] = Array.isArray(rawPackages) ? rawPackages : [];

    const toNum = (v: unknown): number | null => {
      const n = typeof v === 'number' ? v : Number(String(v ?? '').trim());
      return Number.isFinite(n) ? n : null;
    };

    const toText = (v: unknown): string | null => {
      if (v === null || v === undefined) return null;
      if (typeof v === 'string') {
        const t = v.trim();
        return t ? t : null;
      }
      const s = String(v).trim();
      return s ? s : null;
    };

    const rows: Array<{
      index: number;
      weight: number | null;
      length: number | null;
      width: number | null;
      height: number | null;
      description: string | null;
      raw: unknown;
    }> = [];

    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      if (!item || typeof item !== 'object') continue;
      const p = item as any;
      const weight = toNum(p.weight ?? p.actual_weight ?? p.billable_weight);
      const length = toNum(p.length);
      const width = toNum(p.width);
      const height = toNum(p.height);
      const description = toText(p.description ?? p.contents ?? p.content_description);

      rows.push({ index: i + 1, weight, length, width, height, description, raw: item });
    }

    return rows;
  }

  private toText(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed ? trimmed : null;
    }
    const asString = String(value).trim();
    return asString ? asString : null;
  }

  private loadOrder(id: string): void {
    this.loading = true;
    this.loadError = null;
    this.order = null;
    this.ordersApi
      .ordersControllerGet(id)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (response) => {
          this.order = response.data;
          // Clear any transient refund UI messages after a successful refresh.
          this.refundUiMessage = null;
          this.refundUiError = null;
          this.refundStartedAt = null;
        },
        error: (error: unknown) => {
          this.loadError = this.getApiErrorMessage(
            error,
            'Failed to load order details.',
          );
          this.toast.error(this.loadError);
        },
      });
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
      if (Array.isArray(message) && message.length > 0)
        return String(message[0]);
    }

    if (
      typeof error === 'object' &&
      error !== null &&
      'message' in error &&
      typeof error.message === 'string'
    ) {
      return error.message;
    }

    return fallback;
  }
}
