package main

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/xuri/excelize/v2"
)

var monthNames = []string{
	"ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
	"JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE",
}

const (
	filaInicialNomina = 11
	filaFinalNomina   = 40 // tope físico de la plantilla (30 estudiantes)
)

type absenceRecord struct {
	studentName  string
	rosterNumber *int
	date         time.Time
	typ          string
	justified    bool
}

type rosterStudent struct {
	studentName  string
	rosterNumber *int
}

func isMonth(s string) bool {
	for _, m := range monthNames {
		if m == s {
			return true
		}
	}
	return false
}

// getColumnMap lee las filas 7 (mes) y 10 (día) de la plantilla para ubicar
// la columna exacta de cada día del año lectivo.
func getColumnMap(f *excelize.File, sheet string) (map[string]map[int]int, error) {
	dim, err := f.GetSheetDimension(sheet)
	if err != nil {
		return nil, err
	}
	parts := strings.Split(dim, ":")
	endRef := parts[len(parts)-1]
	maxCol, _, err := excelize.CellNameToCoordinates(endRef)
	if err != nil {
		return nil, err
	}

	colMap := map[string]map[int]int{}
	mesActual := ""
	for c := 1; c <= maxCol; c++ {
		cellRow7, _ := excelize.CoordinatesToCellName(c, 7)
		cellRow10, _ := excelize.CoordinatesToCellName(c, 10)
		v7, _ := f.GetCellValue(sheet, cellRow7)
		v10, _ := f.GetCellValue(sheet, cellRow10)

		v7Up := strings.ToUpper(strings.TrimSpace(v7))
		// excelize repite el valor de una celda combinada en todas las columnas
		// que abarca (openpyxl no) — solo reiniciar el mapa cuando el mes
		// realmente cambia, no en cada columna donde se repite el mismo mes.
		if v7Up != "" && isMonth(v7Up) && v7Up != mesActual {
			mesActual = v7Up
			colMap[mesActual] = map[int]int{}
		}
		if mesActual != "" {
			if v10Num, err := strconv.ParseFloat(strings.TrimSpace(v10), 64); err == nil {
				dia := int(v10Num)
				if _, exists := colMap[mesActual][dia]; !exists {
					colMap[mesActual][dia] = c
				}
			}
		}
	}
	return colMap, nil
}

func getStudentRowMap(f *excelize.File, sheet string) (map[string]int, error) {
	rowMap := map[string]int{}
	for r := filaInicialNomina; r <= filaFinalNomina; r++ {
		cellRef, _ := excelize.CoordinatesToCellName(2, r)
		v, err := f.GetCellValue(sheet, cellRef)
		if err != nil {
			return nil, err
		}
		v = strings.TrimSpace(v)
		if v != "" {
			rowMap[normalizeName(v)] = r
		}
	}
	return rowMap, nil
}

// escribirNomina sobrescribe la fila de ejemplo de la plantilla con el
// roster real del curso/año (orden por número de lista) antes de poder
// emparejar nombres.
func escribirNomina(f *excelize.File, sheet string, roster []rosterStudent) error {
	for idx, est := range roster {
		row := filaInicialNomina + idx
		if row > filaFinalNomina {
			break // la plantilla no tiene más filas (tope ~30 estudiantes)
		}
		cellA, _ := excelize.CoordinatesToCellName(1, row)
		cellB, _ := excelize.CoordinatesToCellName(2, row)
		if est.rosterNumber != nil {
			if err := f.SetCellValue(sheet, cellA, *est.rosterNumber); err != nil {
				return err
			}
		}
		if err := f.SetCellValue(sheet, cellB, est.studentName); err != nil {
			return err
		}
	}
	return nil
}

// diasHabiles devuelve lunes a viernes dentro del rango. No conoce
// feriados — el sistema no tiene un calendario de días no laborables.
func diasHabiles(desde, hasta time.Time) []time.Time {
	var dias []time.Time
	for d := desde; !d.After(hasta); d = d.AddDate(0, 0, 1) {
		if d.Weekday() != time.Saturday && d.Weekday() != time.Sunday {
			dias = append(dias, d)
		}
	}
	return dias
}

