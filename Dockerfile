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

# Start the server
CMD ["npm", "start"]