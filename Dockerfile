FROM node:20-slim

RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp (latest)
RUN pip3 install yt-dlp --break-system-packages && yt-dlp --version

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .
RUN mkdir -p temp

EXPOSE 3000
CMD ["node", "server.js"]
