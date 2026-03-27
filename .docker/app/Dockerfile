FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy full application
COPY . .

# Build frontend (Vite builds into /dist)
RUN npm run build

# Start the application server
EXPOSE 3000

CMD ["npx", "tsx", "server.ts"]
