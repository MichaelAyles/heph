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

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm install --production

# Copy compiled code
COPY dist/ ./dist/

# Create temp directories
RUN mkdir -p /tmp/uploads /tmp/kicad

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Run the server
CMD ["node", "dist/index.js"]
