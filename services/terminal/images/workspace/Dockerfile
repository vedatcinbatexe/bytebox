# Workspace for terminal sessions: one shell with Python, Node.js and C++
FROM alpine:3.22
# Same first step as the C++ sandbox image, so Docker can reuse that layer
RUN apk add --no-cache g++
RUN apk add --no-cache bash coreutils tar python3 nodejs nano less
