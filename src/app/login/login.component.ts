import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
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
      // TODO: replace with your auth call
      await new Promise((r) => setTimeout(r, 700));
      console.log('login', { username, password });
      this.router.navigateByUrl('/admin');
    } catch (e) {
      this.error = 'Login failed. Please try again.';
    } finally {
      this.loading = false;
    }
  }
}