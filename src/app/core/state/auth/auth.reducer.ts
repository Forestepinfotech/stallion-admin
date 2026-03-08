import { createReducer, on } from '@ngrx/store';
import { ProfileDto } from '../../api/generated/schemas';
import { AuthActions } from './auth.actions';

export interface AuthState {
  profile: ProfileDto | null;
  loading: boolean;
  error?: string | null;
}

export const initialAuthState: AuthState = {
  profile: null,
  loading: false,
  error: null,
};

export const authReducer = createReducer(
  initialAuthState,
  on(AuthActions.loadProfile, (state) => ({ ...state, loading: true, error: null })),
  on(AuthActions.loadProfileSuccess, (state, { profile }) => ({
    ...state,
    profile,
    loading: false,
    error: null,
  })),
  on(AuthActions.loadProfileFailure, (state, { error }) => ({
    ...state,
    loading: false,
    error,
  })),
  on(AuthActions.logout, () => initialAuthState),
);
