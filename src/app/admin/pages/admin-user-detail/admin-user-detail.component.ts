import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AdminDashboardService } from '../../../core/api/generated/admin-dashboard/admin-dashboard.service';
import { AdminUsersService } from '../../../core/api/generated/admin-users/admin-users.service';
import type {
  ActivityItemDto,
  DashboardControllerRecentActivityParams,
  PaginatedRecentActivityDtoMeta,
  PaginatedRecentActivityDto,
  UsersResponseDto,
} from '../../../core/api/generated/schemas';
import { ToastService } from '../../../core/notification/toast.service';

interface ActivityMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

@Component({
  selector: 'app-admin-user-detail',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './admin-user-detail.component.html',
  styleUrl: './admin-user-detail.component.css',
})
export class AdminUserDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly usersApi = inject(AdminUsersService);
  private readonly dashboardApi = inject(AdminDashboardService);
  private readonly toast = inject(ToastService);

  readonly activityPageSizeOptions = [20, 50, 100];

  userId = '';
  user: UsersResponseDto | null = null;
  loading = false;
  loadError: string | null = null;
  savingRestriction = false;
  savingUnlock = false;
  savingLock = false;

  activities: ActivityItemDto[] = [];
  activitiesLoading = false;
  activitiesError: string | null = null;
  activityMeta: ActivityMeta = { page: 1, limit: 50, total: 0, totalPages: 1 };
  activityParams: DashboardControllerRecentActivityParams = { page: 1, limit: 50 };

  ngOnInit(): void {
    this.userId = this.route.snapshot.paramMap.get('id') ?? '';
    if (!this.userId) {
      this.toast.error('Invalid user id.');
      return;
    }
    this.loadUser();
  }

  get userName(): string {
    const name = this.user?.name;
    if (typeof name === 'string' && name.trim()) return name;
    return this.user?.email?.split('@')[0] ?? 'User';
  }

  get roleName(): string {
    return this.readText(this.user?.usertypename) || '—';
  }

  get isRestricted(): boolean {
    return !Boolean(this.user?.is_active);
  }

  get isLocked(): boolean {
    return this.isLockedUntil(this.user?.locked_until);
  }

  get canGoPrev(): boolean {
    return this.activityMeta.page > 1;
  }

  get canGoNext(): boolean {
    return this.activityMeta.page < this.activityMeta.totalPages;
  }

  get activityShowingFrom(): number {
    if (this.activityMeta.total === 0) return 0;
    return (this.activityMeta.page - 1) * this.activityMeta.limit + 1;
  }

  get activityShowingTo(): number {
    return Math.min(this.activityMeta.page * this.activityMeta.limit, this.activityMeta.total);
  }

  refresh(): void {
    this.loadUser();
  }

  retryActivities(): void {
    this.loadActivities(this.activityParams);
  }

  toggleRestriction(): void {
    if (!this.user) return;

    const nextActive = !this.user.is_active;
    const confirmed = window.confirm(
      nextActive
        ? `Restore access for ${this.userName}?`
        : `Restrict ${this.userName}? This user will lose access until restored.`,
    );

    if (!confirmed) return;

    this.savingRestriction = true;
    this.usersApi
      .usersControllerUpdate(this.userId, { is_active: nextActive })
      .pipe(finalize(() => (this.savingRestriction = false)))
      .subscribe({
        next: (updated) => {
          this.user = updated;
          this.toast.success(nextActive ? 'User access restored.' : 'User restricted.');
        },
        error: (error: unknown) => {
          this.toast.error(this.getApiErrorMessage(error, 'Failed to update user restriction.'));
        },
      });
  }

  onLockedToggle(checked: boolean): void {
    if (!this.user) return;
    if (checked && !this.isLocked) this.lockUser();
    if (!checked && this.isLocked) this.resetLock();
  }

  resetLock(): void {
    if (!this.userId || this.savingUnlock) return;
    this.savingUnlock = true;
    this.usersApi
      .usersControllerUnlock(this.userId)
      .pipe(finalize(() => (this.savingUnlock = false)))
      .subscribe({
        next: (updated) => {
          this.user = updated;
          this.toast.success('User unlocked.');
        },
        error: (error: unknown) => {
          this.toast.error(this.getApiErrorMessage(error, 'Failed to unlock user.'));
        },
      });
  }

  lockUser(): void {
    if (!this.userId || this.savingLock) return;

    const confirmed = window.confirm(
      `Lock ${this.userName}? They will be unable to sign in until unlocked.`,
    );
    if (!confirmed) return;

    const lockedUntil = this.buildManualLockUntilIso();
    this.savingLock = true;
    this.usersApi
      .usersControllerUpdate(this.userId, {
        failed_login_attempts: '999',
        locked_until: lockedUntil,
      })
      .pipe(finalize(() => (this.savingLock = false)))
      .subscribe({
        next: (updated) => {
          this.user = updated;
          this.toast.success('User locked.');
        },
        error: (error: unknown) => {
          this.toast.error(this.getApiErrorMessage(error, 'Failed to lock user.'));
        },
      });
  }

  updateEmailSubscription(enabled: boolean): void {
    if (!this.user) return;

    const previous = Boolean(this.user.email_subscribed);
    this.user = { ...this.user, email_subscribed: enabled };
    this.usersApi.usersControllerUpdateEmailSubscription(this.userId, { subscribed: enabled }).subscribe({
      next: (updated) => {
        this.user = updated;
        this.toast.success('Email subscription updated.');
      },
      error: (error: unknown) => {
        this.user = { ...this.user!, email_subscribed: previous };
        this.toast.error(this.getApiErrorMessage(error, 'Failed to update email subscription.'));
      },
    });
  }

  changeActivityPage(page: number): void {
    if (page < 1 || page > this.activityMeta.totalPages || page === this.activityMeta.page) return;
    this.loadActivities({ ...this.activityParams, page });
  }

  changeActivityPageSize(limit: number | string): void {
    const parsed = Number(limit);
    this.loadActivities({ ...this.activityParams, page: 1, limit: Number.isFinite(parsed) ? parsed : 50 });
  }

  trackByAuditId(_: number, item: ActivityItemDto): number {
    return item.audit_id;
  }

  activityBadgeClass(entity: string): string {
    const normalized = entity.toLowerCase();
    if (normalized.includes('order')) return 'bg-sky-50 text-sky-700 border-sky-200';
    if (normalized.includes('coupon')) return 'bg-amber-50 text-amber-700 border-amber-200';
    if (normalized.includes('product')) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    return 'bg-gray-100 text-gray-700 border-gray-200';
  }

  private loadUser(): void {
    this.loading = true;
    this.loadError = null;
    this.usersApi
      .usersControllerGet(this.userId)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (user) => {
          this.user = user;
          if (!user.is_active) {
            this.toast.warning('This user is currently restricted.');
          }
          this.loadActivities({
            page: 1,
            limit: this.activityMeta.limit,
            user_id: user.user_id,
            user_email: user.email,
          });
        },
        error: (error: unknown) => {
          this.user = null;
          this.activities = [];
          this.loadError = this.getApiErrorMessage(error, 'Failed to load user details.');
          this.toast.error(this.loadError);
        },
      });
  }

  private isLockedUntil(value: unknown): boolean {
    const normalized = String(value ?? '').trim();
    if (!normalized) return false;
    const parsed = Date.parse(normalized);
    if (Number.isNaN(parsed)) return true;
    return parsed > Date.now();
  }

  private buildManualLockUntilIso(): string {
    const date = new Date();
    date.setFullYear(date.getFullYear() + 10);
    return date.toISOString();
  }

  private loadActivities(params: DashboardControllerRecentActivityParams): void {
    this.activityParams = params;
    this.activitiesLoading = true;
    this.activitiesError = null;
    this.dashboardApi
      .dashboardControllerRecentActivity(params)
      .pipe(finalize(() => (this.activitiesLoading = false)))
      .subscribe({
        next: (response: PaginatedRecentActivityDto) => {
          this.activities = Array.isArray(response.data) ? response.data : [];
          this.activityMeta = this.normalizeActivityMeta(response.meta, params.page ?? 1, params.limit ?? 50);
        },
        error: (error: unknown) => {
          this.activities = [];
          this.activityMeta = this.normalizeActivityMeta(undefined, params.page ?? 1, params.limit ?? 50);
          this.activitiesError = this.getApiErrorMessage(error, 'Failed to load user activity.');
          this.toast.error(this.activitiesError);
        },
      });
  }

  private normalizeActivityMeta(
    meta: PaginatedRecentActivityDtoMeta | undefined,
    fallbackPage: number,
    fallbackLimit: number,
  ): ActivityMeta {
    const source = (meta ?? {}) as Record<string, unknown>;
    const page = this.toNumber(source['page']) ?? fallbackPage;
    const limit = this.toNumber(source['limit']) ?? this.toNumber(source['perPage']) ?? fallbackLimit;
    const total =
      this.toNumber(source['total']) ??
      this.toNumber(source['totalItems']) ??
      this.toNumber(source['itemCount']) ??
      this.activities.length;
    const totalPages =
      this.toNumber(source['totalPages']) ??
      this.toNumber(source['pageCount']) ??
      Math.max(1, Math.ceil(total / Math.max(limit, 1)));

    return { page, limit, total, totalPages: Math.max(1, totalPages) };
  }

  private toNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const normalized = String(value ?? '').trim();
    if (!normalized) return undefined;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  readText(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  formatDate(value: unknown): string {
    const text = this.readText(value);
    if (!text) return '—';
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? text : date.toLocaleString();
  }

  formatDetails(details: unknown): string {
    if (!details) return '—';
    if (typeof details === 'string') return details;
    try {
      return JSON.stringify(details);
    } catch {
      return '—';
    }
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
