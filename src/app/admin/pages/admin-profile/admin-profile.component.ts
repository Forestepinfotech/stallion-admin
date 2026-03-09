import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DashboardService } from '../../../core/api/generated/dashboard/dashboard.service';
import { UsersService } from '../../../core/api/generated/users/users.service';
import { FormBuilder, ReactiveFormsModule, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import {
  ActivityItemDto,
  ChangeUserPasswordDto,
  ProfileActivityDto,
  ProfileDto,
  ProfileStatsDto,
  UpdateAdminDashboardProfileDto,
} from '../../../core/api/generated/schemas/index';
import { ToastService } from '../../../core/notification/toast.service';
import { Store } from '@ngrx/store';
import { AuthActions } from '../../../core/state/auth/auth.actions';
import { selectProfile, selectProfileLoading } from '../../../core/state/auth/auth.selectors';
import { SkeletonPanelComponent } from '../../../core/ui/skeleton-panel.component';
import { ProfileApiService } from '../../../core/api/profile-api.service';

type Profile = {
  name: string;
  role: string;
  email: string;
  phone: string;
  address: string;
  postalCode: string;
  province: string;
  country: string;
  joined: string; // yyyy-mm-dd
  avatarUrl?: string;
};

type ActivityType = 'coupon' | 'product' | 'order' | 'profile';

type Activity = {
  type: ActivityType;
  title: string;
  desc: string;
  time: string;
};
@Component({
  selector: 'app-admin-profile',
  imports: [CommonModule, ReactiveFormsModule, SkeletonPanelComponent],
  templateUrl: './admin-profile.component.html',
  styleUrl: './admin-profile.component.css',
})
export class AdminProfileComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly toast = inject(ToastService);
  private readonly http = inject(HttpClient);
  private readonly store = inject(Store);
  private readonly dashboard = inject(DashboardService);
  private readonly usersApi = inject(UsersService);
  private readonly profileApi = inject(ProfileApiService);

  profile: Profile = {
    name: 'Loading...',
    role: '',
    email: '',
    phone: '',
    address: '',
    postalCode: '',
    province: '',
    country: '',
    joined: '',
    avatarUrl: '',
  };

  stats: { label: string; value: number | string }[] = [];
  activityStats: { label: string; value: number }[] = [];
  recentActivity: Activity[] = [];

  // ======== UI STATE ========
  editOpen = false;
  passwordOpen = false;
  loading = false;
  saving = false;
  savingPassword = false;
  currentPasswordVisible = false;
  newPasswordVisible = false;
  confirmPasswordVisible = false;
  currentUserId: string | null = null;

  // ======== FORMS ========
  editForm;
  passwordForm;

  constructor() {
    // Edit Profile form
    this.editForm = this.fb.nonNullable.group({
      name: this.fb.nonNullable.control(this.profile.name, [
        Validators.required,
        Validators.minLength(2),
      ]),
      email: this.fb.nonNullable.control(this.profile.email, [
        Validators.required,
        Validators.email,
      ]),
      phone: this.fb.nonNullable.control(this.profile.phone, [
        Validators.required,
        Validators.minLength(7),
      ]),
      address: this.fb.nonNullable.control(this.profile.address),
      postalCode: this.fb.nonNullable.control(this.profile.postalCode),
      province: this.fb.nonNullable.control(this.profile.province),
      country: this.fb.nonNullable.control(this.profile.country),
      avatarUrl: this.fb.control<string>(this.profile.avatarUrl ?? ''),
    });

    // Change Password form (with match validator)
    this.passwordForm = this.fb.nonNullable.group(
      {
        currentPassword: this.fb.nonNullable.control('', [
          Validators.required,
          Validators.minLength(6),
        ]),
        newPassword: this.fb.nonNullable.control('', [
          Validators.required,
          Validators.minLength(8),
        ]),
        confirmPassword: this.fb.nonNullable.control('', [
          Validators.required,
          Validators.minLength(8),
        ]),
      },
      { validators: [this.passwordMatchValidator] },
    );
  }

  ngOnInit(): void {
    this.store.dispatch(AuthActions.loadProfile());
    this.loadRecentActivity();
    this.store.select(selectProfile).subscribe((profile) => {
      if (profile) {
        this.applyProfile(profile);
        this.applyStats(profile.stats);
        this.applyActivityStats(profile.activity);
      }
    });
    this.store.select(selectProfileLoading).subscribe((loading) => (this.loading = loading));
  }

  // ======== MODALS ========
  openEdit() {
    this.editForm.reset({
      name: this.profile.name,
      email: this.profile.email,
      phone: this.profile.phone,
      address: this.profile.address,
      postalCode: this.profile.postalCode,
      province: this.profile.province,
      country: this.profile.country,
      avatarUrl: this.profile.avatarUrl ?? '',
    });
    this.editOpen = true;
  }

  closeEdit() {
    this.editOpen = false;
  }

  openPassword() {
    this.passwordForm.reset({
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    });
    this.currentPasswordVisible = false;
    this.newPasswordVisible = false;
    this.confirmPasswordVisible = false;
    this.passwordOpen = true;
  }

  closePassword() {
    this.passwordOpen = false;
  }

  // ======== ACTIONS ========
  saveProfile() {
    if (this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }

    const v = this.editForm.getRawValue();

    const payload: UpdateAdminDashboardProfileDto = {
      name: v.name,
      email: v.email,
      phone: v.phone,
      line1: v.address || undefined,
      postalcode: v.postalCode || undefined,
      province: v.province || undefined,
      country: v.country || undefined,
      avatarUrl: v.avatarUrl ?? '',
    };

    this.saving = true;
    this.profileApi
      .updateAdminProfile(payload)
      .pipe(finalize(() => (this.saving = false)))
      .subscribe({
        next: (updated) => {
          this.toast.success('Profile updated');
          this.applyProfile(updated);
          this.applyStats(updated.stats);
          this.applyActivityStats(updated.activity);
          this.store.dispatch(AuthActions.updateProfileSuccess({ profile: updated }));
          this.closeEdit();
        },
        error: (err) => {
          console.error(err);
          this.toast.error('Profile update failed');
        },
      });
  }

  changePassword() {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }

    if (!this.currentUserId) {
      this.toast.error('Profile is not loaded yet.');
      return;
    }

    const v = this.passwordForm.getRawValue();
    const payload: ChangeUserPasswordDto = {
      currentPassword: v.currentPassword,
      newPassword: v.newPassword,
    };

    this.savingPassword = true;
    this.usersApi
      .usersControllerChangePassword(this.currentUserId, payload)
      .pipe(finalize(() => (this.savingPassword = false)))
      .subscribe({
        next: () => {
          this.toast.success('Password updated');
          this.closePassword();
        },
        error: (err) => {
          console.error(err);
          this.toast.error(this.extractErrorMessage(err, 'Failed to update password'));
        },
      });
  }

  // ======== AVATAR UPLOAD ========
  async onAvatarChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) return;

    if (file.size > 2 * 1024 * 1024) {
      alert('Max file size is 2MB.');
      return;
    }

    const base64 = await this.fileToBase64(file);
    this.editForm.patchValue({ avatarUrl: base64 });
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  // ======== VALIDATION ========
  private passwordMatchValidator(
    group: AbstractControl,
  ): ValidationErrors | null {
    const newPass = group.get('newPassword')?.value;
    const confirm = group.get('confirmPassword')?.value;
    if (!newPass || !confirm) return null;
    return newPass === confirm ? null : { passwordMismatch: true };
  }

  get passwordMismatch() {
    return (
      this.passwordForm.hasError('passwordMismatch') &&
      (this.passwordForm.get('confirmPassword')?.touched ||
        this.passwordForm.get('confirmPassword')?.dirty)
    );
  }

  invalid(form: any, name: string) {
    const c = form.get(name);
    return !!c && c.invalid && (c.touched || c.dirty);
  }

  // ======== UI HELPERS ========
  activityPillClass(type: ActivityType) {
    switch (type) {
      case 'coupon':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'product':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'order':
        return 'bg-sky-50 text-sky-700 border-sky-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  }

  activityIconClass(type: ActivityType) {
    switch (type) {
      case 'coupon':
        return 'bg-gradient-to-br from-indigo-500 to-indigo-700 text-white border-indigo-200';
      case 'product':
        return 'bg-gradient-to-br from-emerald-500 to-emerald-700 text-white border-emerald-200';
      case 'order':
        return 'bg-gradient-to-br from-sky-500 to-sky-700 text-white border-sky-200';
      default:
        return 'bg-gradient-to-br from-gray-700 to-black text-white border-gray-200';
    }
  }

  // Demo button handlers
  viewAllActivity() {
    this.toast.info('Pagination/route not wired yet.');
  }

  openActivity(a: Activity) {
    this.toast.info(`${a.title}`, 'Open activity (todo)');
  }

  activityDetails(a: Activity) {
    this.toast.info(a.desc, 'Activity details');
  }

  // ======== DATA LOADING ========
  private loadRecentActivity() {
    this.dashboard.dashboardControllerRecentActivity<ActivityItemDto[]>().subscribe({
      next: (items) => (this.recentActivity = items.map((x) => this.mapActivity(x))),
      error: (err) => {
        console.error(err);
        this.toast.error('Failed to load activity');
      },
    });
  }

  private applyProfile(dto: ProfileDto) {
    const user = dto.user;
    const addr = dto.address;
    this.currentUserId = user?.user_id != null ? String(user.user_id) : null;
    const joined = user?.created_at ? new Date(user.created_at).toISOString().split('T')[0] : '';

    this.profile = {
      name: this.safeString(user?.name) || user?.email?.split('@')[0] || 'User',
      role: user?.usertypename ?? 'Administrator',
      email: user?.email ?? '',
      phone: this.safeString(user?.phone),
      address: this.safeString(addr?.line1),
      postalCode: this.addrPart(addr?.postalcode),
      province: this.addrPart(addr?.province),
      country: this.addrPart(addr?.country),
      joined,
      avatarUrl: typeof user?.user_pic === 'string' ? (user.user_pic as string) : '',
    };

    this.editForm.patchValue({
      name: this.profile.name,
      email: this.profile.email,
      phone: this.profile.phone,
      address: this.profile.address,
      postalCode: this.profile.postalCode,
      province: this.profile.province,
      country: this.profile.country,
      avatarUrl: this.profile.avatarUrl,
    });
  }

  private addrPart(part: unknown): string {
    if (!part) return '';
    if (typeof part === 'string') return part;
    if (typeof part === 'object') {
      // try common keys coming from backend even though OpenAPI typed as unknown
      const anyPart = part as Record<string, unknown>;
      const candidates = ['province_name', 'country_name', 'name', 'code', 'value'];
      for (const key of candidates) {
        const val = anyPart[key];
        if (typeof val === 'string') return val;
      }
    }
    return '';
  }

  private applyStats(stats?: ProfileStatsDto | null) {
    const s = stats ?? { orders: 0, products: 0, coupons: 0, revenue: 0 };
    this.stats = [
      { label: 'Orders Managed', value: s.orders ?? 0 },
      { label: 'Products', value: s.products ?? 0 },
      { label: 'Coupons', value: s.coupons ?? 0 },
      { label: 'Revenue', value: `$${(s.revenue ?? 0).toLocaleString()}` },
    ];
  }

  private applyActivityStats(a?: ProfileActivityDto | null) {
    const stats = a ?? { week: 0, month: 0, avgDay: 0 };
    this.activityStats = [
      { label: 'This week', value: stats.week ?? 0 },
      { label: 'This month', value: stats.month ?? 0 },
      { label: 'Avg/day', value: stats.avgDay ?? 0 },
    ];
  }

  private mapActivity(a: ActivityItemDto): Activity {
    const type = this.mapActivityType(a.entity);
    const desc = `${a.entity} ${a.entity_id} • ${a.action}`;
    const time = this.formatTime(a.created_at);
    return { type, title: a.action, desc, time };
  }

  private mapActivityType(entity: string): ActivityType {
    const e = (entity ?? '').toLowerCase();
    if (e.includes('coupon')) return 'coupon';
    if (e.includes('product')) return 'product';
    if (e.includes('order')) return 'order';
    return 'profile';
  }

  private formatTime(createdAt: string) {
    const d = new Date(createdAt);
    if (Number.isNaN(d.getTime())) return createdAt;
    return d.toLocaleString();
  }

  private safeString(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  private extractErrorMessage(error: unknown, fallback: string): string {
    if (!error || typeof error !== 'object') return fallback;
    const err = error as Record<string, unknown>;
    const nested = err['error'];
    if (typeof nested === 'string' && nested.trim()) return nested;
    if (nested && typeof nested === 'object') {
      const nestedRecord = nested as Record<string, unknown>;
      const nestedMessage = nestedRecord['message'];
      if (typeof nestedMessage === 'string' && nestedMessage.trim()) return nestedMessage;
      if (Array.isArray(nestedMessage)) {
        const first = nestedMessage.find((item) => typeof item === 'string' && item.trim());
        if (typeof first === 'string') return first;
      }
      const nestedError = nestedRecord['error'];
      if (typeof nestedError === 'string' && nestedError.trim()) return nestedError;
    }

    const direct = err['message'];
    if (typeof direct === 'string' && direct.trim()) return direct;

    return fallback;
  }

  profileLocation(): string {
    return [this.profile.address, this.profile.province, this.profile.country]
      .filter(Boolean)
      .join(', ') || '-';
  }

  previewLocation(): string {
    const v = this.editForm.getRawValue();
    return [v.address, v.province, v.country].filter(Boolean).join(', ') || '-';
  }

  passwordInputType(field: 'current' | 'new' | 'confirm'): 'text' | 'password' {
    if (field === 'current') return this.currentPasswordVisible ? 'text' : 'password';
    if (field === 'new') return this.newPasswordVisible ? 'text' : 'password';
    return this.confirmPasswordVisible ? 'text' : 'password';
  }

  togglePasswordVisibility(field: 'current' | 'new' | 'confirm') {
    if (field === 'current') {
      this.currentPasswordVisible = !this.currentPasswordVisible;
      return;
    }
    if (field === 'new') {
      this.newPasswordVisible = !this.newPasswordVisible;
      return;
    }
    this.confirmPasswordVisible = !this.confirmPasswordVisible;
  }
}
