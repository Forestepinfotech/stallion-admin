import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Observable, of } from 'rxjs';
import { finalize, switchMap } from 'rxjs/operators';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
  AbstractControl,
  ValidationErrors,
} from '@angular/forms';
import { AdminUsersService as UsersService } from '../../../core/api/generated/admin-users/admin-users.service';
import { AdminUsertypeService as UsertypeService } from '../../../core/api/generated/admin-usertype/admin-usertype.service';
import {
  CreateUsersDto,
  ManageUserPasswordDto,
  PaginatedUsersResponseDto,
  PaginatedUsertypeResponseDto,
  UpdateUsersDto,
  UsersResponseDto,
  UsertypeResponseDto,
} from '../../../core/api/generated/schemas/index';
import { MediaUrlService } from '../../../core/media/media-url.service';
import { ToastService } from '../../../core/notification/toast.service';
import { AssetUploadService } from '../../../core/upload/asset-upload.service';
import { SkeletonPanelComponent } from '../../../core/ui/skeleton-panel.component';

type Status = 'Active' | 'Inactive';

type RoleOption = Pick<UsertypeResponseDto, 'usertypeid' | 'usertypename' | 'is_active'>;

type User = {
  id: string;
  name: string;
  roleId: number | string;
  roleName: string;
  email: string;
  phone: string;
  address?: string;
  postalCode?: string;
  province?: string;
  country?: string;
  status: Status;
  avatarUrl?: string;
  createdAt: string; // yyyy-mm-dd
  failedLoginAttempts: number;
  lockedUntil: string;
  isLocked: boolean;
};
@Component({
  selector: 'app-admin-user',
  imports: [CommonModule, FormsModule, ReactiveFormsModule, SkeletonPanelComponent, RouterLink],
  templateUrl: './admin-user.component.html',
  styleUrl: './admin-user.component.css',
})
export class AdminUserComponent implements OnInit {


  // ===== UI =====
  query = '';
  roleFilter: 'All' | string = 'All';
  statusFilter: 'All' | Status = 'All';

  editOpen = false;
  passwordOpen = false;
  deleteOpen = false;
  newPasswordVisible = false;
  confirmPasswordVisible = false;
  avatarDragActive = false;
  avatarUploadProgress: number | null = null;
  private pendingAvatarFile: File | null = null;
  private pendingAvatarPreviewUrl: string | null = null;

  selected: User | null = null;
  editMode: 'create' | 'edit' = 'create';

  // ===== Data =====
  users: User[] = [];
  roleOptions: RoleOption[] = [];
  listLoading = true;
  roleLoading = true;
  savingUser = false;
  savingPassword = false;
  deleting = false;
  // pagination
  page = 1;
  pageSize = 50;
  readonly pageSizeOptions = [20, 50, 100];
  total = 0;
  get totalPages(): number {
    if (!this.total || !this.pageSize) return 1;
    return Math.max(1, Math.ceil(this.total / this.pageSize));
  }

  // ===== Forms =====
  userForm;
  passwordForm;

  constructor(
    private fb: FormBuilder,
    private usersApi: UsersService,
    private usertypeApi: UsertypeService,
    private toast: ToastService,
    private assetUploadService: AssetUploadService,
    private mediaUrlService: MediaUrlService,
  ) {
    this.userForm = this.fb.nonNullable.group({
      name: this.fb.nonNullable.control('', [Validators.required, Validators.minLength(2)]),
      role: this.fb.nonNullable.control<string>('', Validators.required),
      email: this.fb.nonNullable.control('', [Validators.required, Validators.email]),
      phone: this.fb.nonNullable.control('', [Validators.required, Validators.minLength(7)]),
      address: this.fb.nonNullable.control(''),
      postalCode: this.fb.nonNullable.control(''),
      province: this.fb.nonNullable.control(''),
      country: this.fb.nonNullable.control(''),
      status: this.fb.nonNullable.control<Status>('Active', Validators.required),
      avatarUrl: this.fb.control<string>(''),
      locked: this.fb.nonNullable.control(false),
    });

    this.passwordForm = this.fb.nonNullable.group(
      {
        newPassword: this.fb.nonNullable.control('', [Validators.required, Validators.minLength(8)]),
        confirmPassword: this.fb.nonNullable.control('', [Validators.required, Validators.minLength(8)]),
      },
      { validators: [this.passwordMatchValidator] }
    );
  }

