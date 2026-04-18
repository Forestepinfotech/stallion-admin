import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { catchError, finalize, forkJoin, map, of, switchMap } from 'rxjs';
import { AdminNetparcelService } from '../../../../core/api/generated/admin-netparcel/admin-netparcel.service';
import { AdminOrdersService } from '../../../../core/api/generated/admin-orders/admin-orders.service';
import { AdminReturnsService } from '../../../../core/api/generated/admin-returns/admin-returns.service';
import type {
  AdminOrderDetailDto,
  NetParcelFetchRatesResponseDto,
  NetParcelRateDto,
  ReturnRequestDetailDto,
} from '../../../../core/api/generated/schemas';
import { ToastService } from '../../../../core/notification/toast.service';
import { DrawerComponent } from '../../../components/drawer/drawer.component';
import { StatusBadgeComponent, type StatusBadgeVariant } from '../../../components/status-badge/status-badge.component';
import { FulfillmentSettingsService } from '../../services/fulfillment-settings.service';

type RateRow = NetParcelRateDto & { service_code_number?: number | null };

type ReturnItemApprovalPatch = {
  return_request_item_id: number;
  approved_qty: number;
};

type ReturnStatus = 'pending' | 'in_review' | 'approved' | 'rejected' | 'cancelled';
type RefundStatus = 'pending' | 'processing' | 'refunded' | 'failed';

@Component({
  selector: 'app-return-approval-drawer',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DrawerComponent, StatusBadgeComponent],
  templateUrl: './return-approval-drawer.component.html',
})
export class ReturnApprovalDrawerComponent implements OnChanges {
  private readonly fb = inject(FormBuilder);
  private readonly ordersApi = inject(AdminOrdersService);
  private readonly returnsApi = inject(AdminReturnsService);
  private readonly netparcelApi = inject(AdminNetparcelService);
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly settings = inject(FulfillmentSettingsService);

  @Input() open = false;
  @Input() orderId: string | null = null;
  @Input() returnRequestId: string | null = null;

  @Output() closed = new EventEmitter<void>();
  @Output() changed = new EventEmitter<void>();

  loading = false;
  saving = false;
  loadingRates = false;

  order = signal<AdminOrderDetailDto | null>(null);
  request = signal<ReturnRequestDetailDto | null>(null);
  rates = signal<RateRow[]>([]);
  selectedRateCode = signal<string | null>(null);
  approveIdempotencyKey = signal<string>('');
  labelPanelOpen = signal(false);
  receivePanelOpen = signal(false);
  refundPanelOpen = signal(false);

  approvedQty = signal<Record<number, number>>({});
  receivedQty = signal<Record<number, number>>({});

  canEditApprovals = computed(() => {
    const r = this.request();
    if (!r) return false;
    return r.status === 'pending' || r.status === 'in_review';
  });

  canApprove = computed(() => {
    const r = this.request();
    if (!r) return false;
    return r.status === 'pending' || r.status === 'in_review';
  });

  canReject = computed(() => {
    const r = this.request();
    if (!r) return false;
    return r.status !== 'rejected' && r.status !== 'approved' && r.status !== 'cancelled';
  });

  canCancel = computed(() => {
    const r = this.request();
    if (!r) return false;
    return r.status !== 'cancelled' && r.status !== 'approved' && r.status !== 'rejected';
  });

  canReceive = computed(() => {
    const r = this.request();
    if (!r) return false;
    return r.status === 'approved';
  });

  canStripeRefund = computed(() => {
    const r = this.request();
    if (!r) return false;
    const refund = this.text(r.refund_status).toLowerCase() as RefundStatus;
    // Allow refund after approval; block when already refunded or processing.
    if (r.status !== 'approved') return false;
    return refund !== 'refunded' && refund !== 'processing';
  });

  readonly reviewForm = this.fb.nonNullable.group({
    admin_note: [''],
    status: ['in_review' as ReturnStatus],
  });

  readonly receiveForm = this.fb.nonNullable.group({
    note: [''],
  });

  readonly stripeRefundForm = this.fb.group({
    refund_amount: [null as number | null],
    reason: [''],
  });

  readonly returnPackageForm = this.fb.nonNullable.group({
    weight: [1, [Validators.required, Validators.min(0.01)]],
    length: [0],
    width: [0],
    height: [0],
  });

