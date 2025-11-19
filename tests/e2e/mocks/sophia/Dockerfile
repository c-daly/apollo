FROM python:3.11-slim

WORKDIR /app

# Install dependencies
RUN pip install --no-cache-dir flask neo4j

# Copy the mock service
COPY sophia_mock.py .

# Expose port
EXPOSE 8080

# Run the service
CMD ["python", "sophia_mock.py"]