  ngOnInit(): void {
    this.loadRoles();
    this.loadUsers();
  }

  // server-side filtered list already
  get filtered(): User[] {
    return this.users;
  }

  // ===== Actions =====
  openCreate() {
    this.editMode = 'create';
    this.selected = null;
    this.clearPendingAvatarState();

    this.userForm.reset({
      name: '',
      role: this.roleOptions[0]?.usertypeid?.toString() ?? '',
      email: '',
      phone: '',
      address: '',
      postalCode: '',
      province: '',
      country: '',
      status: 'Active',
      avatarUrl: '',
      locked: false,
    });

    this.editOpen = true;
  }

  openEdit(u: User) {
    this.editMode = 'edit';
    this.selected = u;
    this.clearPendingAvatarState();

    this.userForm.reset({
      name: u.name,
      role: String(u.roleId),
      email: u.email,
      phone: u.phone,
      address: u.address ?? '',
      postalCode: u.postalCode ?? '',
      province: u.province ?? '',
      country: u.country ?? '',
      status: u.status,
      avatarUrl: u.avatarUrl ?? '',
      locked: u.isLocked,
    });

    this.editOpen = true;
  }

  warnIfRestricted(u: User) {
    if (u.status === 'Inactive') {
      this.toast.warning('This user is restricted. Review access controls before making changes.');
    }
  }

  closeEdit() {
    this.clearPendingAvatarState();
    this.editOpen = false;
    this.selected = null;
  }

  async saveUser() {
    if (this.userForm.invalid) {
      this.userForm.markAllAsTouched();
      return;
    }

    const v = this.userForm.getRawValue();
    const emailLower = v.email.trim().toLowerCase();
    let avatarUrl = this.mediaUrlService.toStoredValue(v.avatarUrl);

    try {
      if (this.pendingAvatarFile) {
        this.avatarUploadProgress = 0;
        const uploaded = await this.assetUploadService.uploadFile(this.pendingAvatarFile, 'userimage', (progress) => {
          this.avatarUploadProgress = progress;
        });
        avatarUrl = uploaded.endpoint;
      }
    } catch (error) {
      this.toast.error(this.extractErrorMessage(error, 'Failed to upload avatar'));
      this.avatarUploadProgress = null;
      return;
    }

    const payloadCommon = {
      name: v.name.trim(),
      email: emailLower,
      phone: v.phone.trim(),
      usertypeid: v.role,
      user_pic: this.mediaUrlService.toStoredValue(avatarUrl),
      is_email_verified: true,
      email_subscribed: true,
      is_active: v.status === 'Active',
      is_deleted: false,
    } satisfies Partial<CreateUsersDto & UpdateUsersDto>;

    this.savingUser = true;

    const request$ =
      this.editMode === 'create'
        ? this.usersApi.usersControllerCreate({
            ...(payloadCommon as Partial<CreateUsersDto> & { name?: string }),
            // optional fields managed by backend defaults
            failed_login_attempts: '0',
            locked_until: '',
          } as CreateUsersDto)
        : this.usersApi.usersControllerUpdate(
            this.selected!.id,
            {
              ...(payloadCommon as Partial<UpdateUsersDto> & { name?: string }),
              line1: v.address.trim() || undefined,
              postalcode: v.postalCode.trim() || undefined,
              province: v.province.trim() || undefined,
              country: v.country.trim() || undefined,
            },
          );

    request$
      .pipe(
        switchMap((user) =>
          this.editMode === 'create' ? this.persistCreateAddress(user, v) : of(user),
        ),
        switchMap((user) => {
          const shouldUnlock =
            this.editMode === 'edit' &&
            this.selected?.isLocked === true &&
            v.locked === false;
          if (!shouldUnlock) return of(user);
          return this.usersApi.usersControllerUnlock(this.selected!.id);
        }),
        finalize(() => (this.savingUser = false)),
      )
      .subscribe({
        next: () => {
          this.clearPendingAvatarState();
          if (this.editMode === 'edit' && this.selected?.isLocked && v.locked === false) {
            this.toast.success('User saved and lock reset.');
          } else {
            this.toast.success('User saved');
          }
          this.closeEdit();
          this.loadUsers();
        },
        error: (err) => {
          this.avatarUploadProgress = null;
          console.error(err);
          this.toast.error('Failed to save user');
        },
      });
  }

