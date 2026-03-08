import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
  AbstractControl,
  ValidationErrors,
} from '@angular/forms';

type Role = 'Manager' | 'Staff';
type Status = 'Active' | 'Inactive';

type User = {
  id: string;
  name: string;
  role: Role;
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
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './admin-user.component.html',
  styleUrl: './admin-user.component.css',
})
export class AdminUserComponent {


  // ===== UI =====
  query = '';
  roleFilter: 'All' | Role = 'All';
  statusFilter: 'All' | Status = 'All';

  editOpen = false;
  passwordOpen = false;
  deleteOpen = false;

  selected: User | null = null;
  editMode: 'create' | 'edit' = 'create';

  // ===== Data (demo) =====
  users: User[] = [
    {
      id: crypto.randomUUID(),
      name: 'Ahmed Raza',
      role: 'Manager',
      email: 'ahmed.manager@example.com',
      phone: '+1 780 000 1111',
      address: 'Edmonton, AB',
      status: 'Active',
      avatarUrl: 'assets/images/profile.png',
      createdAt: this.isoDateOffset(-40),
    },
    {
      id: crypto.randomUUID(),
      name: 'Sara Khan',
      role: 'Staff',
      email: 'sara.staff@example.com',
      phone: '+1 587 222 3333',
      address: 'Calgary, AB',
      status: 'Active',
      avatarUrl: 'assets/images/profile.png',
      createdAt: this.isoDateOffset(-20),
    },
    {
      id: crypto.randomUUID(),
      name: 'John Smith',
      role: 'Staff',
      email: 'john.staff@example.com',
      phone: '+1 403 444 5555',
      address: 'Red Deer, AB',
      status: 'Inactive',
      avatarUrl: 'assets/images/profile.png',
      createdAt: this.isoDateOffset(-12),
    },
  ];

  // ===== Forms =====
  userForm;
  passwordForm;

  constructor(private fb: FormBuilder) {
    this.userForm = this.fb.nonNullable.group({
      name: this.fb.nonNullable.control('', [Validators.required, Validators.minLength(2)]),
      role: this.fb.nonNullable.control<Role>('Staff', Validators.required),
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

  // ===== Derived list =====
  get filtered(): User[] {
    const q = this.query.trim().toLowerCase();

    return this.users
      .filter((u) => {
        const matchesQuery =
          !q ||
          u.name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u.phone.toLowerCase().includes(q) ||
          u.role.toLowerCase().includes(q);

        const matchesRole = this.roleFilter === 'All' ? true : u.role === this.roleFilter;
        const matchesStatus = this.statusFilter === 'All' ? true : u.status === this.statusFilter;

        return matchesQuery && matchesRole && matchesStatus;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  // ===== Actions =====
  openCreate() {
    this.editMode = 'create';
    this.selected = null;

    this.userForm.reset({
      name: '',
      role: 'Staff',
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
      role: u.role,
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

    // Simple duplicate email check (demo)
    const emailLower = v.email.trim().toLowerCase();
    const conflict = this.users.some((x) => x.email.toLowerCase() === emailLower && x.id !== this.selected?.id);
    if (conflict) {
      alert('Email already exists.');
      return;
    }

    if (this.editMode === 'create') {
      const newUser: User = {
        id: crypto.randomUUID(),
        name: v.name.trim(),
        role: v.role,
        email: emailLower,
      phone: v.phone.trim(),
      address: v.address?.trim(),
      postalCode: v.postalCode?.trim(),
      province: v.province?.trim(),
      country: v.country?.trim(),
      status: v.status,
      avatarUrl: v.avatarUrl ?? '',
      createdAt: this.isoDateOffset(0),
      };
      this.users = [newUser, ...this.users];
    } else {
      const id = this.selected!.id;
      this.users = this.users.map((u) =>
        u.id === id
          ? {
              ...u,
              name: v.name.trim(),
              role: v.role,
              email: emailLower,
              phone: v.phone.trim(),
              address: v.address?.trim(),
              postalCode: v.postalCode?.trim(),
              province: v.province?.trim(),
              country: v.country?.trim(),
              status: v.status,
              avatarUrl: v.avatarUrl ?? '',
            }
          : u
      );
    }

    this.closeEdit();
    alert('Saved (demo). Connect backend API here.');
  }

  // Active/Inactive checkbox
  toggleActive(u: User, checked: boolean) {
    const newStatus: Status = checked ? 'Active' : 'Inactive';
    this.users = this.users.map((x) => (x.id === u.id ? { ...x, status: newStatus } : x));
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
    this.users = this.users.filter((u) => u.id !== this.selected!.id);
    this.closeDelete();
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
  badgeRole(role: Role) {
    return role === 'Manager'
      ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
      : 'bg-emerald-50 text-emerald-700 border-emerald-200';
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
}
