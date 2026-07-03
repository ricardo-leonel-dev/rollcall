FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json .
COPY src/ ./src/
RUN pnpm run build

FROM node:22-alpine
WORKDIR /app
RUN corepack enable && npm install -g pm2
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=builder /app/dist ./dist
RUN apk add --no-cache curl
EXPOSE 3000
CMD ["pm2-runtime", "dist/app.js", "-i", "max"]
