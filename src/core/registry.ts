import type { Provider } from "./types.js";

const registry = new Map<string, Provider>();

export function registerProvider(provider: Provider): void {
  registry.set(provider.name, provider);
}

export function unregisterProvider(name: string): boolean {
  return registry.delete(name);
}

export function getProvider(name: string): Provider | undefined {
  return registry.get(name);
}

export function listProviders(): Provider[] {
  return Array.from(registry.values());
}

export function detectProvider(key: string): Provider | undefined {
  for (const provider of registry.values()) {
    if (provider.detect(key)) return provider;
  }
  return undefined;
}
