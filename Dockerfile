FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy poetry files
COPY pyproject.toml ./

# Install poetry
RUN pip install poetry

# Install dependencies
RUN poetry config virtualenvs.create false && \
    poetry install --no-interaction --no-ansi --no-root

# Copy source code
COPY src ./src
COPY config.example.yaml ./config.yaml

# Install the package
RUN poetry install --no-interaction --no-ansi

# Expose port
EXPOSE 8003

# Run the API server
CMD ["poetry", "run", "apollo-api"]
