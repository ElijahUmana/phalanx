# Demo input for src/lib/chainguard/dfc.ts.
# Deliberately uses a stock python:3.11 base image (known CVEs at any given week)
# plus outdated pip dependencies to produce a visible DFC conversion diff.

FROM python:3.11

RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir \
    flask==2.0.0 \
    requests==2.26.0 \
    pyjwt==2.1.0

COPY . .

EXPOSE 8000

CMD ["python", "app.py"]
