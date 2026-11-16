FROM node:20-alpine

ARG SITE_PATH

WORKDIR /app/server
COPY ${SITE_PATH}/server/package.json ${SITE_PATH}/server/package-lock.json ./
RUN npm ci --omit=dev

COPY ${SITE_PATH}/server/server.js ./server.js
COPY ${SITE_PATH}/public /app/public

ENV NODE_ENV=production \
    PORT=8080 \
    PUBLIC_DIR=/app/public

USER node
EXPOSE 8080

CMD ["node", "server.js"]
