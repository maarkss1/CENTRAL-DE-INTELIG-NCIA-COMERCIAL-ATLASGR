FROM pgvector/pgvector:pg16

RUN apt-get update \
    && apt-get install --yes --no-install-recommends postgresql-16-postgis-3 \
    && rm -rf /var/lib/apt/lists/*
