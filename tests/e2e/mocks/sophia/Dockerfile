FROM python:3.11-slim

WORKDIR /app

# Install dependencies and curl for healthcheck
RUN pip install --no-cache-dir --trusted-host pypi.org --trusted-host files.pythonhosted.org flask neo4j && \
    apt-get update && apt-get install -y --no-install-recommends curl && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Copy the mock service (path relative to build context at repo root)
COPY tests/e2e/mocks/sophia/sophia_mock.py .

# Expose port
EXPOSE 8080

# Run the service
CMD ["python", "sophia_mock.py"]
