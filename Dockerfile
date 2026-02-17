FROM ghcr.io/c-daly/logos-foundry:0.4.2

WORKDIR /app/apollo

# Copy source code and configuration
COPY src ./src
COPY pyproject.toml poetry.lock README.md ./

# Install Apollo's specific dependencies (SDKs, etc.) and Apollo itself
# logos utilities are already available from foundry base
RUN poetry install --only main --no-interaction --no-ansi

# Expose port
EXPOSE 27000

# Run the API server
CMD ["sh", "-c", "uvicorn apollo.api.server:app --host 0.0.0.0 --port ${APOLLO_PORT:-27000}"]
