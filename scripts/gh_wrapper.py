#!/usr/bin/env python3
"""Simple wrapper for git/gh commands to work with enforcement hooks."""
import subprocess
import sys


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 gh_wrapper.py <command> [args...]")
        print("Example: python3 gh_wrapper.py git status")
        sys.exit(1)

    # Join all arguments as the command
    cmd = sys.argv[1:]

    # Execute the command
    result = subprocess.run(cmd, capture_output=False, text=True)
    sys.exit(result.returncode)


if __name__ == "__main__":
    main()
