#!/usr/bin/env bash

# Colors for logging
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

check_command() {
    if ! command -v "$1" &> /dev/null; then
        log_error "Command '$1' not found. Please install it."
        return 1
    fi
}

check_port() {
    local port=$1
    local name=$2
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null ; then
        log_warn "Port $port ($name) is already in use."
        return 1
    fi
    return 0
}

get_pid_status() {
    local pid_file=$1
    if [[ -f "$pid_file" ]]; then
        local pid=$(cat "$pid_file")
        if ps -p "$pid" > /dev/null 2>&1; then
            echo "running ($pid)"
            return 0
        else
            echo "stale pid file"
            return 1
        fi
    else
        echo "not running"
        return 2
    fi
}
