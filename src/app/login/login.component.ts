import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthSessionService } from '../core/auth/auth-session.service';
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
  form = this.fb.group({
    username: ['', [Validators.required]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  constructor() {}

  isInvalid(controlName: 'username' | 'password') {
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
      const { username, password } = this.form.value;
      await firstValueFrom(
        this.auth.login({
          username: username ?? '',
          password: password ?? '',
        }),
      );
      this.router.navigateByUrl('/admin');
    } catch (e) {
      this.error = 'Login failed. Please try again.';
    } finally {
      this.loading = false;
    }
  }
}