  onLockedToggle(checked: boolean): void {
    if (this.editMode !== 'edit' || !this.selected) {
      this.userForm.patchValue({ locked: false }, { emitEvent: false });
      return;
    }

    if (checked && !this.selected.isLocked) this.lockUser();
    if (!checked && this.selected.isLocked) this.resetLock();
  }

  resetLock(): void {
    if (this.editMode !== 'edit' || !this.selected || this.savingUser) return;

    const userId = this.selected.id;
    this.savingUser = true;
    this.usersApi
      .usersControllerUnlock(userId)
      .pipe(finalize(() => (this.savingUser = false)))
      .subscribe({
        next: () => {
          this.toast.success('User unlocked.');
          this.applyUnlockedState(userId);
          this.userForm.patchValue({ locked: false }, { emitEvent: false });
        },
        error: (err) => {
          console.error(err);
          this.toast.error(this.extractErrorMessage(err, 'Failed to unlock user.'));
          this.userForm.patchValue({ locked: true }, { emitEvent: false });
        },
      });
  }

  lockUser(): void {
    if (this.editMode !== 'edit' || !this.selected || this.savingUser) return;

    const confirmed = window.confirm(
      `Lock ${this.selected.name}? They will be unable to sign in until unlocked.`,
    );
    if (!confirmed) {
      this.userForm.patchValue({ locked: false }, { emitEvent: false });
      return;
    }

    const userId = this.selected.id;
    const lockedUntil = this.buildManualLockUntilIso();
    this.savingUser = true;
    this.usersApi
      .usersControllerUpdate(userId, {
        failed_login_attempts: '999',
        locked_until: lockedUntil,
      })
      .pipe(finalize(() => (this.savingUser = false)))
      .subscribe({
        next: () => {
          this.toast.success('User locked.');
          this.applyLockedState(userId, lockedUntil);
          this.userForm.patchValue({ locked: true }, { emitEvent: false });
        },
        error: (err) => {
          console.error(err);
          this.toast.error(this.extractErrorMessage(err, 'Failed to lock user.'));
          this.userForm.patchValue({ locked: false }, { emitEvent: false });
        },
      });
  }

  private applyUnlockedState(userId: string): void {
    this.users = this.users.map((u) =>
      u.id === userId
        ? { ...u, failedLoginAttempts: 0, lockedUntil: '', isLocked: false }
        : u,
    );
    if (this.selected?.id === userId) {
      this.selected = {
        ...this.selected,
        failedLoginAttempts: 0,
        lockedUntil: '',
        isLocked: false,
      };
    }
  }

  private applyLockedState(userId: string, lockedUntil: string): void {
    this.users = this.users.map((u) =>
      u.id === userId
        ? {
            ...u,
            failedLoginAttempts: Math.max(u.failedLoginAttempts, 1),
            lockedUntil,
            isLocked: true,
          }
        : u,
    );
    if (this.selected?.id === userId) {
      this.selected = {
        ...this.selected,
        failedLoginAttempts: Math.max(this.selected.failedLoginAttempts, 1),
        lockedUntil,
        isLocked: true,
      };
    }
  }

  private buildManualLockUntilIso(): string {
    const date = new Date();
    date.setFullYear(date.getFullYear() + 10);
    return date.toISOString();
  }

  // Active/Inactive checkbox
  toggleActive(u: User, checked: boolean) {
    const prevStatus = u.status;
    const newStatus: Status = checked ? 'Active' : 'Inactive';
    this.users = this.users.map((x) => (x.id === u.id ? { ...x, status: newStatus } : x));

    this.usersApi
      .usersControllerUpdate(u.id, { is_active: newStatus === 'Active' })
      .subscribe({
        next: () => this.toast.success('Status updated'),
        error: (err) => {
          console.error(err);
          this.toast.error('Failed to update status');
          // revert
          this.users = this.users.map((x) => (x.id === u.id ? { ...x, status: prevStatus } : x));
        },
      });
  }

  // Password modal
  openPassword(u: User) {
    this.selected = u;
    this.passwordForm.reset({ newPassword: '', confirmPassword: '' });
    this.newPasswordVisible = false;
    this.confirmPasswordVisible = false;
    this.passwordOpen = true;
  }

  closePassword() {
    this.passwordOpen = false;
    this.selected = null;
  }

  changePassword() {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }

    if (!this.selected) return;

    const v = this.passwordForm.getRawValue();
    const payload: ManageUserPasswordDto = {
      newPassword: v.newPassword,
    };

