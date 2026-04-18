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
import { StatusBadgeComponent } from '../../../components/status-badge/status-badge.component';
import { FulfillmentSettingsService } from '../../services/fulfillment-settings.service';

type RateRow = NetParcelRateDto & { service_code_number?: number | null };

type ReturnItemApprovalPatch = {
  return_request_item_id: number;
  approved_qty: number;
};

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

  approvedQty = signal<Record<number, number>>({});
  receivedQty = signal<Record<number, number>>({});

  canEditApprovals = computed(() => {
    const r = this.request();
    if (!r) return false;
    return r.status === 'requested' || r.status === 'in_review';
  });

  readonly reviewForm = this.fb.nonNullable.group({
    admin_note: [''],
    status: ['in_review'],
  });

  readonly refundForm = this.fb.nonNullable.group({
    refund_status: ['in_review'],
    refund_amount: [0, [Validators.min(0)]],
    refund_eta_note: [''],
    admin_note: [''],
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
      .adminReturnsControllerUpdateStatus(id, { status: 'in_review', admin_note: this.reviewForm.get('admin_note')!.value || undefined })
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

    this.saving = true;
    this.patchApprovedQuantitiesIfNeeded(id)
      .pipe(
        switchMap(() =>
          this.returnsApi.adminReturnsControllerUpdateStatus(id, {
            status: 'approved',
            admin_note: this.reviewForm.get('admin_note')!.value || undefined,
            return_label_service_code: Number.isFinite(serviceCodeNumber as number) ? (serviceCodeNumber as number) : undefined,
            return_label_service_name: selected?.service_name ?? undefined,
          }),
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

  receiveReturn(): void {
    const id = this.returnRequestId;
    const req = this.request();
    if (!id || !req) return;

    const items = req.items.map((i) => ({
      return_request_item_id: i.return_request_item_id,
      received_qty: this.receivedQty()[i.return_request_item_id] ?? i.received_qty ?? 0,
    }));

    this.saving = true;
    this.returnsApi
      .adminReturnsControllerReceive(id, { items })
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

  updateRefund(): void {
    const id = this.returnRequestId;
    if (!id) return;
    const value = this.refundForm.getRawValue();

    this.saving = true;
    this.returnsApi
      .adminReturnsControllerUpdateRefund(id, {
        refund_status: value.refund_status || undefined,
        refund_amount: Number.isFinite(value.refund_amount) ? value.refund_amount : undefined,
        refund_eta_note: value.refund_eta_note || undefined,
        admin_note: value.admin_note || undefined,
      })
      .pipe(finalize(() => (this.saving = false)))
      .subscribe({
        next: () => {
          this.toast.success('Refund updated.');
          this.changed.emit();
          if (this.returnRequestId) this.load(this.returnRequestId);
        },
        error: (error: unknown) => this.toast.error(this.getApiErrorMessage(error, 'Failed to update refund.')),
      });
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

    const order$ = this.orderId
      ? this.ordersApi.ordersControllerGet(this.orderId).pipe(map((r) => r.data ?? null))
      : of(null);
    const return$ = this.returnsApi.adminReturnsControllerGetRequest(returnRequestId).pipe(map((r) => r.data));

    forkJoin([order$, return$])
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: ([order, req]) => {
          this.order.set(order);
          this.request.set(req);
          this.reviewForm.patchValue(
            {
              status: req.status === 'requested' ? 'in_review' : req.status,
              admin_note: this.text(req.admin_note),
            },
            { emitEvent: false },
          );
          this.refundForm.patchValue(
            {
              refund_status: req.refund_status || 'in_review',
              refund_amount: req.refund_amount ?? 0,
              refund_eta_note: this.text(req.refund_eta_note),
              admin_note: this.text(req.admin_note),
            },
            { emitEvent: false },
          );

          const approvals: Record<number, number> = {};
          const receives: Record<number, number> = {};
          for (const item of req.items ?? []) {
            approvals[item.return_request_item_id] = item.approved_qty ?? item.requested_qty ?? 0;
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
