import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, computed, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { AdminNetparcelService } from '../../../../core/api/generated/admin-netparcel/admin-netparcel.service';
import { AdminOrdersService } from '../../../../core/api/generated/admin-orders/admin-orders.service';
import type {
  AdminOrderDetailDto,
  NetParcelFetchRatesResponseDto,
  NetParcelRateDto,
} from '../../../../core/api/generated/schemas';
import { ToastService } from '../../../../core/notification/toast.service';
import { DrawerComponent } from '../../../components/drawer/drawer.component';
import { StatusBadgeComponent } from '../../../components/status-badge/status-badge.component';
import { FulfillmentSettingsService } from '../../services/fulfillment-settings.service';
import { canGenerateShipmentLabel, fulfillmentBadge, paymentBadge } from '../../utils/order-status.util';

type RateRow = NetParcelRateDto & { service_code_number?: number | null };
type CheckoutShippingSnapshot = {
  service_code?: string | number | null;
  service_name?: string | null;
  total_price?: string | number | null;
  currency?: string | null;
};

type PackedPackage = {
  weight: number;
  length?: number;
  width?: number;
  height?: number;
  description?: string | null;
};

@Component({
  selector: 'app-shipping-approval-drawer',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DrawerComponent, StatusBadgeComponent],
  templateUrl: './shipping-approval-drawer.component.html',
})
export class ShippingApprovalDrawerComponent implements OnChanges {
  private readonly fb = inject(FormBuilder);
  private readonly ordersApi = inject(AdminOrdersService);
  private readonly netparcelApi = inject(AdminNetparcelService);
  private readonly toast = inject(ToastService);
  private readonly settings = inject(FulfillmentSettingsService);

  @Input() open = false;
  @Input() orderId: string | null = null;
  @Output() closed = new EventEmitter<void>();
  @Output() changed = new EventEmitter<void>();

  loadingOrder = false;
  loadingRates = false;
  shipping = false;

  order = signal<AdminOrderDetailDto | null>(null);
  rates = signal<RateRow[]>([]);
  selectedRateCode = signal<string | null>(null);
  checkoutShipping = signal<CheckoutShippingSnapshot | null>(null);
  customerSelectedServiceCode = signal<string | null>(null);

  canShip = computed(() => {
    const o = this.order();
    return o ? canGenerateShipmentLabel(o) : false;
  });

  readonly originForm = this.fb.nonNullable.group({
    country: ['', [Validators.required]],
    postal_code: ['', [Validators.required]],
    province: [''],
    city: [''],
    address1: [''],
    address2: [''],
    company_name: [''],
    name: [''],
    phone: [''],
    email: [''],
  });

  readonly packageForm = this.fb.nonNullable.group({
    ship_date: [this.todayIsoDate()],
    packages: this.fb.array([this.createPackageGroup()]),
  });

  readonly badges = computed(() => {
    const o = this.order();
    if (!o) return null;
    return {
      payment: paymentBadge(o.payment_status),
      fulfillment: fulfillmentBadge(o.fulfillment_status),
    };
  });

