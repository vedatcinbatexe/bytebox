# Go sandbox image with the standard library already compiled.
# A cold Go build takes ~15 s on half a CPU; with this read-only cache it takes under a second.
FROM golang:1.25-alpine
ENV GOCACHE=/gocache GOTOOLCHAIN=local GOFLAGS=-buildvcs=false HOME=/tmp
RUN go build std && chmod -R a+rX /gocache
