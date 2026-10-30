# The camera upload server's machine (cameras/server.ts): Node 24 runs the TypeScript directly;
# ffmpeg makes the pictures tiny to compare them; openssl makes its FTPS certificate (start.sh).
# Built and deployed by `flyctl deploy -c cameras/fly.toml` (.github/workflows/deploy-cameras.yml).
FROM node:24-alpine
RUN apk add --no-cache ffmpeg openssl
WORKDIR /app
COPY ftp.ts motion.ts server.ts start.sh ./
ENV NODE_ENV=production FTP_PORT=21 PORT=8080 PASV_PORTS=30000-30015
EXPOSE 21 8080 30000-30015
CMD ["sh", "start.sh"]
