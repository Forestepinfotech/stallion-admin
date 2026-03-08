import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';

type SalesMix = { tire: number; wheel: number; cover: number };
type Dealer = {
  id: string;
  name: string;
  city: string;
  status: 'Active' | 'Inactive';
};
type TopProduct = {
  name: string;
  sku: string;
  type: 'Tire' | 'Wheel' | 'Cover';
  sold: number;
  revenue: number;
};

@Component({
  selector: 'app-admin-dashboard',
  imports: [CommonModule],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.css',
})
export class AdminDashboardComponent {
  // ====== MOCK DATA (replace with backend) ======
  revenueTotal = 142_800; // $
  soldProductsTotal = 1_284;
  totalProducts = 342;

  dealers: Dealer[] = [
    { id: 'd1', name: 'Prime Auto Parts', city: 'Edmonton', status: 'Active' },
    { id: 'd2', name: 'Wheel Hub', city: 'Calgary', status: 'Active' },
    { id: 'd3', name: 'Tire World', city: 'Red Deer', status: 'Inactive' },
    { id: 'd4', name: 'Auto Zone', city: 'Sherwood Park', status: 'Active' },
  ];

  // Revenue trend (7 bars)
  revenueTrend = [
    { label: 'Mon', value: 8400 },
    { label: 'Tue', value: 11200 },
    { label: 'Wed', value: 9800 },
    { label: 'Thu', value: 13800 },
    { label: 'Fri', value: 15600 },
    { label: 'Sat', value: 12400 },
    { label: 'Sun', value: 9700 },
  ];

  // Sales mix for donut chart
  salesMix: SalesMix = { tire: 520, wheel: 410, cover: 354 };

  topProducts: TopProduct[] = [
    {
      name: 'Michelin Pilot Sport 4 (205/55R16)',
      sku: 'TIRE-20555R16-MIC',
      type: 'Tire',
      sold: 164,
      revenue: 37600,
    },
    {
      name: 'Alloy Wheel 17x7.5 (5x114.3)',
      sku: 'WHL-17X75-AL',
      type: 'Wheel',
      sold: 131,
      revenue: 24890,
    },
    {
      name: 'Wheel Cover 16" Black',
      sku: 'COV-16-BLK',
      type: 'Cover',
      sold: 228,
      revenue: 5690,
    },
  ];

  // ====== KPIs ======
  get dealersCount() {
    return this.dealers.length;
  }
  get activeDealers() {
    return this.dealers.filter((d) => d.status === 'Active').length;
  }

  // ====== Trend helpers ======
  get maxTrend() {
    return Math.max(...this.revenueTrend.map((x) => x.value), 1);
  }
  barHeightPercent(v: number) {
    return Math.max(8, Math.round((v / this.maxTrend) * 100)); // min visible 8%
  }

  // ====== Donut helpers ======
  get mixTotal() {
    return this.salesMix.tire + this.salesMix.wheel + this.salesMix.cover;
  }
  pct(v: number) {
    return this.mixTotal ? (v / this.mixTotal) * 100 : 0;
  }

  // Conic gradient string for donut
  get donutStyle() {
    const t = this.pct(this.salesMix.tire);
    const w = this.pct(this.salesMix.wheel);
    const c = this.pct(this.salesMix.cover);

    // Tire = black, Wheel = gray-800, Cover = gray-500
    // Feel free to change colors
    const a = t;
    const b = t + w;

    return {
      background: `conic-gradient(#000 0% ${a}%, #111827 ${a}% ${b}%, #6b7280 ${b}% 100%)`,
    };
  }

  // badges
  typeBadge(type: TopProduct['type']) {
    switch (type) {
      case 'Tire':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'Wheel':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      default:
        return 'bg-amber-50 text-amber-700 border-amber-200';
    }
  }
}