# The production image for Google Cloud Run. It holds only a finished build:
# deploy.yml runs `pnpm build` with NEXT_OUTPUT=standalone first, so the
# build (and its Sentry source-map upload) happens once, outside Docker.
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080 HOSTNAME=0.0.0.0
COPY .next/standalone ./
COPY .next/static ./.next/static
COPY public ./public
USER node
EXPOSE 8080
CMD ["node", "server.js"]
