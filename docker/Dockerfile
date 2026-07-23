FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source files
COPY tsconfig.json ./
COPY src ./src

# Build the application
RUN npm run build

# Expose the default port
EXPOSE 3000

# Persisted OAuth state (registered clients, tokens) lives here. Railway
# rejects the Docker VOLUME instruction — mount a Railway Volume at this
# path from the dashboard instead (Settings > Volumes) for it to survive
# restarts/redeploys; on other Docker hosts, `docker run -v` a volume here.
RUN mkdir -p /data

# Set environment variables
ENV NODE_ENV=production
ENV STATE_FILE_PATH=/data/oauth-state.json

# Run with HTTP transport by default
CMD ["node", "dist/index.js", "--http"]
