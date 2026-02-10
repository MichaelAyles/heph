# Use official KiCad image as base
FROM kicad/kicad:9.0

# Switch to root for installing packages
USER root

# Create apt lists directory and install Node.js 20.x
RUN mkdir -p /var/lib/apt/lists/partial && \
    apt-get update && apt-get install -y curl gnupg && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files needed for dependency install/build
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies (including dev deps for TypeScript compilation)
RUN npm ci

# Copy source and build
COPY src/ ./src/
RUN npm run build

# Remove dev dependencies to keep runtime image smaller
RUN npm prune --omit=dev

# Create non-root runtime user
RUN groupadd --system appuser && useradd --system --gid appuser appuser

# Create temp directories with correct ownership
RUN mkdir -p /tmp/uploads /tmp/kicad && chown -R appuser:appuser /tmp/uploads /tmp/kicad

# Expose port
EXPOSE 3000

# Switch to non-root user for runtime
USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD sh -c 'curl -f "http://localhost:${PORT:-3000}/health" || exit 1'

# Run the server
CMD ["node", "dist/index.js"]
