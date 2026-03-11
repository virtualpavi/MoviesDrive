FROM node:20-alpine

WORKDIR /app

# Install dependencies separately to cache them
COPY package*.json ./
RUN npm ci --only=production

# Copy application files
COPY . .

# Expose port (can be overridden by environment variable)
ENV PORT=27828
EXPOSE 27828

# Start the application
CMD ["npm", "start"]