var nonAlnum = regexp.MustCompile(`[^A-Za-z0-9_]`)

func sanitizeFilename(s string) string {
	return nonAlnum.ReplaceAllString(s, "_")
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()
	_, err = io.Copy(out, in)
	return err
}

func exportExcelHandler(pool *pgxpool.Pool, plantillaPath, outputDir string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		institutionID, errI := strconv.Atoi(q.Get("institution_id"))
		courseID, errC := strconv.Atoi(q.Get("course_id"))
		academicYearID, errY := strconv.Atoi(q.Get("academic_year_id"))
		dateFromStr := q.Get("date_from")
		dateToStr := q.Get("date_to")
		if errI != nil || errC != nil || errY != nil {
			http.Error(w, "institution_id, course_id and academic_year_id must be integers", http.StatusBadRequest)
			return
		}
		fDesde, err := time.Parse("2006-01-02", dateFromStr)
		if err != nil {
			http.Error(w, "Invalid date format. Use YYYY-MM-DD", http.StatusBadRequest)
			return
		}
		fHasta, err := time.Parse("2006-01-02", dateToStr)
		if err != nil {
			http.Error(w, "Invalid date format. Use YYYY-MM-DD", http.StatusBadRequest)
			return
		}

		ctx := r.Context()

		var courseName string
		if err := pool.QueryRow(ctx, "SELECT name FROM courses WHERE id = $1 AND institution_id = $2", courseID, institutionID).Scan(&courseName); err != nil {
			http.Error(w, "Course not found", http.StatusNotFound)
			return
		}

		rows, err := pool.Query(ctx, `
			SELECT
			  e.name AS student_name,
			  m.roster_number,
			  a.date,
			  a.type,
			  EXISTS (
			    SELECT 1 FROM justification_absences ja WHERE ja.absence_id = a.id
			  ) AS is_justified
			FROM absences a
			JOIN enrollments m ON m.id = a.enrollment_id
			JOIN students e    ON e.id = m.student_id
			WHERE m.course_id = $1
			  AND m.academic_year_id = $2
			  AND a.date BETWEEN $3 AND $4
			  AND m.institution_id = $5
			  AND a.deleted_at IS NULL
			  AND m.deleted_at IS NULL
			ORDER BY m.roster_number, a.date
		`, courseID, academicYearID, fDesde, fHasta, institutionID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		var registros []absenceRecord
		for rows.Next() {
			var rec absenceRecord
			if err := rows.Scan(&rec.studentName, &rec.rosterNumber, &rec.date, &rec.typ, &rec.justified); err != nil {
				rows.Close()
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			registros = append(registros, rec)
		}
		rows.Close()

		rosterRows, err := pool.Query(ctx, `
			SELECT e.name AS student_name, m.roster_number
			FROM enrollments m
			JOIN students e ON e.id = m.student_id
			WHERE m.course_id = $1
			  AND m.academic_year_id = $2
			  AND m.institution_id = $3
			  AND m.deleted_at IS NULL
			  AND e.deleted_at IS NULL
			ORDER BY m.roster_number NULLS LAST, e.name
		`, courseID, academicYearID, institutionID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		var roster []rosterStudent
		for rosterRows.Next() {
			var est rosterStudent
			if err := rosterRows.Scan(&est.studentName, &est.rosterNumber); err != nil {
				rosterRows.Close()
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			roster = append(roster, est)
		}
		rosterRows.Close()

		ts := time.Now().Format("20060102_150405")
		outputPath := filepath.Join(outputDir, fmt.Sprintf("absences_%d_%s.xlsx", courseID, ts))

		if err := copyFile(plantillaPath, outputPath); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		f, err := excelize.OpenFile(outputPath)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer f.Close()

		// La plantilla trae columnas con fórmulas (COUNTIF de AT/J/F y el total)
		// con valores cacheados de cuando se guardó. excelize no las recalcula,
		// así que forzamos a Excel/LibreOffice a recalcular todo al abrir el
		// archivo para que esas columnas coincidan con los datos exportados.
		fullCalc := true
		if err := f.SetCalcProps(&excelize.CalcPropsOptions{FullCalcOnLoad: &fullCalc}); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		styleF, _ := f.NewStyle(&excelize.Style{
			Fill:      excelize.Fill{Type: "pattern", Pattern: 1, Color: []string{"FFC7CE"}},
			Alignment: &excelize.Alignment{Horizontal: "center"},
		})
		styleAT, _ := f.NewStyle(&excelize.Style{
			Fill:      excelize.Fill{Type: "pattern", Pattern: 1, Color: []string{"FFEB9C"}},
			Alignment: &excelize.Alignment{Horizontal: "center"},
		})
		styleJ, _ := f.NewStyle(&excelize.Style{
			Fill:      excelize.Fill{Type: "pattern", Pattern: 1, Color: []string{"C6EFCE"}},
			Alignment: &excelize.Alignment{Horizontal: "center"},
		})
		styleP, _ := f.NewStyle(&excelize.Style{
			Fill:      excelize.Fill{Type: "pattern", Pattern: 1, Color: []string{"DDEBF7"}},
			Alignment: &excelize.Alignment{Horizontal: "center"},
		})

		diasDelRango := diasHabiles(fDesde, fHasta)

		for _, sheet := range f.GetSheetList() {
			colMap, err := getColumnMap(f, sheet)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			if err := escribirNomina(f, sheet, roster); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			rowMap, err := getStudentRowMap(f, sheet)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			rowMapKeys := make(map[string]bool, len(rowMap))
			for k := range rowMap {
				rowMapKeys[k] = true
			}

			marcadas := map[[2]int]bool{}

			// 1) AT / F / J — un registro real siempre manda sobre el default.
			for _, reg := range registros {
				mesNombre := monthNames[int(reg.date.Month())-1]
				dia := reg.date.Day()
				cols, ok := colMap[mesNombre]
				if !ok {
					continue
				}
				col, ok := cols[dia]
				if !ok {
					continue
				}
				matched, ok := matchName(reg.studentName, rowMapKeys)
				if !ok {
					continue
				}
				row := rowMap[matched]

				displayType := reg.typ
				if reg.justified {
					displayType = "J"
				}
				cellRef, _ := excelize.CoordinatesToCellName(col, row)
				f.SetCellValue(sheet, cellRef, displayType)
				switch displayType {
				case "F":
					f.SetCellStyle(sheet, cellRef, cellRef, styleF)
				case "AT":
					f.SetCellStyle(sheet, cellRef, cellRef, styleAT)
				case "J":
					f.SetCellStyle(sheet, cellRef, cellRef, styleJ)
				}
				marcadas[[2]int{row, col}] = true
			}

			// 2) Días hábiles sin ningún registro → "A" de asistencia.
			for _, est := range roster {
				matched, ok := matchName(est.studentName, rowMapKeys)
				if !ok {
					continue
				}
				row := rowMap[matched]

				for _, diaHabil := range diasDelRango {
					mesNombre := monthNames[int(diaHabil.Month())-1]
					cols, ok := colMap[mesNombre]
					if !ok {
						continue
					}
					col, ok := cols[diaHabil.Day()]
					if !ok {
						continue
					}
					if marcadas[[2]int{row, col}] {
						continue
					}
					cellRef, _ := excelize.CoordinatesToCellName(col, row)
					f.SetCellValue(sheet, cellRef, "A")
					f.SetCellStyle(sheet, cellRef, cellRef, styleP)
					marcadas[[2]int{row, col}] = true
				}
			}
		}

		if err := f.SaveAs(outputPath); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		safeName := sanitizeFilename(courseName)
		filename := fmt.Sprintf("absences_%s_%s_%s.xlsx", safeName, dateFromStr, dateToStr)

		w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
		http.ServeFile(w, r, outputPath)
	}
}
