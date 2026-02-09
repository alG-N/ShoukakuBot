FROM python:3.12-alpine

# Install ffmpeg for merging video+audio
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy server code
COPY server.py .

# Create non-root user
RUN adduser -D -u 1001 ytdlp && \
    mkdir -p /downloads && \
    chown ytdlp:ytdlp /downloads

USER ytdlp

EXPOSE 8900

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:8900/health || exit 1

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8900", "--workers", "1"]
