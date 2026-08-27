"""Make both legacy ``app`` and canonical ``backend.app`` imports testable."""

import os
import sys
from pathlib import Path

from fastapi_cache import FastAPICache
from fastapi_cache.backends.inmemory import InMemoryBackend


os.environ.setdefault(
    "SECRET_KEY", "test-only-jwt-secret-key-32-characters-minimum"
)


BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = BACKEND_ROOT.parent

for path in (str(REPOSITORY_ROOT), str(BACKEND_ROOT)):
    if path not in sys.path:
        sys.path.insert(0, path)


FastAPICache.init(InMemoryBackend(), prefix="test-cache")
