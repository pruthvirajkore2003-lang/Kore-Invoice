FROM node:22-slim
# Chromium for PDF rendering; Noto fonts so Marathi (Devanagari) renders instead of boxes.
RUN apt-get update && apt-get install -y --no-install-recommends chromium fonts-noto-core \
  && rm -rf /var/lib/apt/lists/*
ENV CHROME_PATH=/usr/bin/chromium NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY public ./public
COPY src ./src
USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
