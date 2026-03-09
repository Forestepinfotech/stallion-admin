import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { DashboardService } from './generated/dashboard/dashboard.service';
import { ProfileDto, UpdateAdminDashboardProfileDto } from './generated/schemas/index';

@Injectable({ providedIn: 'root' })
export class ProfileApiService {
  private readonly dashboard = inject(DashboardService);

  updateAdminProfile(payload: UpdateAdminDashboardProfileDto): Observable<ProfileDto> {
    return this.dashboard.dashboardControllerUpdateAdminProfile(payload);
  }
}
