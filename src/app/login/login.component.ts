import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthSessionService } from '../core/auth/auth-session.service';
import { ToastService } from '../core/notification/toast.service';
@Component({
  selector: 'app-login',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
  standalone: true,
})
export class LoginComponent {
  loading = false;
  error = '';
  private fb = inject(FormBuilder);
  private auth = inject(AuthSessionService);
  private toast = inject(ToastService);
  form = this.fb.group({
    identifier: ['', [Validators.required]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  constructor() {}

  isInvalid(controlName: 'identifier' | 'password') {
    const c = this.form.get(controlName);
    return !!c && c.invalid && (c.dirty || c.touched);
  }
  private router = inject(Router);
  async onSubmit() {
    this.error = '';
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading = true;
    try {
      const { identifier, password } = this.form.value;
      await firstValueFrom(
        this.auth.login({
          identifier: identifier ?? '',
          password: password ?? '',
        }),
      );
      this.router.navigateByUrl('/dashboard');
    } catch (e) {
      const msg =
        (e as any)?.error?.message ||
        (e as Error)?.message ||
        'Login failed. Please try again.';
      this.error = msg;
      this.toast.error(msg, 'Login failed');
    } finally {
      this.loading = false;
    }
  }
}
