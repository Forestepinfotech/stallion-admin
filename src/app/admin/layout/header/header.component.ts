import { Component, EventEmitter, inject, Input, Output } from '@angular/core';
import { AuthService } from '../../../core/auth/auth.servies';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-header',
  imports: [CommonModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.css',
})
export class HeaderComponent {
  @Input() sidebarOpen = true;
  @Output() toggleSidebar = new EventEmitter<void>();
  private auth = inject(AuthService);
  private router = inject(Router);

  logout() {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }
}
