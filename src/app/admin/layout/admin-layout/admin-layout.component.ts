import { Component } from '@angular/core';
import { HeaderComponent } from "../header/header.component";

import { FooterComponent } from "../footer/footer.component";
import { AdminSideBarComponent } from "../admin-side-bar/admin-side-bar.component";
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [
    CommonModule,
    HeaderComponent,
    RouterOutlet,
    FooterComponent,
    AdminSideBarComponent,
  ],
  templateUrl: './admin-layout.component.html',
  styleUrl: './admin-layout.component.css',
})
export class AdminLayoutComponent {
  sidebarOpen = true; // default visible

  toggleSidebar() {
    this.sidebarOpen = !this.sidebarOpen;
  }
}
