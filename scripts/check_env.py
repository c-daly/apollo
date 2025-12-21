#!/usr/bin/env python3
"""
Environment Validation Script for LOGOS/Apollo.

This script checks for the existence of a .env file (or environment variables)
and validates that all required configuration keys are present and correctly formatted.
It is used by start_demo.sh to fail fast if the environment is not configured.
"""

import os
import sys
from pathlib import Path
from typing import Optional
import logging

# Try to import the env module for repo root resolution
try:
    from apollo.env import get_repo_root

    HAS_ENV_MODULE = True
except ImportError:
    HAS_ENV_MODULE = False

# Try to import python-dotenv, but don't fail if missing (fallback to os.environ)
try:
    from dotenv import load_dotenv

    HAS_DOTENV = True
except ImportError:
    HAS_DOTENV = False

# Configure logging
logging.basicConfig(level=logging.INFO, format="[check_env] %(message)s")
logger = logging.getLogger("check_env")

# Required variables that must be present
REQUIRED_VARS = [
    "OPENAI_API_KEY",
]

# Optional variables with defaults (for information/validation only)
OPTIONAL_VARS = {
    "HERMES_HOST": "0.0.0.0",
    "HERMES_PORT": "17000",
    "APOLLO_HOST": "0.0.0.0",
    "APOLLO_PORT": "27000",
    "NEO4J_URI": "bolt://localhost:7687",
    "MILVUS_HOST": "localhost",
    "MILVUS_PORT": "19530",
}


def validate_env(env_path: Optional[Path] = None) -> bool:
    """Validate the environment configuration."""

    if HAS_DOTENV:
        if env_path and env_path.exists():
            logger.info(f"Loading configuration from {env_path}")
            load_dotenv(env_path)
        else:
            logger.info("No .env file found, checking active environment variables.")
    else:
        logger.warning(
            "python-dotenv not installed. Relying on existing environment variables."
        )

    missing_vars = []
    for var in REQUIRED_VARS:
        value = os.getenv(var)
        if not value or not value.strip():
            missing_vars.append(var)

    if missing_vars:
        logger.error("❌ Missing required environment variables:")
        for var in missing_vars:
            logger.error(f"   - {var}")

        if env_path and not env_path.exists():
            logger.info(
                f"\n💡 Tip: Copy {env_path.with_suffix('.example')} to {env_path} and fill in the values."
            )

        return False

    logger.info("✅ Required environment variables present.")

    # Print summary of configuration
    logger.info("\nConfiguration Summary:")
    all_vars = list(REQUIRED_VARS) + list(OPTIONAL_VARS.keys())
    for var in all_vars:
        val = os.getenv(var)
        if not val and var in OPTIONAL_VARS:
            val = f"{OPTIONAL_VARS[var]} (default)"
        elif var == "OPENAI_API_KEY":
            val = "********" + val[-4:] if val and len(val) > 4 else "********"

        logger.info(f"   {var:<20}: {val}")

    return True


def main():
    # Resolve project root - prefer env module, fallback to path traversal
    if HAS_ENV_MODULE:
        project_root = get_repo_root()
    else:
        # Fallback: assume .env is in the project root (parent of scripts/)
        script_dir = Path(__file__).parent.resolve()
        project_root = script_dir.parent
    env_file = project_root / ".env"

    if not validate_env(env_file):
        sys.exit(1)

    sys.exit(0)


if __name__ == "__main__":
    main()
