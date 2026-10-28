FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY index.html styles.css favicon.svg server.js ./
COPY src ./src
COPY assets ./assets
COPY monitor ./monitor
COPY docs/character-preview.html ./docs/character-preview.html
ENV HOST=0.0.0.0
ENV PORT=4173
EXPOSE 4173
USER node
CMD ["node", "server.js"]
