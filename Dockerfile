FROM ghcr.io/c-daly/logos-foundry:0.1.0

WORKDIR /app/apollo

# Copy source code and configuration
COPY src ./src
COPY pyproject.toml poetry.lock ./
COPY config.example.yaml ./config.yaml

# Install Apollo's specific dependencies (SDKs, etc.)
# logos utilities are already available from foundry base
RUN poetry install --only main --no-root --no-interaction --no-ansi

# Expose port
EXPOSE 8003

# Run the API server
CMD ["poetry", "run", "apollo-api"]
