import { HttpContextToken } from '@angular/common/http';

export const SKIP_AUTH_CONTEXT = new HttpContextToken<boolean>(() => false);
export const TREAT_AS_REFRESH_CONTEXT = new HttpContextToken<boolean>(() => false);
