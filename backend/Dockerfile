FROM python:3.13-slim

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends gcc libxml2-dev libxslt1-dev && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt requirements-local-ai.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Optional: install local FLAN AI dependencies (~2GB+)
# Build with --build-arg INSTALL_LOCAL_AI=true to include them
ARG INSTALL_LOCAL_AI=false
RUN if [ "$INSTALL_LOCAL_AI" = "true" ]; then \
      pip install --no-cache-dir -r requirements-local-ai.txt; \
    fi

COPY . .

RUN mkdir -p osint_results

EXPOSE 5000

ENV MONGO_URI=mongodb://mongo:27017/
ENV JWT_SECRET=change-me-in-production
ENV FLASK_DEBUG=false

CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:5000 --workers ${GUNICORN_WORKERS:-2} --timeout ${GUNICORN_TIMEOUT:-300} app:app"]