  ngOnChanges(changes: SimpleChanges): void {
    const becameOpen = changes['open'] && this.open;
    const idChanged = changes['returnRequestId'] && this.open;
    if (!becameOpen && !idChanged) return;
    const returnRequestId = this.returnRequestId;
    if (!returnRequestId) return;
    this.load(returnRequestId);
  }

  close(): void {
    this.closed.emit();
  }

  saveOriginFromShippingDrawerHint(): void {
    this.toast.error('Set your warehouse origin in the Shipping drawer (used for return label rates too).');
  }

  setApprovedQty(itemId: number, qty: number): void {
    const req = this.request();
    if (!req) return;
    const item = req.items.find((i) => i.return_request_item_id === itemId);
    const max = item?.requested_qty ?? qty;
    const normalized = Math.max(0, Math.min(max, Math.floor(Number(qty) || 0)));
    this.approvedQty.update((prev) => ({ ...prev, [itemId]: normalized }));
  }

  setReceivedQty(itemId: number, qty: number): void {
    const req = this.request();
    if (!req) return;
    const item = req.items.find((i) => i.return_request_item_id === itemId);
    const max = item?.approved_qty ?? item?.requested_qty ?? qty;
    const normalized = Math.max(0, Math.min(max, Math.floor(Number(qty) || 0)));
    this.receivedQty.update((prev) => ({ ...prev, [itemId]: normalized }));
  }

  fetchReturnLabelRates(): void {
    const o = this.order();
    const req = this.request();
    if (!o || !req) {
      this.toast.error('Order + return request are required to fetch return label rates.');
      return;
    }

    const origin = this.settings.origin();
    if (!origin) {
      this.toast.error('Set the warehouse origin first (used as the return destination).');
      return;
    }

    const customerCountry = this.text(o.country);
    const customerPostal = this.text(o.postalcode);
    if (!customerCountry || !customerPostal) {
      this.toast.error('Order address is missing country/postal code.');
      return;
    }

    const pkg = this.returnPackageForm.getRawValue();
    if (!Number.isFinite(pkg.weight) || pkg.weight <= 0) {
      this.toast.error('Enter a valid return package weight.');
      return;
    }

    const request = {
      rate: {
        origin: {
          country: customerCountry,
          postal_code: customerPostal,
          province: this.text(o.province) || undefined,
          city: this.text(o.city) || undefined,
          address1: this.text(o.line1) || undefined,
          address2: this.text(o.line2) || undefined,
          name:
            [this.text(o.address_first_name), this.text(o.address_last_name)].filter(Boolean).join(' ').trim() ||
            undefined,
          phone: this.text(o.address_phone) || this.text(o.customer_phone) || undefined,
          email: this.text(o.address_email) || this.text(o.customer_email) || undefined,
        },
        destination: {
          country: origin.country,
          postal_code: origin.postal_code,
          province: origin.province,
          city: origin.city,
          address1: origin.address1,
          address2: origin.address2,
          company_name: origin.company_name,
          name: origin.name,
          phone: origin.phone,
          email: origin.email,
        },
        packaging_information: {
          packages: [
            {
              weight: pkg.weight,
              length: pkg.length > 0 ? pkg.length : undefined,
              width: pkg.width > 0 ? pkg.width : undefined,
              height: pkg.height > 0 ? pkg.height : undefined,
            },
          ],
        },
      },
    };

    this.loadingRates = true;
    this.rates.set([]);
    this.selectedRateCode.set(null);
    this.netparcelApi
      .adminNetParcelControllerRates(request as any)
      .pipe(finalize(() => (this.loadingRates = false)))
      .subscribe({
        next: (response: NetParcelFetchRatesResponseDto) => {
          const mapped = (Array.isArray(response?.rates) ? response.rates : []).map((r) => {
            const num = Number(r.service_code);
            return { ...r, service_code_number: Number.isFinite(num) ? num : null };
          });
          this.rates.set(mapped);
          if (mapped.length === 0) this.toast.error('No return-label rates returned.');
        },
        error: (error: unknown) => {
          this.toast.error(this.getApiErrorMessage(error, 'Failed to fetch rates for return label.'));
        },
      });
  }

