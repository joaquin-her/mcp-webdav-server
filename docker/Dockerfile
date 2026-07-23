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

# Persisted OAuth state (registered clients, tokens) lives here — mount a
# volume at this path so it survives restarts/redeploys.
RUN mkdir -p /data
VOLUME ["/data"]

# Set environment variables
ENV NODE_ENV=production
ENV STATE_FILE_PATH=/data/oauth-state.json

# Run with HTTP transport by default
CMD ["node", "dist/index.js", "--http"]
