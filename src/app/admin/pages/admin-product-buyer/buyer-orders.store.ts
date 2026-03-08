import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { BuyerOrder } from './buyer-orders.model';

const STORAGE_KEY = 'buyer_orders_v1';

function uid(prefix: string) {
  return (
    prefix +
    '_' +
    Math.random().toString(16).slice(2) +
    '_' +
    Date.now().toString(16)
  );
}
function nowIso(daysAgo = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
}

@Injectable({ providedIn: 'root' })
export class BuyerOrdersStore {
  private readonly _orders$ = new BehaviorSubject<BuyerOrder[]>(this.load());
  readonly orders$ = this._orders$.asObservable();

  get snapshot() {
    return this._orders$.value;
  }

  seedIfEmpty() {
    if (this.snapshot.length) return;

    const seed: BuyerOrder[] = [
      {
        order_id: uid('ord'),
        order_date: nowIso(2),
        buyer: {
          buyer_id: uid('cus'),
          type: 'customer',
          name: 'Sarah Mitchell',
          email: 'sarah@example.com',
          phone: '+1 780-555-1111',
          address_line1: '123 Jasper Ave',
          city: 'Edmonton',
          province: 'AB',
          postal_code: 'T5J 1N9',
          country: 'Canada',
        },
        items: [
          {
            product_id: 'p_001',
            product_title: 'Impact Socket Set',
            sku: 'SKU-001',
            qty: 1,
          },
          {
            product_id: 'p_010',
            product_title: 'Torque Wrench',
            sku: 'SKU-010',
            qty: 1,
          },
        ],
      },
      {
        order_id: uid('ord'),
        order_date: nowIso(6),
        buyer: {
          buyer_id: uid('cus'),
          type: 'customer',
          name: 'Amanpreet Singh',
          email: 'aman@example.com',
          phone: '+1 587-555-2222',
          address_line1: '55 Whyte Ave',
          city: 'Edmonton',
          province: 'AB',
          postal_code: 'T6E 2A2',
          country: 'Canada',
        },
        items: [
          {
            product_id: 'p_002',
            product_title: 'Cordless Drill Kit',
            sku: 'SKU-002',
            qty: 1,
          },
        ],
      },
      {
        order_id: uid('ord'),
        order_date: nowIso(1),
        buyer: {
          buyer_id: uid('dea'),
          type: 'dealer',
          name: 'Rocky Auto Supply (Dealer)',
          email: 'orders@rockyautosupply.ca',
          phone: '+1 403-555-3333',
          address_line1: '900 Industrial Rd',
          city: 'Calgary',
          province: 'AB',
          postal_code: 'T2G 0B5',
          country: 'Canada',
        },
        items: [
          {
            product_id: 'p_001',
            product_title: 'Impact Socket Set',
            sku: 'SKU-001',
            qty: 10,
          },
          {
            product_id: 'p_020',
            product_title: 'Air Compressor Hose',
            sku: 'SKU-020',
            qty: 25,
          },
          {
            product_id: 'p_030',
            product_title: 'Oil Filter Wrench',
            sku: 'SKU-030',
            qty: 15,
          },
        ],
      },
    ];

    this.set(seed);
  }

  private set(orders: BuyerOrder[]) {
    this._orders$.next(orders);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
  }

  private load(): BuyerOrder[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
}
