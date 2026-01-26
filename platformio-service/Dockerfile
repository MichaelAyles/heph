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

# Pre-install ESP32 platform and Arduino framework to speed up first compile
# This downloads ~500MB of toolchains but makes container starts faster
RUN platformio platform install espressif32 --with-package framework-arduinoespressif32
RUN platformio platform update

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm install --production

# Copy compiled code
COPY dist/ ./dist/

# Create temp directories
RUN mkdir -p /tmp/uploads /tmp/pio-build

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Run the server
CMD ["node", "dist/index.js"]
