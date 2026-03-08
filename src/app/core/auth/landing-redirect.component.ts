import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, firstValueFrom, map, of } from 'rxjs';
import { AuthSessionService } from './auth-session.service';

@Component({
  selector: 'app-landing-redirect',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="min-h-screen flex items-center justify-center">
      <div class="flex flex-col items-center gap-3 text-gray-700">
        <span class="inline-block h-10 w-10 border-4 border-gray-300 border-t-black rounded-full animate-spin"></span>
        <span class="text-sm font-medium">Redirecting...</span>
      </div>
    </div>
  `,
})
export class LandingRedirectComponent implements OnInit {
  private readonly session = inject(AuthSessionService);
  private readonly router = inject(Router);

  async ngOnInit(): Promise<void> {
    const tokens = this.session.snapshot.tokens;

    if (tokens && !this.session.isAccessTokenExpired()) {
      this.router.navigateByUrl('/admin');
      return;
    }

    if (tokens) {
      try {
        await firstValueFrom(
          this.session.refreshTokens().pipe(
            map(() => true),
            catchError(() => of(false)),
          ),
        );
        this.router.navigateByUrl('/admin');
        return;
      } catch {
        // fall through to login
      }
    }

    this.router.navigateByUrl('/login');
  }
}
