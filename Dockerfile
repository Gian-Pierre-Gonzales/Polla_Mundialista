FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Create data directory for persistent DB
RUN mkdir -p /data

ENV PORT=3000
ENV DB_PATH=/data/polla.db

EXPOSE 3000

CMD ["node", "server.js"]
