# PlatformIO Compile Service
# Compiles ESP32 firmware from source files

FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20.x
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Install PlatformIO
RUN pip install --no-cache-dir platformio

# Pre-install ESP32 platforms (downloads ~1GB of toolchains)
# Pioarduino fork for ESP32-C6 Arduino 3.x support
RUN platformio platform install https://github.com/pioarduino/platform-espressif32/releases/download/51.03.07/platform-espressif32.zip
# Official espressif32@6.5.0 for stable ESP32/S3 support
RUN platformio platform install espressif32@6.5.0 --with-package framework-arduinoespressif32

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including dev for TypeScript)
RUN npm install

# Copy source code
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Remove dev dependencies
RUN npm prune --production

# Create non-root runtime user
RUN groupadd --system appuser && useradd --system --gid appuser --home /home/appuser --create-home appuser

# Copy PlatformIO toolchains to appuser home so pio can find them at runtime
RUN cp -r /root/.platformio /home/appuser/.platformio && chown -R appuser:appuser /home/appuser/.platformio

# Create temp directories with correct ownership
RUN mkdir -p /tmp/uploads /tmp/pio-build && chown -R appuser:appuser /tmp/uploads /tmp/pio-build

# Expose port
EXPOSE 3000

# Switch to non-root user for runtime
USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Run the server
CMD ["node", "dist/index.js"]
