FROM node:22-slim

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps

# Copy source code
COPY . .

# Build the project
RUN npm run build

# Start the server
EXPOSE 8080
ENV NODE_ENV=production
CMD ["npm", "start"]
