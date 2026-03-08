import { Component, EventEmitter, Output, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AsyncPipe, NgIf } from '@angular/common';
import { Store } from '@ngrx/store';
import { AuthSessionService } from '../../../core/auth/auth-session.service';
import { selectProfile } from '../../../core/state/auth/auth.selectors';

@Component({
  selector: 'app-admin-side-bar',
  imports: [RouterLink, RouterLinkActive, AsyncPipe, NgIf],
  templateUrl: './admin-side-bar.component.html',
  styleUrl: './admin-side-bar.component.css',
})
export class AdminSideBarComponent {
  @Output() close = new EventEmitter<void>();
  @Output() logout = new EventEmitter<void>();
  private readonly session: AuthSessionService = inject(AuthSessionService);
  private readonly store = inject(Store);

  profile$ = this.store.select(selectProfile);

  get adminName(): string {
    const user = this.session.snapshot.user;
    if (user?.email) return user.email.split('@')[0];
    return 'Admin User';
  }

  get adminRole(): string {
    return this.session.snapshot.user?.role ?? 'Administrator';
  }

  get avatarUrl(): string {
    const user = this.session.snapshot.user as any;
    const pic = user?.user_pic ?? user?.avatarUrl;
    if (typeof pic === 'string' && pic.length > 0) return pic;
    return 'assets/images/profile.png';
  }
}
