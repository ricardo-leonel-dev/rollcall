package main

import (
	"context"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
)

func newPool(ctx context.Context) (*pgxpool.Pool, error) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgresql://attendance:asistencia_local_2026@postgres:5432/attendance"
	}
	schema := os.Getenv("DB_SCHEMA")
	if schema == "" {
		schema = "attendance"
	}

	config, err := pgxpool.ParseConfig(dbURL)
	if err != nil {
		return nil, err
	}
	// Aplicado como startup parameter en cada conexión física del pool,
	// no en una sola conexión prestada — a diferencia de un simple `SET`.
	config.ConnConfig.RuntimeParams["search_path"] = schema

	return pgxpool.NewWithConfig(ctx, config)
}
