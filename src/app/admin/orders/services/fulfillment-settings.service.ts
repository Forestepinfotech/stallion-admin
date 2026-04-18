import { Injectable, signal } from '@angular/core';

export type FulfillmentOriginAddress = Pick<
  {
    country: string;
    postal_code: string;
    province?: string;
    city?: string;
    address1?: string;
    address2?: string;
    company_name?: string;
    name?: string;
    phone?: string;
    email?: string;
  },
  'country' | 'postal_code' | 'province' | 'city' | 'address1' | 'address2' | 'company_name' | 'name' | 'phone' | 'email'
>;

const STORAGE_KEY = 'admin.fulfillment.origin.v1';

function safeParse(json: string | null): unknown {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function normalizeOrigin(value: unknown): FulfillmentOriginAddress | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const country = typeof v['country'] === 'string' ? v['country'].trim() : '';
  const postal_code = typeof v['postal_code'] === 'string' ? v['postal_code'].trim() : '';
  if (!country || !postal_code) return null;

  const pick = (key: string): string | undefined => {
    const raw = v[key];
    if (typeof raw !== 'string') return undefined;
    const trimmed = raw.trim();
    return trimmed ? trimmed : undefined;
  };

  return {
    country,
    postal_code,
    province: pick('province'),
    city: pick('city'),
    address1: pick('address1'),
    address2: pick('address2'),
    company_name: pick('company_name'),
    name: pick('name'),
    phone: pick('phone'),
    email: pick('email'),
  };
}

@Injectable({ providedIn: 'root' })
export class FulfillmentSettingsService {
  readonly origin = signal<FulfillmentOriginAddress | null>(normalizeOrigin(safeParse(localStorage.getItem(STORAGE_KEY))));

  setOrigin(origin: FulfillmentOriginAddress): void {
    const normalized = normalizeOrigin(origin);
    if (!normalized) return;
    this.origin.set(normalized);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  }

  clearOrigin(): void {
    this.origin.set(null);
    localStorage.removeItem(STORAGE_KEY);
  }
}