  moveToReview(): void {
    const id = this.returnRequestId;
    if (!id) return;
    if (!this.request()) return;
    this.saving = true;
    this.returnsApi
      .adminReturnsControllerUpdateStatus(id, {
        status: 'in_review',
        admin_note: this.reviewForm.get('admin_note')!.value || undefined,
      })
      .pipe(finalize(() => (this.saving = false)))
      .subscribe({
        next: () => {
          this.toast.success('Return moved to review.');
          this.changed.emit();
          if (this.returnRequestId) this.load(this.returnRequestId);
        },
        error: (error: unknown) => this.toast.error(this.getApiErrorMessage(error, 'Failed to update return status.')),
      });
  }

  approveReturn(): void {
    const id = this.returnRequestId;
    const req = this.request();
    if (!id || !req) return;

    const code = this.selectedRateCode();
    const selected = code ? this.rates().find((r) => r.service_code === code) : null;
    const serviceCodeNumber = selected?.service_code_number ?? (code ? Number(code) : null);
    const idempotencyKey = this.approveIdempotencyKey() || (globalThis.crypto?.randomUUID?.() ?? '');

    this.saving = true;
    this.patchApprovedQuantitiesIfNeeded(id)
      .pipe(
        switchMap(() =>
          this.returnsApi.adminReturnsControllerUpdateStatus(
            id,
            {
              status: 'approved',
              admin_note: this.reviewForm.get('admin_note')!.value || undefined,
              return_label_service_code: Number.isFinite(serviceCodeNumber as number)
                ? (serviceCodeNumber as number)
                : undefined,
              return_label_service_name: selected?.service_name ?? undefined,
            },
            idempotencyKey
              ? { headers: { 'idempotency-key': idempotencyKey } }
              : undefined,
          ),
        ),
        finalize(() => (this.saving = false)),
      )
      .subscribe({
        next: () => {
          this.toast.success('Return approved.');
          this.changed.emit();
          if (this.returnRequestId) this.load(this.returnRequestId);
        },
        error: (error: unknown) => this.toast.error(this.getApiErrorMessage(error, 'Failed to approve return.')),
      });
  }

  rejectReturn(): void {
    const id = this.returnRequestId;
    if (!id) return;
    const note = (this.reviewForm.get('admin_note')!.value || '').trim();
    if (!note) {
      this.toast.error('Add an admin note explaining the rejection.');
      return;
    }

    this.saving = true;
    this.returnsApi
      .adminReturnsControllerUpdateStatus(id, { status: 'rejected', admin_note: note })
      .pipe(finalize(() => (this.saving = false)))
      .subscribe({
        next: () => {
          this.toast.success('Return rejected.');
          this.changed.emit();
          if (this.returnRequestId) this.load(this.returnRequestId);
        },
        error: (error: unknown) => this.toast.error(this.getApiErrorMessage(error, 'Failed to reject return.')),
      });
  }

  cancelReturn(): void {
    const id = this.returnRequestId;
    if (!id) return;
    const note = (this.reviewForm.get('admin_note')!.value || '').trim();
    if (!note) {
      this.toast.error('Add an admin note explaining the cancellation.');
      return;
    }

    if (!confirm('Cancel this return request?')) return;

    this.saving = true;
    this.returnsApi
      .adminReturnsControllerUpdateStatus(id, { status: 'cancelled', admin_note: note })
      .pipe(finalize(() => (this.saving = false)))
      .subscribe({
        next: () => {
          this.toast.success('Return cancelled.');
          this.changed.emit();
          if (this.returnRequestId) this.load(this.returnRequestId);
        },
        error: (error: unknown) => this.toast.error(this.getApiErrorMessage(error, 'Failed to cancel return.')),
      });
  }

  receiveReturn(): void {
    const id = this.returnRequestId;
    const req = this.request();
    if (!id || !req) return;

    const note = (this.receiveForm.get('note')!.value || '').trim() || undefined;

    this.saving = true;
    this.returnsApi
      // Omitting `items` receives full approved qty for all items (server-side).
      .adminReturnsControllerReceive(id, { note })
      .pipe(finalize(() => (this.saving = false)))
      .subscribe({
        next: () => {
          this.toast.success('Return received updated.');
          this.changed.emit();
          if (this.returnRequestId) this.load(this.returnRequestId);
        },
        error: (error: unknown) => this.toast.error(this.getApiErrorMessage(error, 'Failed to receive return.')),
      });
  }

