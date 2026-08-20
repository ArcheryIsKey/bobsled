FROM node:22-slim

WORKDIR /app

# Install dependencies
COPY package.json ./
RUN npm install

# Copy source code
COPY . .

# Build the project
RUN npm run build

# Start the server
EXPOSE 3000
CMD ["npm", "start"]
