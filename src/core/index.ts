// Tree-shakable entry: core validation primitives without auto-registering any providers.
// Pair this with `llm-key-validator/providers` and pass `providers: [...]` to `validateKey`.

export {
  detectProvider,
  getProvider,
  listProviders,
  registerProvider,
  unregisterProvider,
} from "./registry.js";
export type {
  Provider,
  ProviderRawResult,
  ValidationContext,
  ValidationFailureReason,
  ValidationOptions,
  ValidationResult,
} from "./types.js";
export { normalizeKey, validateKey, validateKeys } from "./validate.js";