  refundViaStripe(): void {
    const req = this.request();
    if (!req) return;

    const id = String(req.return_request_id);
    const value = this.stripeRefundForm.getRawValue();
    const amount =
      Number.isFinite(Number(value.refund_amount)) && Number(value.refund_amount) > 0
        ? Number(value.refund_amount)
        : undefined;
    const reason = (value.reason || '').trim() || undefined;

    const confirmMsg = amount
      ? `Refund via Stripe for return #${id} for ${amount}?`
      : `Refund via Stripe for return #${id} (default amount)?`;
    if (!confirm(confirmMsg)) return;

    this.saving = true;
    this.http
      .post(`/admin/returns/requests/${id}/refund/stripe`, {
        refund_amount: amount,
        reason,
      })
      .pipe(finalize(() => (this.saving = false)))
      .subscribe({
        next: () => {
          this.toast.success('Stripe refund created.');
          this.changed.emit();
          if (this.returnRequestId) this.load(this.returnRequestId);
        },
        error: (error: unknown) => {
          this.toast.error(this.getApiErrorMessage(error, 'Failed to refund via Stripe.'));
        },
      });
  }

  returnStatusBadge(status: unknown): { label: string; variant: StatusBadgeVariant } {
    const s = this.text(status).toLowerCase();
    switch (s) {
      case 'approved':
        return { label: 'Approved', variant: 'success' };
      case 'rejected':
        return { label: 'Rejected', variant: 'danger' };
      case 'cancelled':
        return { label: 'Cancelled', variant: 'neutral' };
      case 'in_review':
        return { label: 'In Review', variant: 'info' };
      case 'pending':
      default:
        return { label: 'Pending', variant: 'warning' };
    }
  }

  refundStatusBadge(status: unknown): { label: string; variant: StatusBadgeVariant } {
    const s = this.text(status).toLowerCase();
    switch (s) {
      case 'refunded':
        return { label: 'Refunded', variant: 'success' };
      case 'failed':
        return { label: 'Failed', variant: 'danger' };
      case 'processing':
        return { label: 'Processing', variant: 'info' };
      case 'pending':
      default:
        return { label: 'Pending', variant: 'warning' };
    }
  }

  labelUrlFromReturnLabel(label: unknown): string | null {
    if (!label || typeof label !== 'object') return null;
    const l = label as any;
    const candidates = [l.label_url, l.url, l.href, l.document_url, l.pdf_url];
    for (const c of candidates) {
      if (typeof c === 'string' && c.trim()) return c.trim();
    }
    return null;
  }

  private patchApprovedQuantitiesIfNeeded(returnRequestId: string) {
    const req = this.request();
    if (!req) return of(null);
    const patches: ReturnItemApprovalPatch[] = [];
    for (const item of req.items) {
      const desired = this.approvedQty()[item.return_request_item_id];
      const current = item.approved_qty ?? item.requested_qty ?? 0;
      const normalized = Math.max(0, Math.min(item.requested_qty ?? desired ?? 0, Math.floor(Number(desired ?? current) || 0)));
      if (normalized !== current) {
        patches.push({ return_request_item_id: item.return_request_item_id, approved_qty: normalized });
      }
    }

    if (patches.length === 0) return of(null);

    // Proposed backend endpoint: PATCH /admin/returns/requests/:id/items
    return this.http.patch(`/admin/returns/requests/${returnRequestId}/items`, { items: patches }).pipe(
      map(() => null),
      catchError(() => {
        this.toast.error('Partial approvals require a backend endpoint (see notes). Proceeding without item overrides.');
        return of(null);
      }),
    );
  }

