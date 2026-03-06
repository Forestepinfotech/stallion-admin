
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Role } from '../types/role.type';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private roleSubject = new BehaviorSubject<Role | null>(this.getStoredRole());
  role$ = this.roleSubject.asObservable();

  get role(): Role | null {
    return this.roleSubject.value;
  }

  get isLoggedIn(): boolean {
    return !!this.role;
  }

  login(role: Role) {
    localStorage.setItem('role', role);
    this.roleSubject.next(role);
  }

  logout() {
    localStorage.removeItem('role');
    this.roleSubject.next(null);
  }

  private getStoredRole(): Role | null {
    const r = localStorage.getItem('role') as Role | null;
    return r === 'admin' || r === 'manager' || r === 'staff' ? r : null;
  }
}
