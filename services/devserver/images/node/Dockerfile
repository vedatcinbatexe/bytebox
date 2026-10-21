# Node.js server projects: Express and friends are installed here, ahead of time,
# because servers run without internet. They're linked into the project as node_modules.
FROM node:24-alpine
WORKDIR /opt/deps
COPY package.json .
RUN npm install --omit=dev --no-audit --no-fund && chmod -R a+rX /opt/deps
