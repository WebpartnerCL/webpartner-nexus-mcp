FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json tsconfig.build.json ./
COPY src/ ./src/
RUN npm run build && npm prune --omit=dev

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://localhost:3000/ >/dev/null 2>&1 || exit 1

CMD ["node", "dist/index.js"]
