FROM python:3.11-slim

WORKDIR /app

# Install dependencies (with SSL bypass for sandboxed environments)
RUN pip install --no-cache-dir --trusted-host pypi.org --trusted-host files.pythonhosted.org flask neo4j

# Copy the mock service
COPY sophia_mock.py .

# Expose port
EXPOSE 8080

# Run the service
CMD ["python", "sophia_mock.py"]
