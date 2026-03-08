import { createFeatureSelector, createSelector } from '@ngrx/store';
import { AuthState } from './auth.reducer';

export const selectAuthState = createFeatureSelector<AuthState>('auth');

export const selectProfile = createSelector(selectAuthState, (state) => state.profile);
export const selectProfileLoading = createSelector(selectAuthState, (state) => state.loading);
export const selectProfileError = createSelector(selectAuthState, (state) => state.error);
export const selectUserRole = createSelector(
  selectAuthState,
  (state) => state.profile?.user?.usertypename ?? state.profile?.user?.usertypeid,
);
