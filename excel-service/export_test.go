package main

import (
	"bytes"
	"fmt"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/xuri/excelize/v2"
)

// ── T6 — resolveTrimesterSheetIndex (pure resolver) ──────────────────────────

func TestResolveTrimesterSheetIndex(t *testing.T) {
	cases := []struct {
		name      string
		seq       string
		qname     string
		wantIdx   int
		wantError bool
	}{
		{"both empty -> position 0 (R1)", "", "", 0, false},
		{"quarter_sequence=2 -> position 1 (R2)", "2", "", 1, false},
		{"quarter_sequence wins over quarter_name (R2)", "2", "Primer Trimestre", 1, false},
		{"quarter_sequence=abc -> error (R3)", "abc", "", 0, true},
		{"quarter_sequence=0 -> error (R4)", "0", "", 0, true},
		{"quarter_sequence=4 -> error (R4)", "4", "", 0, true},
		{"quarter_name=Tercer Trimestre -> position 2 (R5)", "", "Tercer Trimestre", 2, false},
		{"quarter_name=Cuarto Trimestre -> error (R6)", "", "Cuarto Trimestre", 0, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := resolveTrimesterSheetIndex(tc.seq, tc.qname)
			if tc.wantError {
				if err == nil {
					t.Fatalf("expected error, got nil (idx=%d)", got)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tc.wantIdx {
				t.Fatalf("index: got %d, want %d", got, tc.wantIdx)
			}
		})
	}
}

// ── T7 — selectAndKeepSheet on a synthetic 3-trimester workbook (R7) ─────────

// buildSyntheticTrimesterWorkbook builds an in-memory *excelize.File whose
// sheet list is ["1ER TRIMESTRE", "2DO TRIMESTRE", "3ER TRIMESTRE"] — mirroring
// the real plantilla_asistencia.xlsx's document order, without needing the
// 183 KB fixture on disk (per design.md "Tests" + T7).
func buildSyntheticTrimesterWorkbook(t *testing.T) *excelize.File {
	t.Helper()
	f := excelize.NewFile()
	// excelize.NewFile ships with "Sheet1"; rename it (DeleteSheet is a no-op
	// on the active default in this excelize version) and append the others
	// in document order.
	if err := f.SetSheetName("Sheet1", "1ER TRIMESTRE"); err != nil {
		t.Fatalf("SetSheetName Sheet1: %v", err)
	}
	for _, name := range []string{"2DO TRIMESTRE", "3ER TRIMESTRE"} {
		if _, err := f.NewSheet(name); err != nil {
			t.Fatalf("NewSheet %s: %v", name, err)
		}
	}
	return f
}

func TestSelectAndKeepSheet_KeepsSelectedSheetOnly(t *testing.T) {
	f := buildSyntheticTrimesterWorkbook(t)
	before := f.GetSheetList()
	if !reflect.DeepEqual(before, []string{"1ER TRIMESTRE", "2DO TRIMESTRE", "3ER TRIMESTRE"}) {
		t.Fatalf("synthetic setup: got %v, want 3-trimestre document order", before)
	}

	kept, err := selectAndKeepSheet(f, 1)
	if err != nil {
		t.Fatalf("selectAndKeepSheet: %v", err)
	}
	if kept != "2DO TRIMESTRE" {
		t.Fatalf("kept: got %q, want %q", kept, "2DO TRIMESTRE")
	}
	got := f.GetSheetList()
	want := []string{"2DO TRIMESTRE"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("after select: got %v, want %v", got, want)
	}
}

// ── T8 — out-of-range sheetIndex returns a non-nil error and does not panic ─

func TestSelectAndKeepSheet_OutOfRangeReturnsError(t *testing.T) {
	f := buildSyntheticTrimesterWorkbook(t)

	_, err := selectAndKeepSheet(f, 3)
	if err == nil {
		t.Fatalf("expected error for sheetIndex >= len(GetSheetList()), got nil")
	}
	if !strings.Contains(err.Error(), "template has") {
		t.Fatalf("error message: got %q, want it to mention the template sheet count", err.Error())
	}
}

// ── T5 — dedupeCommentShapeIDs in isolation (R4) ─────────────────────────────

func TestDedupeCommentShapeIDs_Unit(t *testing.T) {
	tmpDir := t.TempDir()
	zipPath := filepath.Join(tmpDir, "minimal.xlsx")

	// Hand-crafted VML drawing part with 3 duplicate shape ids + 1 shared shapetype.
	vml := []byte(`<?xml version="1.0"?>` +
		`<xml xmlns:v="urn:schemas-microsoft-com:vml">` +
		`<v:shapetype id="_x0000_t202" coordsize="21600,21600"/>` +
		`<v:shape id="_x0000_s1025" type="#_x0000_t202" style="position:absolute"/>` +
		`<v:shape id="_x0000_s1025" type="#_x0000_t202" style="position:absolute"/>` +
		`<v:shape id="_x0000_s1025" type="#_x0000_t202" style="position:absolute"/>` +
		`</xml>`)

	entries := []zipEntry{{name: "xl/drawings/vmlDrawing1.vml", content: vml}}
	if err := writeZipEntries(zipPath, entries); err != nil {
		t.Fatalf("writeZipEntries: %v", err)
	}

	if err := dedupeCommentShapeIDs(zipPath); err != nil {
		t.Fatalf("dedupeCommentShapeIDs: %v", err)
	}

	got, err := readZipEntries(zipPath)
	if err != nil {
		t.Fatalf("readZipEntries: %v", err)
	}

	var vmlAfter []byte
	for _, e := range got {
		if e.name == "xl/drawings/vmlDrawing1.vml" {
			vmlAfter = e.content
		}
	}
	if vmlAfter == nil {
		t.Fatalf("xl/drawings/vmlDrawing1.vml missing after dedupe")
	}

	ids := reVMLShapeID.FindAll(vmlAfter, -1)
	if len(ids) != 3 {
		t.Fatalf("shape ids: got %d, want 3", len(ids))
	}
	want := []string{`id="_x0000_s1025"`, `id="_x0000_s1026"`, `id="_x0000_s1027"`}
	for i, id := range ids {
		if string(id) != want[i] {
			t.Fatalf("id[%d]: got %s, want %s", i, id, want[i])
		}
	}

	// Shared shapetype id (different prefix) is untouched.
	if !bytes.Contains(vmlAfter, []byte(`id="_x0000_t202"`)) {
		t.Fatalf("shapetype id was changed by dedupe; want it preserved")
	}
}

// ── T3, T4 helpers (processCourse against the real plantilla_asistencia.xlsx) ─

func intPtr(n int) *int          { return &n }
func stringPtr(s string) *string { return &s }

// probePlantilla returns the first n valid (month, day) pairs from the first
// sheet of plantilla_asistencia.xlsx, paired with their resolved column index.
// Year is fixed to 2026 — processCourse only consults month + day.
func probePlantilla(t *testing.T, n int) (sheet string, dates []time.Time, cols []int) {
	t.Helper()
	const plantillaPath = "plantilla_asistencia.xlsx"
	f, err := excelize.OpenFile(plantillaPath)
	if err != nil {
		t.Fatalf("open plantilla: %v", err)
	}
	defer f.Close()
	sheet = f.GetSheetList()[0]
	colMap, err := getColumnMap(f, sheet)
	if err != nil {
		t.Fatalf("getColumnMap: %v", err)
	}
	for _, mes := range monthNames {
		cd, ok := colMap[mes]
		if !ok {
			continue
		}
		for d := 1; d <= 31; d++ {
			c, ok := cd[d]
			if !ok {
				continue
			}
			mIdx := slices.Index(monthNames, mes) + 1
			dates = append(dates, time.Date(2026, time.Month(mIdx), d, 0, 0, 0, 0, time.UTC))
			cols = append(cols, c)
			if len(dates) >= n {
				return
			}
		}
	}
	t.Fatalf("probePlantilla: only found %d valid date(s), need %d", len(dates), n)
	return
}

// findVMLDrawing returns the first xl/drawings/vmlDrawing*.vml entry from the
// given zip entries, or nil if none.
func findVMLDrawing(entries []zipEntry) []byte {
	for _, e := range entries {
		if strings.HasPrefix(e.name, "xl/drawings/vmlDrawing") && strings.HasSuffix(e.name, ".vml") {
			return e.content
		}
	}
	return nil
}

// ── T3 — F-record comment present, AT-with-empty-fields has no comment (R1, R3)

func TestProcessCourse_FRecordComment_NoCommentForATEmptyFields(t *testing.T) {
	sheet, dates, cols := probePlantilla(t, 1)
	date := dates[0]
	col := cols[0]

	roster := []rosterStudent{
		{studentName: "ALUMNO UNO", rosterNumber: intPtr(1)},
		{studentName: "ALUMNO DOS", rosterNumber: intPtr(2)},
	}
	cd := courseData{
		id: 1, name: "TEST COURSE", fullName: "PRIMERO BS", paralelo: "A",
		shift: "MAÑANA", roster: roster,
		registros: []absenceRecord{
			{studentName: "ALUMNO UNO", rosterNumber: intPtr(1), date: date, typ: "F", notes: "F note"},
			{studentName: "ALUMNO DOS", rosterNumber: intPtr(2), date: date, typ: "AT"},
		},
	}

	outputDir := t.TempDir()
	ts := time.Now().Format("20060102_150405")
	p, err := processCourse("plantilla_asistencia.xlsx", outputDir, ts, cd, sheet, 0, []time.Time{date}, nil)
	if err != nil {
		t.Fatalf("processCourse: %v", err)
	}

	entries, err := readZipEntries(p)
	if err != nil {
		t.Fatalf("readZipEntries: %v", err)
	}

	var commentsXML []byte
	for _, e := range entries {
		if e.name == "xl/comments1.xml" {
			commentsXML = e.content
		}
	}
	if commentsXML == nil {
		t.Fatalf("xl/comments1.xml missing in output")
	}

	fcellRef, _ := excelize.CoordinatesToCellName(col, filaInicialNomina)
	atcellRef, _ := excelize.CoordinatesToCellName(col, filaInicialNomina+1)

	if !bytes.Contains(commentsXML, []byte(fmt.Sprintf(`ref="%s"`, fcellRef))) {
		t.Fatalf("R1: xl/comments1.xml missing comment ref for F cell %s\n--- comments1.xml ---\n%s", fcellRef, commentsXML)
	}
	if !bytes.Contains(commentsXML, []byte(`Nota: F note`)) {
		t.Fatalf("R1: xl/comments1.xml missing comment text 'Nota: F note' for F cell\n--- comments1.xml ---\n%s", commentsXML)
	}

	if bytes.Contains(commentsXML, []byte(fmt.Sprintf(`ref="%s"`, atcellRef))) {
		t.Fatalf("R3: xl/comments1.xml has comment ref for AT cell %s, want none (both fields empty)\n--- comments1.xml ---\n%s", atcellRef, commentsXML)
	}
}

// ── T4 — three records (F / AT / J) on same sheet, 3 distinct shape ids (R1, R2, R4, R5)

func TestProcessCourse_F_AT_J_ThreeDistinctShapeIDs(t *testing.T) {
	sheet, dates, cols := probePlantilla(t, 3)
	// Spread the three absences across three different dates → three different
	// columns. (Same date would still work but gives identical test coverage.)
	dateF, dateAT, dateJ := dates[0], dates[1], dates[2]
	colF, colAT, colJ := cols[0], cols[1], cols[2]

	roster := []rosterStudent{
		{studentName: "ALUMNO UNO", rosterNumber: intPtr(1)},
		{studentName: "ALUMNO DOS", rosterNumber: intPtr(2)},
		{studentName: "ALUMNO TRES", rosterNumber: intPtr(3)},
	}
	cd := courseData{
		id: 1, name: "TEST COURSE", fullName: "PRIMERO BS", paralelo: "A",
		shift: "MAÑANA", roster: roster,
		registros: []absenceRecord{
			{studentName: "ALUMNO UNO", rosterNumber: intPtr(1), date: dateF, typ: "F", notes: "F note"},
			{studentName: "ALUMNO DOS", rosterNumber: intPtr(2), date: dateAT, typ: "AT", notes: "AT note"},
			{studentName: "ALUMNO TRES", rosterNumber: intPtr(3), date: dateJ, typ: "F", justified: true, notes: "J note", justificationReason: stringPtr("illness")},
		},
	}

	outputDir := t.TempDir()
	ts := time.Now().Format("20060102_150405")
	p, err := processCourse("plantilla_asistencia.xlsx", outputDir, ts, cd, sheet, 0, dates, nil)
	if err != nil {
		t.Fatalf("processCourse: %v", err)
	}

	entries, err := readZipEntries(p)
	if err != nil {
		t.Fatalf("readZipEntries: %v", err)
	}

	var commentsXML []byte
	for _, e := range entries {
		if e.name == "xl/comments1.xml" {
			commentsXML = e.content
		}
	}
	if commentsXML == nil {
		t.Fatalf("xl/comments1.xml missing in output")
	}

	fRef, _ := excelize.CoordinatesToCellName(colF, filaInicialNomina)
	atRef, _ := excelize.CoordinatesToCellName(colAT, filaInicialNomina+1)
	jRef, _ := excelize.CoordinatesToCellName(colJ, filaInicialNomina+2)

	type want struct {
		cellRef, text string
	}
	// Note: excelize XML-escapes the embedded newline as &#xA; when writing
	// comments1.xml, so the literal "Nota: ...\nJustificación: ..." is stored
	// with that escape. Assert the encoded form (matches the file as written).
	for _, w := range []want{
		{fRef, "Nota: F note"},
		{atRef, "Nota: AT note"},
		{jRef, "Nota: J note&#xA;Justificación: illness"},
	} {
		if !bytes.Contains(commentsXML, []byte(fmt.Sprintf(`ref="%s"`, w.cellRef))) {
			t.Fatalf("missing comment ref for cell %s\n--- comments1.xml ---\n%s", w.cellRef, commentsXML)
		}
		if !bytes.Contains(commentsXML, []byte(w.text)) {
			t.Fatalf("missing comment text %q for cell %s\n--- comments1.xml ---\n%s", w.text, w.cellRef, commentsXML)
		}
	}

	vml := findVMLDrawing(entries)
	if vml == nil {
		t.Fatalf("no xl/drawings/vmlDrawing*.vml entry in output")
	}
	ids := reVMLShapeID.FindAll(vml, -1)
	if len(ids) != 3 {
		t.Fatalf("R4: vmlDrawing shape ids: got %d, want 3\n--- vml ---\n%s", len(ids), vml)
	}
	seen := map[string]bool{}
	for _, id := range ids {
		if seen[string(id)] {
			t.Fatalf("R4: duplicate shape id %s after dedupe\n--- vml ---\n%s", id, vml)
		}
		seen[string(id)] = true
	}
}
