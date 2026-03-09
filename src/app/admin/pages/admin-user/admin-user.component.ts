import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
  AbstractControl,
  ValidationErrors,
} from '@angular/forms';
import { UsersService } from '../../../core/api/generated/users/users.service';
import { UsertypeService } from '../../../core/api/generated/usertype/usertype.service';
import {
  CreateUsersDto,
  PaginatedUsersResponseDto,
  PaginatedUsertypeResponseDto,
  UpdateUsersDto,
  UsersResponseDto,
  UsertypeResponseDto,
} from '../../../core/api/generated/schemas/index';
import { ToastService } from '../../../core/notification/toast.service';
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
};
@Component({
  selector: 'app-admin-user',
  imports: [CommonModule, FormsModule, ReactiveFormsModule, SkeletonPanelComponent],
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

  selected: User | null = null;
  editMode: 'create' | 'edit' = 'create';

  // ===== Data =====
  users: User[] = [];
  roleOptions: RoleOption[] = [];
  listLoading = true;
  roleLoading = true;
  savingUser = false;
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
    });

    this.editOpen = true;
  }

  openEdit(u: User) {
    this.editMode = 'edit';
    this.selected = u;

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
    });

    this.editOpen = true;
  }

  closeEdit() {
    this.editOpen = false;
    this.selected = null;
  }

  saveUser() {
    if (this.userForm.invalid) {
      this.userForm.markAllAsTouched();
      return;
    }

    const v = this.userForm.getRawValue();
    const emailLower = v.email.trim().toLowerCase();
    const payloadCommon = {
      name: v.name.trim(),
      email: emailLower,
      phone: v.phone.trim(),
      usertypeid: v.role,
      user_pic: v.avatarUrl ?? '',
      is_email_verified: true,
      email_subscribed: true,
      is_active: v.status === 'Active',
      is_deleted: false,
      failed_login_attempts: '0',
      locked_until: '',
      updated_by: 'admin',
    } satisfies Partial<CreateUsersDto & UpdateUsersDto>;

    this.savingUser = true;

    const request$ =
      this.editMode === 'create'
        ? this.usersApi.usersControllerCreate({
            ...(payloadCommon as Partial<CreateUsersDto> & { name?: string }),
            created_by: 'admin',
            // optional fields managed by backend defaults
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
      )
      .subscribe({
      next: () => {
        this.toast.success('User saved');
        this.closeEdit();
        this.loadUsers();
      },
      error: (err) => {
        console.error(err);
        this.toast.error('Failed to save user');
      },
      complete: () => (this.savingUser = false),
    });
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

    const v = this.passwordForm.getRawValue();

    // Call backend API: POST /admin/users/:id/change-password
    console.log('Change password for user:', this.selected?.id, 'newPass:', v.newPassword);

    this.closePassword();
    alert('Password updated (demo). Connect backend API here.');
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
    this.usersApi.usersControllerRemove(id).subscribe({
      next: () => {
        this.users = this.users.filter((u) => u.id !== id);
        this.toast.success('User deleted');
        this.closeDelete();
      },
      error: (err) => {
        console.error(err);
        this.toast.error('Failed to delete user');
      },
      complete: () => (this.deleting = false),
    });
  }

  // Avatar upload (optional)
  async onAvatarChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return;

    const base64 = await this.fileToBase64(file);
    this.userForm.patchValue({ avatarUrl: base64 });
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = reject;
      r.readAsDataURL(file);
    });
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
      .subscribe({
      next: (res) => {
        this.users = (res.data ?? []).map((u) => this.mapUserDto(u));
        this.total = this.extractTotal(res.meta, this.users.length);
      },
      error: (err) => {
        console.error(err);
        this.toast.error('Failed to load users');
        this.listLoading = false;
      },
      complete: () => (this.listLoading = false),
    });
  }

  private loadRoles() {
    this.roleLoading = true;
    this.usertypeApi.usertypeControllerList<PaginatedUsertypeResponseDto>().subscribe({
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
        this.roleLoading = false;
      },
      complete: () => (this.roleLoading = false),
    });
  }

  private mapUserDto(dto: UsersResponseDto): User {
    const dtoRoleName = typeof dto.usertypename === 'string' ? dto.usertypename : undefined;
    const roleName =
      dtoRoleName ??
      this.roleOptions.find((r) => String(r.usertypeid) === String(dto.usertypeid))?.usertypename ??
      '—';
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
      avatarUrl: dto.user_pic,
      createdAt: dto.last_login_at ?? this.isoDateOffset(0),
    };
  }

  private readAddressField(value: unknown): string {
    return typeof value === 'string' ? value : '';
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
      updated_by: 'admin',
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
