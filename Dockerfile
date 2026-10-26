FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY index.html styles.css favicon.svg server.js ./
COPY src ./src
ENV HOST=0.0.0.0
ENV PORT=4173
EXPOSE 4173
USER node
CMD ["npm", "start"]
