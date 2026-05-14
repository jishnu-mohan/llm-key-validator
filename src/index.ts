import { registerBuiltInProviders } from "./providers/index.js";

registerBuiltInProviders();

export { validateKey, validateKeys, normalizeKey } from "./core/validate.js";
export {
  registerProvider,
  unregisterProvider,
  getProvider,
  listProviders,
  detectProvider,
} from "./core/registry.js";
export type {
  Provider,
  ProviderRawResult,
  ValidationContext,
  ValidationOptions,
  ValidationResult,
  ValidationFailureReason,
} from "./core/types.js";
export { builtInProviders, registerBuiltInProviders } from "./providers/index.js";
