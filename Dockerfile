FROM node:22-alpine AS browser-build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html styles.css ./
COPY src ./src
COPY monitor ./monitor
COPY scripts/build-client.mjs ./scripts/build-client.mjs
RUN npm run build:client

FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY index.html styles.css favicon.svg server.js ./
COPY src ./src
COPY assets ./assets
COPY monitor ./monitor
COPY docs/character-preview.html ./docs/character-preview.html
COPY --from=browser-build /app/build/client ./build/client
ENV HOST=0.0.0.0
ENV PORT=4173
EXPOSE 4173
USER node
CMD ["node", "server.js"]