    this.savingPassword = true;
    this.usersApi
      .usersControllerManagePassword(this.selected.id, payload)
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

  // Delete modal
  openDelete(u: User) {
    this.selected = u;
    this.deleteOpen = true;
  }

  closeDelete() {
    this.deleteOpen = false;
    this.selected = null;
  }

  confirmDelete() {
    if (!this.selected) return;
    this.deleting = true;
    const id = this.selected.id;
    this.usersApi
      .usersControllerRemove(id)
      .pipe(finalize(() => (this.deleting = false)))
      .subscribe({
        next: () => {
          this.users = this.users.filter((u) => u.id !== id);
          this.toast.success('User deleted');
          this.closeDelete();
        },
        error: (err) => {
          console.error(err);
          this.toast.error('Failed to delete user');
        },
      });
  }

  // Avatar upload (optional)
  async onAvatarChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    await this.applyAvatar(file);
  }

  onAvatarDragOver(event: DragEvent): void {
    event.preventDefault();
    this.avatarDragActive = true;
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  onAvatarDragLeave(event: DragEvent): void {
    if (event.currentTarget === event.target) {
      this.avatarDragActive = false;
    }
  }

  async onAvatarDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    this.avatarDragActive = false;
    await this.applyAvatar(event.dataTransfer?.files?.[0]);
  }

  private async applyAvatar(file: File | undefined): Promise<void> {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.toast.warning('Please select an image file.');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      this.toast.warning('Image must be 50MB or smaller.');
      return;
    }

    this.revokePendingAvatarPreview();
    const previewUrl = URL.createObjectURL(file);
    this.pendingAvatarFile = file;
    this.pendingAvatarPreviewUrl = previewUrl;
    this.userForm.patchValue({ avatarUrl: previewUrl });
  }

  // UI helpers
  badgeRole(roleName: string) {
    const normalized = roleName.toLowerCase();
    if (normalized.includes('manager')) {
      return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    }
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }

  statusBadge(status: Status) {
    return status === 'Active'
      ? 'bg-green-50 text-green-700 border-green-200'
      : 'bg-gray-100 text-gray-700 border-gray-200';
  }

  isInvalid(name: string) {
    const c = this.userForm.get(name);
    return !!c && c.invalid && (c.touched || c.dirty);
  }

  get passwordMismatch() {
    return this.passwordForm.hasError('passwordMismatch') &&
      (this.passwordForm.get('confirmPassword')?.touched || this.passwordForm.get('confirmPassword')?.dirty);
  }

  private passwordMatchValidator(group: AbstractControl): ValidationErrors | null {
    const a = group.get('newPassword')?.value;
    const b = group.get('confirmPassword')?.value;
    if (!a || !b) return null;
    return a === b ? null : { passwordMismatch: true };
  }

  private isoDateOffset(days: number) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  private clearPendingAvatarState() {
    this.pendingAvatarFile = null;
    this.avatarUploadProgress = null;
    this.revokePendingAvatarPreview();
  }

  private revokePendingAvatarPreview() {
    if (this.pendingAvatarPreviewUrl) {
      URL.revokeObjectURL(this.pendingAvatarPreviewUrl);
      this.pendingAvatarPreviewUrl = null;
    }
  }

  private loadUsers() {
    this.listLoading = true;
    this.usersApi
      .usersControllerList<PaginatedUsersResponseDto>(
        {
          page: this.page,
          limit: this.pageSize,
          search: this.query.trim() || undefined,
          role: this.roleFilter !== 'All' ? this.roleFilter : undefined,
          status: this.statusFilter !== 'All' ? this.statusFilter : undefined,
        },
        { params: {} }, // ensure options slot occupied if needed
      )
      .pipe(finalize(() => (this.listLoading = false)))
      .subscribe({
        next: (res) => {
          this.users = (res.data ?? []).map((u) => this.mapUserDto(u));
          this.total = this.extractTotal(res.meta, this.users.length);
        },
        error: (err) => {
          console.error(err);
          this.toast.error('Failed to load users');
        },
      });
  }

  private loadRoles() {
    this.roleLoading = true;
    this.usertypeApi
      .usertypeControllerList<PaginatedUsertypeResponseDto>()
      .pipe(finalize(() => (this.roleLoading = false)))
      .subscribe({
        next: (res) => {
          this.roleOptions = (res.data ?? []).filter((r) => r.is_active);
          // set default role value for form if empty
          if (!this.userForm.get('role')?.value && this.roleOptions.length) {
            this.userForm.patchValue({ role: String(this.roleOptions[0].usertypeid) });
          }
          // refresh role labels on existing list
          this.users = this.users.map((u) => ({
            ...u,
            roleName:
              this.roleOptions.find((r) => String(r.usertypeid) === String(u.roleId))?.usertypename ?? u.roleName,
          }));
        },
        error: (err) => {
          console.error(err);
          this.toast.error('Failed to load roles');
        },
      });
  }

  private mapUserDto(dto: UsersResponseDto): User {
    const dtoRoleName = typeof dto.usertypename === 'string' ? dto.usertypename : undefined;
    const roleName =
      dtoRoleName ??
      this.roleOptions.find((r) => String(r.usertypeid) === String(dto.usertypeid))?.usertypename ??
      '—';
    const lockedUntil = typeof dto.locked_until === 'string' ? dto.locked_until : '';
    const failedLoginAttempts = Number(String(dto.failed_login_attempts ?? '0'));
    return {
      id: String(dto.user_id ?? crypto.randomUUID()),
      name: dto.name ?? dto.email?.split('@')[0] ?? 'User',
      roleId: dto.usertypeid,
      roleName,
      email: dto.email,
      phone: dto.phone,
      address: this.readAddressField(dto.line1),
      postalCode: this.readAddressField(dto.postalcode),
      province: this.readAddressField(dto.province),
      country: this.readAddressField(dto.country),
      status: dto.is_active ? 'Active' : 'Inactive',
      avatarUrl: this.mediaUrlService.resolve(dto.user_pic),
      createdAt: dto.last_login_at ?? this.isoDateOffset(0),
      failedLoginAttempts: Number.isFinite(failedLoginAttempts) ? failedLoginAttempts : 0,
      lockedUntil,
      isLocked: this.isUserLocked(lockedUntil),
    };
  }

  private isUserLocked(lockedUntil: string): boolean {
    const normalized = String(lockedUntil ?? '').trim();
    if (!normalized) return false;
    const parsed = Date.parse(normalized);
    if (Number.isNaN(parsed)) {
      return true;
    }
    return parsed > Date.now();
  }

  private readAddressField(value: unknown): string {
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

  passwordInputType(field: 'new' | 'confirm'): 'text' | 'password' {
    return field === 'new'
      ? this.newPasswordVisible ? 'text' : 'password'
      : this.confirmPasswordVisible ? 'text' : 'password';
  }

  togglePasswordVisibility(field: 'new' | 'confirm') {
    if (field === 'new') {
      this.newPasswordVisible = !this.newPasswordVisible;
      return;
    }
    this.confirmPasswordVisible = !this.confirmPasswordVisible;
  }

  private persistCreateAddress(
    user: UsersResponseDto,
    formValue: ReturnType<typeof this.userForm.getRawValue>,
  ): Observable<UsersResponseDto> {
    const hasAddress =
      formValue.address.trim().length > 0 ||
      formValue.postalCode.trim().length > 0 ||
      formValue.province.trim().length > 0 ||
      formValue.country.trim().length > 0;

    if (!hasAddress) {
      return of(user);
    }

    return this.usersApi.usersControllerUpdate(String(user.user_id), {
      line1: formValue.address.trim() || undefined,
      postalcode: formValue.postalCode.trim() || undefined,
      province: formValue.province.trim() || undefined,
      country: formValue.country.trim() || undefined,
    });
  }

  private extractTotal(meta: unknown, fallback: number): number {
    if (!meta || typeof meta !== 'object') return fallback;
    const m = meta as Record<string, unknown>;
    const keys = ['total', 'count', 'itemCount'];
    for (const k of keys) {
      const v = m[k];
      if (typeof v === 'number') return v;
      if (typeof v === 'string' && !isNaN(Number(v))) return Number(v);
    }
    return fallback;
  }

  changePageSize(size: number) {
    if (this.pageSize === size) return;
    this.pageSize = size;
    this.page = 1;
    this.loadUsers();
  }

  applyFilters() {
    this.page = 1;
    this.loadUsers();
  }

  nextPage() {
    if (this.page * this.pageSize >= this.total) return;
    this.page += 1;
    this.loadUsers();
  }

  prevPage() {
    if (this.page === 1) return;
    this.page -= 1;
    this.loadUsers();
  }
}
