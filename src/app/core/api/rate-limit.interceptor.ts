import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

export const rateLimitInterceptor: HttpInterceptorFn = (req, next) =>
  next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 429) {
        console.warn('Request rate-limited', { url: req.url });
        // Hook a user-facing notification service here if desired.
      }
      return throwError(() => error);
    }),
  );
