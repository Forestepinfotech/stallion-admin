import { APP_INITIALIZER, Provider } from '@angular/core';
import { RuntimeConfigService } from './runtime-config.service';

export function provideRuntimeConfig(): Provider[] {
  return [
    {
      provide: APP_INITIALIZER,
      multi: true,
      useFactory: (service: RuntimeConfigService) => () => service.load(),
      deps: [RuntimeConfigService],
    },
  ];
}
