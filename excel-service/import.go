package main

import (
	"encoding/json"
	"net/http"

	"github.com/xuri/excelize/v2"
)

// importRosterHandler recibe un .xlsx con la nómina de estudiantes/representantes.
// El mapeo de columnas contra students/guardians/enrollments todavía no está
// definido, así que por ahora solo devuelve un preview (headers + cantidad de
// filas) para validar el formato antes de escribir el INSERT a la base.
func importRosterHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseMultipartForm(20 << 20); err != nil {
			http.Error(w, "invalid multipart form", http.StatusBadRequest)
			return
		}
		file, _, err := r.FormFile("file")
		if err != nil {
			http.Error(w, "missing 'file' field", http.StatusBadRequest)
			return
		}
		defer file.Close()

		f, err := excelize.OpenReader(file)
		if err != nil {
			http.Error(w, "could not read xlsx: "+err.Error(), http.StatusBadRequest)
			return
		}
		defer f.Close()

		sheet := f.GetSheetList()[0]
		rows, err := f.GetRows(sheet)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		var headers []string
		dataRows := 0
		if len(rows) > 0 {
			headers = rows[0]
			dataRows = len(rows) - 1
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"sheet":       sheet,
			"headers":     headers,
			"data_rows":   dataRows,
			"implemented": false,
			"note":        "Preview only — falta definir el mapeo de columnas contra students/guardians/enrollments antes de escribir a la base.",
		})
	}
}
