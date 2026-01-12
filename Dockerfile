# Use the official Node.js image
FROM node:20-slim

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy the rest of your app source code
# (This includes the .env file we will generate in GitHub Actions)
COPY . .

# Build the Next.js app
# This is where NEXT_PUBLIC_ vars get baked in!
RUN npm run build

# Remove dev dependencies after build to reduce image size
RUN npm prune --omit=dev

# Set environment variables for Cloud Run
ENV NODE_ENV=production
ENV HOSTNAME="0.0.0.0"
ENV PORT=8080
ENV NEXT_TELEMETRY_DISABLED=1

# Start the server
CMD ["npm", "start"]