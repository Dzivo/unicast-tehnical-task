FROM golang:1.24-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /out/processor ./cmd/processor

FROM alpine:3.21
WORKDIR /app
COPY --from=build /out/processor /usr/local/bin/processor
CMD ["processor"]
