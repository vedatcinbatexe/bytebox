FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# The browser calls the gateway directly; Next.js inlines this value at build time
ARG NEXT_PUBLIC_GATEWAY_URL=http://localhost:4000/graphql
ENV NEXT_PUBLIC_GATEWAY_URL=$NEXT_PUBLIC_GATEWAY_URL
ARG NEXT_PUBLIC_TERMINAL_URL=ws://localhost:4100
ENV NEXT_PUBLIC_TERMINAL_URL=$NEXT_PUBLIC_TERMINAL_URL
ARG NEXT_PUBLIC_COLLAB_URL=ws://localhost:4200
ENV NEXT_PUBLIC_COLLAB_URL=$NEXT_PUBLIC_COLLAB_URL
ARG NEXT_PUBLIC_IDENTITY_URL=http://localhost:5001
ENV NEXT_PUBLIC_IDENTITY_URL=$NEXT_PUBLIC_IDENTITY_URL
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
