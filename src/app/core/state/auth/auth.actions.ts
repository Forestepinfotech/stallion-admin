import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { ProfileDto } from '../../api/generated/schemas/index';

export const AuthActions = createActionGroup({
  source: 'Auth',
  events: {
    'Load Profile': emptyProps(),
    'Load Profile Success': props<{ profile: ProfileDto }>(),
    'Load Profile Failure': props<{ error: string }>(),
    'Update Profile Success': props<{ profile: ProfileDto }>(),
    Logout: emptyProps(),
  },
});
