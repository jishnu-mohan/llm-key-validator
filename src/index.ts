import { registerBuiltInProviders } from "./providers/index.js";

registerBuiltInProviders();

export {
  detectProvider,
  getProvider,
  listProviders,
  registerProvider,
  unregisterProvider,
} from "./core/registry.js";
export type {
  Provider,
  ProviderRawResult,
  ValidationContext,
  ValidationFailureReason,
  ValidationOptions,
  ValidationResult,
} from "./core/types.js";
export { normalizeKey, validateKey, validateKeys } from "./core/validate.js";
export { builtInProviders, registerBuiltInProviders } from "./providers/index.js";
