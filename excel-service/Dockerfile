FROM golang:1.25-alpine AS builder
WORKDIR /app
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o excel-service .

FROM alpine:3.20
WORKDIR /app
COPY --from=builder /app/excel-service .
COPY plantilla_asistencia.xlsx /app/
RUN mkdir -p /app/output
EXPOSE 8002
CMD ["./excel-service"]
