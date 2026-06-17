package main

import (
	"context"
	"log"
	"net/http"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
)

func healthHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := pool.Ping(r.Context()); err != nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			w.Write([]byte(`{"status":"degraded"}`))
			return
		}
		w.Write([]byte(`{"status":"ok"}`))
	}
}

func main() {
	ctx := context.Background()
	pool, err := newPool(ctx)
	if err != nil {
		log.Fatalf("db connection failed: %v", err)
	}
	defer pool.Close()

	outputDir := os.Getenv("OUTPUT_DIR")
	if outputDir == "" {
		outputDir = "/app/output"
	}
	if err := os.MkdirAll(outputDir, 0755); err != nil {
		log.Fatalf("could not create output dir: %v", err)
	}

	plantillaPath := os.Getenv("PLANTILLA")
	if plantillaPath == "" {
		plantillaPath = "/app/plantilla_asistencia.xlsx"
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", healthHandler(pool))
	mux.HandleFunc("GET /export/excel", exportExcelHandler(pool, plantillaPath, outputDir))
	mux.HandleFunc("POST /import/roster", importRosterHandler())

	port := os.Getenv("PORT")
	if port == "" {
		port = "8002"
	}
	log.Printf("excel-service listening on :%s", port)
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		log.Fatal(err)
	}
}
