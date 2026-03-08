import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators, AbstractControl, ValidationErrors } from '@angular/forms';

type Profile = {
  name: string;
  role: string;
  email: string;
  phone: string;
  location: string;
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
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './admin-profile.component.html',
  styleUrl: './admin-profile.component.css',
})
export class AdminProfileComponent {
  // ======== DATA (replace later from backend) ========
  profile: Profile = {
    name: 'Admin User',
    role: 'Administrator',
    email: 'admin@example.com',
    phone: '+1 (000) 000-0000',
    location: 'Edmonton, AB',
    joined: '2025-01-12',
    avatarUrl: 'assets/images/profile.png',
  };

  stats = [
    { label: 'Orders Managed', value: 1284 },
    { label: 'Products', value: 342 },
    { label: 'Coupons', value: 27 },
    { label: 'Revenue', value: '$142,800' },
  ];

  activityStats = [
    { label: 'This week', value: 12 },
    { label: 'This month', value: 48 },
    { label: 'Avg/day', value: 3 },
  ];

  recentActivity: Activity[] = [
    {
      type: 'coupon',
      title: 'Created coupon',
      desc: 'WELCOME10 • 10% off (limit 200)',
      time: '2 hours ago',
    },
    {
      type: 'product',
      title: 'Added product',
      desc: 'Tire • SKU: TIRE-20555R16-MIC',
      time: 'Yesterday',
    },
    {
      type: 'order',
      title: 'Order updated',
      desc: 'Order #10293 marked as Shipped',
      time: '2 days ago',
    },
    {
      type: 'profile',
      title: 'Profile updated',
      desc: 'Phone number changed',
      time: '1 week ago',
    },
  ];

  // ======== UI STATE ========
  editOpen = false;
  passwordOpen = false;

  // ======== FORMS ========
  editForm;
  passwordForm;

  constructor(private fb: FormBuilder) {
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
      location: this.fb.nonNullable.control(this.profile.location, [
        Validators.required,
        Validators.minLength(2),
      ]),
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

  // ======== MODALS ========
  openEdit() {
    this.editForm.reset({
      name: this.profile.name,
      email: this.profile.email,
      phone: this.profile.phone,
      location: this.profile.location,
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

    // Update local state (replace with API call)
    this.profile = {
      ...this.profile,
      name: v.name,
      email: v.email,
      phone: v.phone,
      location: v.location,
      avatarUrl: v.avatarUrl ?? '',
    };

    // add activity entry
    this.recentActivity = [
      {
        type: 'profile',
        title: 'Profile updated',
        desc: 'Profile details updated',
        time: 'Just now',
      },
      ...this.recentActivity,
    ];

    this.closeEdit();
    alert('Profile updated (demo). Connect backend API here.');
  }

  changePassword() {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }

    const v = this.passwordForm.getRawValue();

    // Call backend API here:
    // POST /auth/change-password { currentPassword, newPassword }
    console.log('Change password payload:', {
      currentPassword: v.currentPassword,
      newPassword: v.newPassword,
    });

    // add activity entry
    this.recentActivity = [
      {
        type: 'profile',
        title: 'Password changed',
        desc: 'Account password updated',
        time: 'Just now',
      },
      ...this.recentActivity,
    ];

    this.closePassword();
    alert('Password changed (demo). Connect backend API here.');
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
    alert('View all activity (demo). Add pagination / route later.');
  }

  openActivity(a: Activity) {
    alert(`Open: ${a.title} (demo). Route to details page later.`);
  }

  activityDetails(a: Activity) {
    alert(`Details: ${a.desc} (demo).`);
  }
}