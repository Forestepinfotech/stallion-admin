import { isDevMode } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

if (!isDevMode()) {
  const noop = () => undefined;
  console.log = noop;
  console.info = noop;
  console.warn = noop;
  console.error = noop;
  console.debug = noop;
}

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => {
    if (isDevMode()) {
      console.error(err);
    }
  });
