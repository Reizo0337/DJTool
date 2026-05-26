FROM node:20-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp
RUN pip3 install yt-dlp --break-system-packages

WORKDIR /app

# Install Node.js dependencies
COPY package*.json ./
RUN npm install --production

# Copy app files
COPY . .

# Create necessary directories
RUN mkdir -p temp downloads

EXPOSE 3000

CMD ["node", "server.js"]
