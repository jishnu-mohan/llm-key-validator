from __future__ import annotations

from .types import Provider

_registry: dict[str, Provider] = {}


def register_provider(provider: Provider) -> None:
    _registry[provider.name] = provider


def unregister_provider(name: str) -> bool:
    return _registry.pop(name, None) is not None


def get_provider(name: str) -> Provider | None:
    return _registry.get(name)


def list_providers() -> list[Provider]:
    return list(_registry.values())


def detect_provider(key: str) -> Provider | None:
    for provider in _registry.values():
        if provider.detect(key):
            return provider
    return None
