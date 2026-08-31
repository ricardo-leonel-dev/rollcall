package main

import (
	"bytes"
	"fmt"
	"path/filepath"
	"reflect"
	"regexp"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/xuri/excelize/v2"
)

// ── T5 — commentBoxSize bounds (R2, R3, R4, R5) ──────────────────────────────

func TestCommentBoxSize_Bounds(t *testing.T) {
	cases := []struct {
		name string
		text string
	}{
		{"short single-word note", "Nota: gripe"},
		{"single line over commentWrapCharsPerLine",
			"Nota: esta es una nota bastante larga que claramente excede el ancho maximo"},
		{"explicit newline (Nota + Justificación lines)",
			"Nota: fiebre\nJustificación: reposó dos días"},
		{"very long multi-line note",
			"Nota: el estudiante estuvo ausente por motivos de salud durante una semana completa y se le realizaron examenes medicos que confirmaron el diagnostico inicial\nJustificación: reposo medico por dos semanas con seguimiento semanal del estudiante en el consultorio y entrega de tareas via correo electronico con el apoyo de la familia y companieros"},
	}
	var (
		shortH uint
		longH  uint
	)
	for i, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			w, h := commentBoxSize(tc.text)
			if w < commentMinWidth || w > commentMaxWidth {
				t.Fatalf("width out of bounds: got %d, want [%d, %d]", w, commentMinWidth, commentMaxWidth)
			}
			if h < commentMinHeight || h > commentMaxHeight {
				t.Fatalf("height out of bounds: got %d, want [%d, %d]", h, commentMinHeight, commentMaxHeight)
			}
			if i == 0 {
				shortH = h
			}
			if tc.name == "very long multi-line note" {
				longH = h
			}
		})
	}
	if shortH == 0 || longH == 0 {
		t.Fatalf("could not capture shortH/longH: shortH=%d longH=%d", shortH, longH)
	}
	if longH <= shortH {
		t.Fatalf("long multi-line height (%d) must be strictly greater than short-note height (%d)", longH, shortH)
	}
}

// ── T6 — commentBoxSize wired into AddComment produces distinct <x:Anchor>
// per-shape (R1, R6) ─────────────────────────────────────────────────────────

func TestProcessCourse_DistinctAnchorsForDifferentHeights(t *testing.T) {
	sheet, dates, _ := probePlantilla(t, 2)
	dateShort, dateLong := dates[0], dates[1]

	shortText := "Nota: gripe"
	longText := strings.Repeat("Esta es una nota larga con muchas palabras. ", 10)

	shortW, shortH := commentBoxSize(shortText)
	longW, longH := commentBoxSize(longText)
	if shortH == longH {
		t.Fatalf("test setup invariant failed: commentBoxSize returned same height %d for both texts (short=%d long=%d widths=%d/%d)", shortH, shortW, longW, shortH, longH)
	}

	roster := []rosterStudent{
		{studentName: "ALUMNO UNO", rosterNumber: intPtr(1)},
		{studentName: "ALUMNO DOS", rosterNumber: intPtr(2)},
	}
	cd := courseData{
		id: 1, name: "TEST COURSE", fullName: "PRIMERO BS", paralelo: "A",
		shift: "MAÑANA", roster: roster,
		registros: []absenceRecord{
			{studentName: "ALUMNO UNO", rosterNumber: intPtr(1), date: dateShort, typ: "F", notes: shortText[len("Nota: "):]},
			{studentName: "ALUMNO DOS", rosterNumber: intPtr(2), date: dateLong, typ: "F", notes: longText[len("Nota: "):]},
		},
	}

	outputDir := t.TempDir()
	ts := time.Now().Format("20060102_150405")
	p, err := processCourse("plantilla_asistencia.xlsx", outputDir, ts, cd, sheet, 0, []time.Time{dateShort, dateLong}, nil)
	if err != nil {
		t.Fatalf("processCourse: %v", err)
	}

	entries, err := readZipEntries(p)
	if err != nil {
		t.Fatalf("readZipEntries: %v", err)
	}

	vml := findVMLDrawing(entries)
	if vml == nil {
		t.Fatalf("no xl/drawings/vmlDrawing*.vml entry in output")
	}

	reAnchor := regexp.MustCompile(`(?s)<x:Anchor>([^<]+)</x:Anchor>`)
	matches := reAnchor.FindAllSubmatch(vml, -1)
	if len(matches) != 2 {
		t.Fatalf("R6: expected 2 <x:Anchor> elements (one per shape), got %d\n--- vml ---\n%s", len(matches), vml)
	}

	anchorShort := string(matches[0][1])
	anchorLong := string(matches[1][1])
	if anchorShort == anchorLong {
		t.Fatalf("R6: both anchors identical (%q); want different geometry for different comment heights\n--- vml ---\n%s", anchorShort, vml)
	}

	// Anchors are in document order matching cd.registros iteration order:
	// ALUMNO UNO (short) first, ALUMNO DOS (long) second.
	if !strings.Contains(anchorShort, ",") || !strings.Contains(anchorLong, ",") {
		t.Fatalf("anchor content malformed: short=%q long=%q", anchorShort, anchorLong)
	}
}

// ── T7 — diagonal border on noted F/AT/J cells, not on non-noted F / styleP ─

