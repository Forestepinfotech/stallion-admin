import { Component, EventEmitter, Output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-admin-side-bar',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './admin-side-bar.component.html',
  styleUrl: './admin-side-bar.component.css',
})
export class AdminSideBarComponent {
  @Output() close = new EventEmitter<void>();
  @Output() logout = new EventEmitter<void>();
  adminName = 'Admin User';
}
