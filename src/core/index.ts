// Tree-shakable entry: core validation primitives without auto-registering any providers.
// Pair this with `llm-key-validator/providers` and pass `providers: [...]` to `validateKey`.
export { validateKey, validateKeys, normalizeKey } from "./validate.js";
export {
  registerProvider,
  unregisterProvider,
  getProvider,
  listProviders,
  detectProvider,
} from "./registry.js";
export type {
  Provider,
  ProviderRawResult,
  ValidationContext,
  ValidationOptions,
  ValidationResult,
  ValidationFailureReason,
} from "./types.js";
