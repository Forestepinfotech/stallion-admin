import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { catchError, finalize, forkJoin, of } from 'rxjs';
import { AdminDashboardService } from '../../../core/api/generated/admin-dashboard/admin-dashboard.service';
import type {
  ActivityItemDto,
  DashboardSummaryDto,
  ProfileDto,
  RevenuePointDto,
  SalesMixItemDto,
  TopProductDto,
} from '../../../core/api/generated/schemas';
import { ToastService } from '../../../core/notification/toast.service';

type DonutSegment = SalesMixItemDto & {
  color: string;
  trackColor: string;
};

@Component({
  selector: 'app-admin-dashboard',
  imports: [CommonModule],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.css',
})
export class AdminDashboardComponent implements OnInit {
  private readonly dashboardApi = inject(AdminDashboardService);
  private readonly toast = inject(ToastService);

  loading = false;

  summary: DashboardSummaryDto = {
    revenue: 0,
    soldProducts: 0,
    activeDealers: 0,
    totalDealers: 0,
    totalProducts: 0,
  };

  revenueTrend: RevenuePointDto[] = [];
  revenuePeak = 0;

  salesMixItems: SalesMixItemDto[] = [];
  salesMixTotal = 0;

  topProducts: TopProductDto[] = [];
  recentActivity: ActivityItemDto[] = [];
  adminProfile: ProfileDto | null = null;

  ngOnInit(): void {
    this.loadDashboard();
  }

  get revenueTotal(): number {
    return this.summary.revenue ?? 0;
  }

  get soldProductsTotal(): number {
    return this.summary.soldProducts ?? 0;
  }

  get dealersCount(): number {
    return this.summary.totalDealers ?? 0;
  }

  get activeDealers(): number {
    return this.summary.activeDealers ?? 0;
  }

  get totalProducts(): number {
    return this.summary.totalProducts ?? 0;
  }

  get adminDisplayName(): string {
    const user = this.adminProfile?.user;
    const name = this.extractDisplayText(user?.name);
    if (name) return name;

    const email = typeof user?.email === 'string' ? user.email.trim() : '';
    if (email) return email.split('@')[0];

    return 'Admin';
  }

  get donutSegments(): DonutSegment[] {
    const palette = [
      { color: '#111827', trackColor: '#e5e7eb' },
      { color: '#2563eb', trackColor: '#dbeafe' },
      { color: '#059669', trackColor: '#d1fae5' },
      { color: '#d97706', trackColor: '#fef3c7' },
      { color: '#7c3aed', trackColor: '#ede9fe' },
    ];

    return this.salesMixItems.map((item, index) => ({
      ...item,
      ...palette[index % palette.length],
    }));
  }

  get donutStyle(): Record<string, string> {
    if (!this.salesMixTotal || this.donutSegments.length === 0) {
      return { background: 'conic-gradient(#e5e7eb 0% 100%)' };
    }

    let offset = 0;
    const segments = this.donutSegments.map((item) => {
      const start = offset;
      const end = start + item.percent;
      offset = end;
      return `${item.color} ${start}% ${end}%`;
    });

    return { background: `conic-gradient(${segments.join(', ')})` };
  }

  get maxTrend(): number {
    return Math.max(this.revenuePeak, ...this.revenueTrend.map((item) => item.revenue), 1);
  }

  barHeightPercent(value: number): number {
    return Math.max(8, Math.round((value / this.maxTrend) * 100));
  }

  formatTrendLabel(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString(undefined, { weekday: 'short' });
  }

  formatTrendDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  productCategoryLabel(product: TopProductDto): string {
    const category = this.extractDisplayText(product.category);
    if (category) return category;

    if (product.category && typeof product.category === 'object') {
      const fallback = this.extractDisplayText((product.category as Record<string, unknown>)['label']);
      if (fallback) return fallback;
    }
    return 'Product';
  }

  typeBadge(category: string): string {
    const normalized = category.toLowerCase();
    if (normalized.includes('tire')) return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    if (normalized.includes('wheel')) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (normalized.includes('cover')) return 'bg-amber-50 text-amber-700 border-amber-200';
    return 'bg-slate-100 text-slate-700 border-slate-200';
  }

  formatActivityTitle(item: ActivityItemDto): string {
    const entity = this.titleCase(item.entity || 'activity');
    const action = this.titleCase(item.action || 'updated');
    return `${entity} ${action}`;
  }

  formatActivityDetails(item: ActivityItemDto): string {
    const userEmail = this.extractDisplayText(item.user_email);
    if (userEmail) return userEmail;

    if (item.details && typeof item.details === 'object') {
      const details = item.details as Record<string, unknown>;
      const summary = [details['name'], details['title'], details['sku'], details['message'], details['email']]
        .map((value) => this.extractDisplayText(value))
        .find((value) => Boolean(value));
      if (summary) return summary;
      try {
        return JSON.stringify(details);
      } catch {
        return 'Activity recorded';
      }
    }

    return 'Activity recorded';
  }

  formatActivityTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
  }

  trackByRevenueDate(_: number, item: RevenuePointDto): string {
    return item.date;
  }

  trackByMixCategory(_: number, item: SalesMixItemDto): string {
    return item.category;
  }

  trackByProduct(_: number, item: TopProductDto): number {
    return item.product_id;
  }

  trackByActivity(_: number, item: ActivityItemDto): number {
    return item.audit_id;
  }

  private loadDashboard(): void {
    this.loading = true;

    forkJoin({
      summary: this.dashboardApi.dashboardControllerSummary().pipe(
        catchError(() => of(this.summary)),
      ),
      revenueTrend: this.dashboardApi.dashboardControllerRevenueTrend({ days: 7 }).pipe(
        catchError(() => of({ days: [], peak: 0 })),
      ),
      salesMix: this.dashboardApi.dashboardControllerSalesMix({ days: 30 }).pipe(
        catchError(() => of({ total: 0, items: [] })),
      ),
      topProducts: this.dashboardApi.dashboardControllerTopProductsList({ limit: 10, days: 30 }).pipe(
        catchError(() => of({ count: 0, items: [] })),
      ),
      recentActivity: this.dashboardApi.dashboardControllerRecentActivity({ page: 1, limit: 10 }).pipe(
        catchError(() => of({ data: [], meta: { page: 1, limit: 10, total: 0, totalPages: 1 } })),
      ),
      adminProfile: this.dashboardApi.dashboardControllerAdminProfile().pipe(
        catchError(() => of(null)),
      ),
    })
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (response) => {
          this.summary = response.summary;
          this.revenueTrend = Array.isArray(response.revenueTrend.days) ? response.revenueTrend.days : [];
          this.revenuePeak = response.revenueTrend.peak ?? 0;
          this.salesMixItems = Array.isArray(response.salesMix.items) ? response.salesMix.items : [];
          this.salesMixTotal = response.salesMix.total ?? 0;
          this.topProducts = Array.isArray(response.topProducts.items) ? response.topProducts.items : [];
          this.recentActivity = Array.isArray(response.recentActivity.data) ? response.recentActivity.data : [];
          this.adminProfile = response.adminProfile;
        },
        error: (error: unknown) => {
          console.error(error);
          this.toast.error('Failed to load dashboard data.');
        },
      });
  }

  private titleCase(value: string): string {
    return value
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  private extractDisplayText(value: unknown): string {
    if (typeof value === 'string') {
      const text = value.trim();
      return text;
    }

    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      for (const key of ['name', 'title', 'label', 'value', 'email']) {
        const candidate = record[key];
        if (typeof candidate === 'string' && candidate.trim()) {
          return candidate.trim();
        }
      }
    }

    return '';
  }
}