  constructor() {
    const existing = this.settings.origin();
    if (existing) {
      this.originForm.patchValue(existing as any, { emitEvent: false });
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    const becameOpen = changes['open'] && this.open;
    const idChanged = changes['orderId'] && this.open;
    if (!becameOpen && !idChanged) return;
    if (!this.orderId) return;
    this.loadOrder(this.orderId);
  }

  close(): void {
    this.closed.emit();
  }

  get packagesArray(): FormArray {
    return this.packageForm.get('packages') as FormArray;
  }

  addPackage(prefill?: Partial<PackedPackage>): void {
    const group = this.createPackageGroup(prefill);
    this.packagesArray.push(group);
  }

  removePackage(index: number): void {
    if (this.packagesArray.length <= 1) return;
    this.packagesArray.removeAt(index);
  }

  saveOrigin(): void {
    const value = this.originForm.getRawValue();
    this.settings.setOrigin(value as any);
    this.toast.success('Warehouse origin saved for rate lookup.');
  }

  clearOrigin(): void {
    this.settings.clearOrigin();
    this.originForm.reset({
      country: '',
      postal_code: '',
      province: '',
      city: '',
      address1: '',
      address2: '',
      company_name: '',
      name: '',
      phone: '',
      email: '',
    });
  }

  fetchRates(): void {
    const o = this.order();
    if (!o) return;
    const origin = this.originForm.getRawValue();
    if (!origin.country?.trim() || !origin.postal_code?.trim()) {
      this.toast.error('Set the warehouse origin (country + postal code) to fetch rates.');
      return;
    }

    const destCountry = this.text(o.country);
    const destPostal = this.text(o.postalcode);
    if (!destCountry || !destPostal) {
      this.toast.error('Order destination address is missing country/postal code.');
      return;
    }

    const packagesPayload = this.buildPackagesPayload();
    if (packagesPayload.length === 0) return;

    const request = {
      rate: {
        origin: {
          country: origin.country.trim(),
          postal_code: origin.postal_code.trim(),
          province: origin.province?.trim() || undefined,
          city: origin.city?.trim() || undefined,
          address1: origin.address1?.trim() || undefined,
          address2: origin.address2?.trim() || undefined,
          company_name: origin.company_name?.trim() || undefined,
          name: origin.name?.trim() || undefined,
          phone: origin.phone?.trim() || undefined,
          email: origin.email?.trim() || undefined,
        },
        destination: {
          country: destCountry,
          postal_code: destPostal,
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
        packaging_information: {
          packages: packagesPayload,
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
          if (!this.selectedRateCode()) {
            const customerCode = this.customerSelectedServiceCode();
            if (customerCode) {
              const match = mapped.find((r) => this.normalizeServiceCode(r.service_code) === customerCode);
              if (match) this.selectedRateCode.set(match.service_code);
            }
          }
          if (mapped.length === 0) this.toast.error('No rates returned for the selected package.');
        },
        error: (error: unknown) => {
          this.toast.error(this.getApiErrorMessage(error, 'Failed to fetch netParcel rates.'));
        },
      });
  }

  generateLabel(): void {
    const o = this.order();
    const orderId = this.orderId;
    if (!o || !orderId) return;
    if (!this.canShip()) {
      this.toast.error('This order is not in a shippable state.');
      return;
    }
    const code = this.selectedRateCode();
    if (!code) {
      this.toast.error('Select a carrier service to generate a label.');
      return;
    }
    const rate = this.rates().find((r) => r.service_code === code) ?? null;
    const serviceCodeNumber = rate?.service_code_number ?? Number(code);
    if (!Number.isFinite(serviceCodeNumber)) {
      this.toast.error('Selected service code is not a number. Ask backend to accept string service_code.');
      return;
    }

    const pkg = this.packageForm.getRawValue();
    const packagesPayload = this.buildPackagesPayload();
    if (packagesPayload.length === 0) return;
    this.shipping = true;
    this.ordersApi
      .ordersControllerShip(orderId, {
        service_code: serviceCodeNumber,
        service_name: rate?.service_name ?? undefined,
        ship_date: pkg.ship_date || undefined,
        generate_label: true,
        packages: packagesPayload,
      } as any)
      .pipe(finalize(() => (this.shipping = false)))
      .subscribe({
        next: () => {
          this.toast.success('Shipment created. Refreshing order…');
          this.loadOrder(orderId, true);
          this.changed.emit();
        },
        error: (error: unknown) => {
          this.toast.error(this.getApiErrorMessage(error, 'Failed to generate shipment label.'));
        },
      });
  }

  paymentStatusLabel(status: string): string {
    return paymentBadge(status).label;
  }

  fulfillmentStatusLabel(status: string): string {
    return fulfillmentBadge(status).label;
  }

  private loadOrder(orderId: string, keepRates = false): void {
    this.loadingOrder = true;
    this.order.set(null);
    this.checkoutShipping.set(null);
    if (!keepRates) {
      this.rates.set([]);
      this.selectedRateCode.set(null);
    }

    this.ordersApi
      .ordersControllerGet(orderId)
      .pipe(finalize(() => (this.loadingOrder = false)))
      .subscribe({
	        next: (response) => {
	          const order = response.data ?? null;
	          this.order.set(order);
	
          if (order) {
            const snap = this.extractCheckoutShipping(order);
            this.checkoutShipping.set(snap);
            this.customerSelectedServiceCode.set(this.normalizeServiceCode(snap?.service_code ?? null));

            // Prefill from API-provided origin if present.
            const originFromApi = this.extractWarehouseOrigin(order);
            if (originFromApi) {
              this.originForm.patchValue(originFromApi as any, { emitEvent: false });
            }

            // Prefill package(s) from shipments.packages, otherwise from shipping_estimated_packages.
            const fromShipment = this.extractShipmentPackages(order);
            if (fromShipment.length > 0) {
              this.setPackagesForm(fromShipment);
            } else {
              const estimated = this.extractEstimatedPackages(order);
              if (estimated.length > 0) {
                this.setPackagesForm(estimated);
              }
            }
          }
        },
        error: (error: unknown) => {
          this.toast.error(this.getApiErrorMessage(error, 'Failed to load order for shipping.'));
        },
      });
  }

  private todayIsoDate(): string {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  private text(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value.trim();
    return String(value).trim();
  }

  private extractCheckoutShipping(order: AdminOrderDetailDto): CheckoutShippingSnapshot | null {
    const o = order as any;

    // Preferred: explicit snapshot object returned by backend.
    const fromSnapshot =
      o?.checkout_shipping_snapshot ??
      o?.checkout_shipping ??
      o?.shipping_snapshot ??
      o?.shipping_quote_snapshot ??
      null;
    if (fromSnapshot && typeof fromSnapshot === 'object') {
      const sc = (fromSnapshot as any)?.service_code ?? (fromSnapshot as any)?.serviceCode;
      const sn = (fromSnapshot as any)?.service_name ?? (fromSnapshot as any)?.serviceName;
      const tp = (fromSnapshot as any)?.total_price ?? (fromSnapshot as any)?.totalPrice ?? (fromSnapshot as any)?.price;
      const cur = (fromSnapshot as any)?.currency;
      return { service_code: sc ?? null, service_name: sn ?? null, total_price: tp ?? null, currency: cur ?? null };
    }

    // Fallback: simple scalar fields.
    const service_code =
      o?.shipping_selected_service_code ??
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
    if (service_code || service_name) return { service_code, service_name, total_price: null, currency: null };
    return null;
  }

  private extractWarehouseOrigin(order: AdminOrderDetailDto): Record<string, string> | null {
    // If your order detail already includes warehouse origin, wire it here without needing localStorage.
    const o = order as any;
    const candidate =
      o?.warehouse_origin ??
      o?.warehouse_address ??
      o?.fulfillment_origin ??
      o?.origin_address ??
      (Array.isArray(order.shipments) && order.shipments.length > 0 ? (order.shipments[0] as any)?.origin : null);

    if (!candidate || typeof candidate !== 'object') return null;
    const c = candidate as any;
    const country = this.text(c.country ?? c.country_code);
    const postal_code = this.text(c.postal_code ?? c.postalcode ?? c.postalCode);
    if (!country || !postal_code) return null;

    const out: Record<string, string> = { country, postal_code };
    const optional = ['province', 'city', 'address1', 'address2', 'company_name', 'name', 'phone', 'email'] as const;
    for (const key of optional) {
      const v = this.text(c[key] ?? c[key.replace('_', '')]);
      if (v) out[key] = v;
    }
    return out;
  }

  private extractShipmentPackages(order: AdminOrderDetailDto): PackedPackage[] {
    const shipments = Array.isArray(order.shipments) ? order.shipments : [];
    const latest = shipments[0] as any;
    const rawPackages = latest?.packages;
    if (!rawPackages) return [];
    const list: unknown[] = Array.isArray(rawPackages) ? rawPackages : [];
    return this.normalizePackages(list);
  }

  private extractEstimatedPackages(order: AdminOrderDetailDto): PackedPackage[] {
    const o = order as any;
    const raw =
      o?.shipping_estimated_packages ??
      o?.estimated_packages ??
      o?.shipping_packages_estimated ??
      o?.package_estimates ??
      null;
    if (!Array.isArray(raw) || raw.length === 0) return [];
    return this.normalizePackages(raw);
  }

  isCustomerSelectedRate(rateServiceCode: unknown): boolean {
    const selected = this.customerSelectedServiceCode();
    if (!selected) return false;
    return this.normalizeServiceCode(rateServiceCode) === selected;
  }

  private normalizeServiceCode(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    const s = String(value).trim();
    if (!s) return null;
    // If it's numeric-like, normalize to digits (rates often come as strings).
    const asNum = Number(s);
    if (Number.isFinite(asNum)) return String(asNum);
    return s;
  }

  private normalizePackages(raw: unknown[]): PackedPackage[] {
    const num = (v: unknown): number | undefined => {
      const n = typeof v === 'number' ? v : Number(String(v ?? '').trim());
      return Number.isFinite(n) && n > 0 ? n : undefined;
    };

    const out: PackedPackage[] = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const p = item as any;
      const weight = num(p.weight ?? p.actual_weight ?? p.billable_weight);
      if (!weight) continue;
      out.push({
        weight,
        length: num(p.length),
        width: num(p.width),
        height: num(p.height),
        description: typeof p.description === 'string' ? p.description.trim() : null,
      });
    }
    return out;
  }

  private setPackagesForm(packages: PackedPackage[]): void {
    const array = this.fb.array(packages.map((p) => this.createPackageGroup(p)));
    this.packageForm.setControl('packages', array);
  }

  private createPackageGroup(prefill?: Partial<PackedPackage>) {
    return this.fb.nonNullable.group({
      weight: [prefill?.weight ?? 1, [Validators.required, Validators.min(0.01)]],
      length: [prefill?.length ?? 0],
      width: [prefill?.width ?? 0],
      height: [prefill?.height ?? 0],
    });
  }

  private buildPackagesPayload(): Array<Record<string, unknown>> {
    const packages = this.packagesArray.controls.map((ctrl) => (ctrl as any).getRawValue?.() ?? ctrl.value) as Array<{
      weight: number;
      length: number;
      width: number;
      height: number;
    }>;

    const out: Array<Record<string, unknown>> = [];
    for (const p of packages) {
      const weight = Number(p.weight);
      if (!Number.isFinite(weight) || weight <= 0) {
        this.toast.error('Each package must have a valid weight.');
        return [];
      }
      out.push({
        weight,
        length: Number(p.length) > 0 ? Number(p.length) : undefined,
        width: Number(p.width) > 0 ? Number(p.width) : undefined,
        height: Number(p.height) > 0 ? Number(p.height) : undefined,
      });
    }

    return out.length > 0 ? out : [];
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
}