func TestProcessCourse_DiagonalBorderOnNotedCells(t *testing.T) {
	sheet, dates, cols := probePlantilla(t, 4)
	dateFnote, dateFn, dateAT, dateJ := dates[0], dates[1], dates[2], dates[3]
	colFnote, colFn, colAT, colJ := cols[0], cols[1], cols[2], cols[3]

	roster := []rosterStudent{
		{studentName: "ALUMNO UNO", rosterNumber: intPtr(1)},
		{studentName: "ALUMNO DOS", rosterNumber: intPtr(2)},
		{studentName: "ALUMNO TRES", rosterNumber: intPtr(3)},
		{studentName: "ALUMNO CUATRO", rosterNumber: intPtr(4)},
		{studentName: "ALUMNO CINCO", rosterNumber: intPtr(5)},
	}
	cd := courseData{
		id: 1, name: "TEST COURSE", fullName: "PRIMERO BS", paralelo: "A",
		shift: "MAÑANA", roster: roster,
		registros: []absenceRecord{
			{studentName: "ALUMNO UNO", rosterNumber: intPtr(1), date: dateFnote, typ: "F", notes: "F with note"},
			{studentName: "ALUMNO DOS", rosterNumber: intPtr(2), date: dateFn, typ: "F"}, // F, no note
			{studentName: "ALUMNO TRES", rosterNumber: intPtr(3), date: dateAT, typ: "AT", notes: "AT with note"},
			{studentName: "ALUMNO CUATRO", rosterNumber: intPtr(4), date: dateJ, typ: "F", justified: true, notes: "J note", justificationReason: stringPtr("illness")},
			// ALUMNO CINCO has no absence record -> diasDelRango fallback writes styleP at filaInicialNomina+4
		},
	}

	outputDir := t.TempDir()
	ts := time.Now().Format("20060102_150405")
	dias := []time.Time{dateFnote, dateFn, dateAT, dateJ}
	p, err := processCourse("plantilla_asistencia.xlsx", outputDir, ts, cd, sheet, 0, dias, nil)
	if err != nil {
		t.Fatalf("processCourse: %v", err)
	}

	// Reopen the produced temp .xlsx via excelize to inspect per-cell style.
	f, err := excelize.OpenFile(p)
	if err != nil {
		t.Fatalf("OpenFile(%s): %v", p, err)
	}
	defer f.Close()

	fnoteRef, _ := excelize.CoordinatesToCellName(colFnote, filaInicialNomina)
	fnRef, _ := excelize.CoordinatesToCellName(colFn, filaInicialNomina+1)
	atRef, _ := excelize.CoordinatesToCellName(colAT, filaInicialNomina+2)
	jRef, _ := excelize.CoordinatesToCellName(colJ, filaInicialNomina+3)
	pRef, _ := excelize.CoordinatesToCellName(colFnote, filaInicialNomina+4) // ALUMNO CINCO, no record -> styleP

	hasDiagonal := func(ref string) bool {
		t.Helper()
		idx, err := f.GetCellStyle(sheet, ref)
		if err != nil {
			t.Fatalf("GetCellStyle(%s): %v", ref, err)
		}
		s, err := f.GetStyle(idx)
		if err != nil {
			t.Fatalf("GetStyle(%d): %v", idx, err)
		}
		for _, b := range s.Border {
			if b.Type == "diagonalUp" {
				return true
			}
		}
		return false
	}

	if !hasDiagonal(fnoteRef) {
		t.Fatalf("R7: noted F cell %s should have diagonalUp border, but does not", fnoteRef)
	}
	if !hasDiagonal(atRef) {
		t.Fatalf("R7: noted AT cell %s should have diagonalUp border, but does not", atRef)
	}
	if !hasDiagonal(jRef) {
		t.Fatalf("R7: noted J cell %s should have diagonalUp border, but does not", jRef)
	}
	if hasDiagonal(fnRef) {
		t.Fatalf("R8: non-noted F cell %s must NOT have diagonalUp border", fnRef)
	}
	if hasDiagonal(pRef) {
		t.Fatalf("R10: styleP cell %s must NOT have diagonalUp border", pRef)
	}

	// R9 — cell value is "F" for both noted-F and non-noted-F.
	if v, _ := f.GetCellValue(sheet, fnoteRef); v != "F" {
		t.Fatalf("R9: noted F cell %s value: got %q, want %q", fnoteRef, v, "F")
	}
	if v, _ := f.GetCellValue(sheet, fnRef); v != "F" {
		t.Fatalf("R9: non-noted F cell %s value: got %q, want %q", fnRef, v, "F")
	}
	// Sanity: the AT/J values still match.
	if v, _ := f.GetCellValue(sheet, atRef); v != "AT" {
		t.Fatalf("AT cell %s value: got %q, want %q", atRef, v, "AT")
	}
	if v, _ := f.GetCellValue(sheet, jRef); v != "J" {
		t.Fatalf("J cell %s value: got %q, want %q", jRef, v, "J")
	}
	if v, _ := f.GetCellValue(sheet, pRef); v != "A" {
		t.Fatalf("styleP cell %s value: got %q, want %q", pRef, v, "A")
	}
}

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

// ── T4 — three records (F / AT / J) on same sheet, 3 distinct shape ids (R1, R2, R4, R5, R11)

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
