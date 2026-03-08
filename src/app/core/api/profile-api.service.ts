import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { SKIP_AUTH_CONTEXT } from '../auth/auth.context';
import { ProfileDto } from './generated/schemas';

export interface UpdateProfilePayload {
  name?: string;
  email?: string;
  phone?: string;
  location?: string;
  avatarUrl?: string;
}

@Injectable({ providedIn: 'root' })
export class ProfileApiService {
  private readonly http = inject(HttpClient);

  updateAdminProfile(payload: UpdateProfilePayload): Observable<ProfileDto> {
    return this.http.patch<ProfileDto>('/dashboard/profile/admin', payload, {
      context: new HttpContext().set(SKIP_AUTH_CONTEXT, false),
    });
  }
}
