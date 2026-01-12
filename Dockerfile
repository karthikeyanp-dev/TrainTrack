# Use the official Node.js image
FROM node:20-slim

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --only=production --ignore-scripts

# Copy the rest of your app source code
# (This includes the .env file we will generate in GitHub Actions)
COPY . .

# Build the Next.js app
# This is where NEXT_PUBLIC_ vars get baked in!
RUN npm run build

# Set environment variables for Cloud Run
ENV NODE_ENV=production
ENV HOSTNAME="0.0.0.0"
ENV PORT=8080
ENV NEXT_TELEMETRY_DISABLED=1

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the server
CMD ["npm", "start"]