import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { catchError, exhaustMap, map, of, withLatestFrom } from 'rxjs';
import { DashboardService } from '../../api/generated/dashboard/dashboard.service';
import { AuthActions } from './auth.actions';
import { Store } from '@ngrx/store';
import { selectProfile } from './auth.selectors';
import { AuthSessionService } from '../../auth/auth-session.service';

@Injectable()
export class AuthEffects {
  private readonly actions$ = inject(Actions);
  private readonly dashboard = inject(DashboardService);
  private readonly store = inject(Store);
  private readonly session = inject(AuthSessionService);

  loadProfile$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.loadProfile),
      withLatestFrom(this.store.select(selectProfile)),
      exhaustMap(([_, profile]) => {
        if (profile) return of(AuthActions.loadProfileSuccess({ profile }));
        if (!this.session.accessToken) {
          return of(AuthActions.loadProfileFailure({ error: 'Not authenticated' }));
        }
        return this.dashboard.dashboardControllerProfile().pipe(
          map((p) => AuthActions.loadProfileSuccess({ profile: p })),
          catchError((error) =>
            of(AuthActions.loadProfileFailure({ error: error?.message ?? 'Profile load failed' })),
          ),
        );
      }),
    ),
  );
}