  private load(returnRequestId: string): void {
    this.loading = true;
    this.rates.set([]);
    this.selectedRateCode.set(null);
    this.approveIdempotencyKey.set(globalThis.crypto?.randomUUID?.() ?? '');
    this.labelPanelOpen.set(false);
    this.receivePanelOpen.set(false);
    this.refundPanelOpen.set(false);

    this.returnsApi
      .adminReturnsControllerGetRequest(returnRequestId)
      .pipe(
        map((r) => r.data),
        switchMap((req) => {
          const inferredOrderId =
            this.orderId ||
            (req.items && req.items.length > 0 ? String((req.items[0] as any)?.order_id ?? '') : '') ||
            null;

          const order$ = inferredOrderId
            ? this.ordersApi.ordersControllerGet(inferredOrderId).pipe(
                map((r) => r.data ?? null),
                catchError(() => of(null)),
              )
            : of(null);

          return forkJoin({ req: of(req), order: order$ });
        }),
        finalize(() => (this.loading = false)),
      )
      .subscribe({
        next: ({ req, order }) => {
          this.order.set(order);
          this.request.set(req);
          this.reviewForm.patchValue(
            {
              status: (req.status === 'pending' ? 'in_review' : req.status) as ReturnStatus,
              admin_note: this.text(req.admin_note),
            },
            { emitEvent: false },
          );
          this.receiveForm.patchValue({ note: '' }, { emitEvent: false });
          this.stripeRefundForm.patchValue({ refund_amount: null, reason: '' }, { emitEvent: false });

          // Prefill return-label package from the original outbound shipment when possible.
          // Only do this when the admin hasn't started editing the package form.
          this.prefillReturnLabelPackage(order);

          const approvals: Record<number, number> = {};
          const receives: Record<number, number> = {};
          for (const item of req.items ?? []) {
            approvals[item.return_request_item_id] =
              item.approved_qty ?? item.requested_qty ?? 0;
            receives[item.return_request_item_id] = item.received_qty ?? 0;
          }
          this.approvedQty.set(approvals);
          this.receivedQty.set(receives);
        },
        error: (error: unknown) => {
          this.toast.error(this.getApiErrorMessage(error, 'Failed to load return request.'));
        },
      });
  }

  private prefillReturnLabelPackage(order: AdminOrderDetailDto | null): void {
    if (!order) return;
    if (this.returnPackageForm.dirty) return;

    const o = order as any;

    // Prefer `original_shipments` (if backend provides it), otherwise fall back to `shipments`.
    const shipments =
      (Array.isArray(o?.original_shipments) ? o.original_shipments : null) ??
      (Array.isArray(o?.shipments) ? o.shipments : null) ??
      [];

    const firstShipment = shipments?.[0] as any;
    const rawPackages =
      firstShipment?.packages ??
      // Fallbacks sometimes used by other parts of the app/backends.
      o?.shipping_estimated_packages ??
      o?.estimated_packages ??
      o?.shipping_packages_estimated ??
      o?.package_estimates ??
      null;

    const pkg = this.packageFromRaw(rawPackages);
    if (!pkg) return;

    this.returnPackageForm.patchValue(pkg, { emitEvent: false });
    this.returnPackageForm.markAsPristine();
    this.returnPackageForm.markAsUntouched();
  }

  private packageFromRaw(raw: unknown): { weight: number; length: number; width: number; height: number } | null {
    const list: unknown[] = Array.isArray(raw) ? raw : [];
    if (list.length === 0) return null;

    const toNum = (v: unknown): number | null => {
      const n = typeof v === 'number' ? v : Number(String(v ?? '').trim());
      return Number.isFinite(n) ? n : null;
    };

    const read = (p: any) => ({
      weight: toNum(p?.weight ?? p?.actual_weight ?? p?.billable_weight),
      length: toNum(p?.length),
      width: toNum(p?.width),
      height: toNum(p?.height),
    });

    // If there are multiple packages, sum the weights and take max dimensions.
    // This gives a reasonable "single parcel" estimate for rate shopping.
    let weightSum = 0;
    let hasWeight = false;
    let lengthMax = 0;
    let widthMax = 0;
    let heightMax = 0;

    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const p = read(item);
      if (p.weight != null && p.weight > 0) {
        hasWeight = true;
        weightSum += p.weight;
      }
      if (p.length != null && p.length > lengthMax) lengthMax = p.length;
      if (p.width != null && p.width > widthMax) widthMax = p.width;
      if (p.height != null && p.height > heightMax) heightMax = p.height;
    }

    if (!hasWeight) return null;

    return {
      weight: Math.max(0.01, Number(weightSum.toFixed(2))),
      length: lengthMax > 0 ? lengthMax : 0,
      width: widthMax > 0 ? widthMax : 0,
      height: heightMax > 0 ? heightMax : 0,
    };
  }

  private getApiErrorMessage(error: unknown, fallback: string): string {
    if (
      typeof error === 'object' &&
      error !== null &&
      'error' in error &&
      typeof (error as any).error === 'object' &&
      (error as any).error !== null &&
      'message' in (error as any).error
    ) {
      const message = (error as any).error.message;
      if (typeof message === 'string') return message;
      if (Array.isArray(message) && message.length > 0) return String(message[0]);
    }
    if (typeof error === 'object' && error !== null && 'message' in error && typeof (error as any).message === 'string') {
      return (error as any).message;
    }
    return fallback;
  }

  private text(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value.trim();
    return String(value).trim();
  }
}
