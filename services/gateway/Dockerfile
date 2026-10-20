# Build context is the repo root, so the shared proto/ folder is available.
# The repo layout is kept (/repo/services/gateway + /repo/proto) so the proto path works.
FROM node:24-alpine AS build
WORKDIR /repo/services/gateway
COPY services/gateway/package.json services/gateway/package-lock.json ./
RUN npm ci
COPY services/gateway/ ./
RUN npm run build

FROM node:24-alpine
WORKDIR /repo/services/gateway
ENV NODE_ENV=production
COPY services/gateway/package.json services/gateway/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /repo/services/gateway/dist ./dist
COPY proto/ /repo/proto/
EXPOSE 4000
CMD ["node", "dist/index.js"]
