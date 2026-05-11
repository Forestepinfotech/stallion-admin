/**
 * Type hint for the runtime config JSON. Not required at runtime.
 */
import { RuntimeConfig } from './runtime-config.model';
declare module '/assets/runtime-config.json' {
  const value: RuntimeConfig;
  export default value;
}
