# The render service's container: ffmpeg and a small Node server (render/server.ts).
# Node 24 runs TypeScript directly. Built and pushed by `wrangler deploy -c render/wrangler.jsonc`.
FROM node:24-alpine
RUN apk add --no-cache ffmpeg font-dejavu
WORKDIR /app
COPY ffmpeg.ts server.ts ./
ENV PORT=8080 FONT=/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf NODE_ENV=production
EXPOSE 8080
CMD ["node", "server.ts"]
