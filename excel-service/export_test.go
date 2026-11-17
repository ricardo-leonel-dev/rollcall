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
	sheet, dates, _ := probeTemplate(t, 2)
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
		id: 1, name: "TEST COURSE", fullName: "PRIMERO BS", parallel: "A",
		shift: "MAÑANA", roster: roster,
		records: []absenceRecord{
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
	sheet, dates, cols := probeTemplate(t, 4)
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
		id: 1, name: "TEST COURSE", fullName: "PRIMERO BS", parallel: "A",
		shift: "MAÑANA", roster: roster,
		records: []absenceRecord{
			{studentName: "ALUMNO UNO", rosterNumber: intPtr(1), date: dateFnote, typ: "F", notes: "F with note"},
			{studentName: "ALUMNO DOS", rosterNumber: intPtr(2), date: dateFn, typ: "F"}, // F, no note
			{studentName: "ALUMNO TRES", rosterNumber: intPtr(3), date: dateAT, typ: "AT", notes: "AT with note"},
			{studentName: "ALUMNO CUATRO", rosterNumber: intPtr(4), date: dateJ, typ: "F", justified: true, notes: "J note", justificationReason: stringPtr("illness")},
			// ALUMNO CINCO has no absence record -> rangeDays fallback writes styleP at rosterFirstRow+4
		},
	}

	outputDir := t.TempDir()
	ts := time.Now().Format("20060102_150405")
	days := []time.Time{dateFnote, dateFn, dateAT, dateJ}
	p, err := processCourse("plantilla_asistencia.xlsx", outputDir, ts, cd, sheet, 0, days, nil)
	if err != nil {
		t.Fatalf("processCourse: %v", err)
	}

	// Reopen the produced temp .xlsx via excelize to inspect per-cell style.
	f, err := excelize.OpenFile(p)
	if err != nil {
		t.Fatalf("OpenFile(%s): %v", p, err)
	}
	defer f.Close()

	fnoteRef, _ := excelize.CoordinatesToCellName(colFnote, rosterFirstRow)
	fnRef, _ := excelize.CoordinatesToCellName(colFn, rosterFirstRow+1)
	atRef, _ := excelize.CoordinatesToCellName(colAT, rosterFirstRow+2)
	jRef, _ := excelize.CoordinatesToCellName(colJ, rosterFirstRow+3)
	pRef, _ := excelize.CoordinatesToCellName(colFnote, rosterFirstRow+4) // ALUMNO CINCO, no record -> styleP

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

// probeTemplate returns the first n valid (month, day) pairs from the first
// sheet of plantilla_asistencia.xlsx, paired with their resolved column index.
// Year is fixed to 2026 — processCourse only consults month + day.
func probeTemplate(t *testing.T, n int) (sheet string, dates []time.Time, cols []int) {
	t.Helper()
	const templatePath = "plantilla_asistencia.xlsx"
	f, err := excelize.OpenFile(templatePath)
	if err != nil {
		t.Fatalf("open plantilla: %v", err)
	}
	defer f.Close()
	sheet = f.GetSheetList()[0]
	colMap, err := getColumnMap(f, sheet)
	if err != nil {
		t.Fatalf("getColumnMap: %v", err)
	}
	for _, month := range monthNames {
		cd, ok := colMap[month]
		if !ok {
			continue
		}
		for d := 1; d <= 31; d++ {
			c, ok := cd[d]
			if !ok {
				continue
			}
			mIdx := slices.Index(monthNames, month) + 1
			dates = append(dates, time.Date(2026, time.Month(mIdx), d, 0, 0, 0, 0, time.UTC))
			cols = append(cols, c)
			if len(dates) >= n {
				return
			}
		}
	}
	t.Fatalf("probeTemplate: only found %d valid date(s), need %d", len(dates), n)
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
	sheet, dates, cols := probeTemplate(t, 1)
	date := dates[0]
	col := cols[0]

	roster := []rosterStudent{
		{studentName: "ALUMNO UNO", rosterNumber: intPtr(1)},
		{studentName: "ALUMNO DOS", rosterNumber: intPtr(2)},
	}
	cd := courseData{
		id: 1, name: "TEST COURSE", fullName: "PRIMERO BS", parallel: "A",
		shift: "MAÑANA", roster: roster,
		records: []absenceRecord{
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

	fcellRef, _ := excelize.CoordinatesToCellName(col, rosterFirstRow)
	atcellRef, _ := excelize.CoordinatesToCellName(col, rosterFirstRow+1)

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
	sheet, dates, cols := probeTemplate(t, 3)
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
		id: 1, name: "TEST COURSE", fullName: "PRIMERO BS", parallel: "A",
		shift: "MAÑANA", roster: roster,
		records: []absenceRecord{
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

	fRef, _ := excelize.CoordinatesToCellName(colF, rosterFirstRow)
	atRef, _ := excelize.CoordinatesToCellName(colAT, rosterFirstRow+1)
	jRef, _ := excelize.CoordinatesToCellName(colJ, rosterFirstRow+2)

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

// ── retiro: último día visible, filtrado de nómina y marca ───────────────────

// withdrawalUntil builds a withdrawal whose last visible day is the given date.
func withdrawalUntil(date, lastVisibleDay time.Time) *withdrawal {
	return &withdrawal{date: date, lastVisibleDay: &lastVisibleDay}
}

// wholeYearWithdrawal builds a withdrawal that is never visible.
func wholeYearWithdrawal(date time.Time) *withdrawal {
	return &withdrawal{date: date, lastVisibleDay: nil}
}

// buildRoster returns a five-student roster whose stored roster numbers are
// 1..5; the withdrawal of each student is taken from withdrawals (nil = none).
func buildRoster(withdrawals []*withdrawal) []rosterStudent {
	names := []string{"ALUMNO UNO", "ALUMNO DOS", "ALUMNO TRES", "ALUMNO CUATRO", "ALUMNO CINCO"}
	roster := make([]rosterStudent, 0, len(names))
	for i, name := range names {
		roster = append(roster, rosterStudent{
			studentName:  name,
			rosterNumber: intPtr(i + 1),
			withdrawal:   withdrawals[i],
		})
	}
	return roster
}

// absenceLabel describes an absence record compactly for comparisons.
func absenceLabel(rec absenceRecord) string {
	return fmt.Sprintf("%s|%s|%s", rec.studentName, rec.typ, rec.date.Format("2006-01-02"))
}

func TestWithdrawalVisibleOn(t *testing.T) {
	last := time.Date(2026, 10, 15, 0, 0, 0, 0, time.UTC)
	cases := []struct {
		name       string
		withdrawal *withdrawal
		day        time.Time
		visible    bool
	}{
		{
			name:       "a withdrawal with no visible day hides every day",
			withdrawal: wholeYearWithdrawal(time.Date(2026, 10, 15, 0, 0, 0, 0, time.UTC)),
			day:        time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC),
			visible:    false,
		},
		{
			name:       "the day before the last visible day still counts",
			withdrawal: withdrawalUntil(time.Date(2026, 10, 15, 0, 0, 0, 0, time.UTC), last),
			day:        time.Date(2026, 10, 14, 0, 0, 0, 0, time.UTC),
			visible:    true,
		},
		{
			name:       "the last visible day itself still counts",
			withdrawal: withdrawalUntil(time.Date(2026, 10, 15, 0, 0, 0, 0, time.UTC), last),
			day:        last,
			visible:    true,
		},
		{
			name:       "the day after the last visible day does not count",
			withdrawal: withdrawalUntil(time.Date(2026, 10, 15, 0, 0, 0, 0, time.UTC), last),
			day:        time.Date(2026, 10, 16, 0, 0, 0, 0, time.UTC),
			visible:    false,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := tc.withdrawal.visibleOn(tc.day); got != tc.visible {
				t.Fatalf("visibleOn(%s): got %v, want %v", tc.day.Format("2006-01-02"), got, tc.visible)
			}
		})
	}
}

func TestFilterWithdrawn(t *testing.T) {
	september := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	november := time.Date(2026, 11, 30, 0, 0, 0, 0, time.UTC)
	december := time.Date(2026, 12, 10, 0, 0, 0, 0, time.UTC)

	// Cada retiro se comparte entre la fila de la nómina y sus ausencias: en
	// el export real ambas salen de la misma matrícula.
	octoberWithdrawal := withdrawalUntil(time.Date(2026, 10, 15, 0, 0, 0, 0, time.UTC), time.Date(2026, 10, 15, 0, 0, 0, 0, time.UTC))
	decemberWithdrawal := withdrawalUntil(december, november)
	yearLongWithdrawal := wholeYearWithdrawal(time.Date(2026, 10, 15, 0, 0, 0, 0, time.UTC))

	cases := []struct {
		name         string
		from         time.Time
		roster       []rosterStudent
		records      []absenceRecord
		wantNames    []string
		wantNumbers  []int
		wantAbsences []string
	}{
		{
			name: "a withdrawal visible in the period keeps the student in the roster",
			from: september,
			roster: buildRoster([]*withdrawal{
				nil, nil, nil,
				withdrawalUntil(time.Date(2026, 10, 15, 0, 0, 0, 0, time.UTC), time.Date(2026, 10, 15, 0, 0, 0, 0, time.UTC)),
				nil,
			}),
			wantNames:   []string{"ALUMNO UNO", "ALUMNO DOS", "ALUMNO TRES", "ALUMNO CUATRO", "ALUMNO CINCO"},
			wantNumbers: []int{1, 2, 3, 4, 5},
		},
		{
			name: "a withdrawal whose last visible day is the first day of the period keeps the student",
			from: september,
			roster: buildRoster([]*withdrawal{
				nil, nil, nil,
				withdrawalUntil(time.Date(2026, 10, 15, 0, 0, 0, 0, time.UTC), september),
				nil,
			}),
			wantNames:   []string{"ALUMNO UNO", "ALUMNO DOS", "ALUMNO TRES", "ALUMNO CUATRO", "ALUMNO CINCO"},
			wantNumbers: []int{1, 2, 3, 4, 5},
		},
		{
			name: "a withdrawal whose last visible day is the last day of the period keeps the student",
			from: september,
			roster: buildRoster([]*withdrawal{
				nil, nil, nil,
				withdrawalUntil(november, november),
				nil,
			}),
			wantNames:   []string{"ALUMNO UNO", "ALUMNO DOS", "ALUMNO TRES", "ALUMNO CUATRO", "ALUMNO CINCO"},
			wantNumbers: []int{1, 2, 3, 4, 5},
		},
		{
			name: "a withdrawal whose last visible day is after the period keeps the student",
			from: september,
			roster: buildRoster([]*withdrawal{
				nil, nil, nil,
				withdrawalUntil(december, december),
				nil,
			}),
			wantNames:   []string{"ALUMNO UNO", "ALUMNO DOS", "ALUMNO TRES", "ALUMNO CUATRO", "ALUMNO CINCO"},
			wantNumbers: []int{1, 2, 3, 4, 5},
		},
		{
			name: "a withdrawal whose last visible day is before the period drops the student and leaves a gap in the numbers",
			from: september,
			roster: buildRoster([]*withdrawal{
				nil, nil, nil,
				withdrawalUntil(time.Date(2026, 10, 15, 0, 0, 0, 0, time.UTC), time.Date(2026, 8, 31, 0, 0, 0, 0, time.UTC)),
				nil,
			}),
			wantNames:   []string{"ALUMNO UNO", "ALUMNO DOS", "ALUMNO TRES", "ALUMNO CINCO"},
			wantNumbers: []int{1, 2, 3, 5},
		},
		{
			name: "a withdrawal for the whole year drops the student and leaves a gap in the numbers",
			from: september,
			roster: buildRoster([]*withdrawal{
				nil, nil, nil,
				wholeYearWithdrawal(time.Date(2026, 10, 15, 0, 0, 0, 0, time.UTC)),
				nil,
			}),
			wantNames:   []string{"ALUMNO UNO", "ALUMNO DOS", "ALUMNO TRES", "ALUMNO CINCO"},
			wantNumbers: []int{1, 2, 3, 5},
		},
		{
			name: "the period start decides who is listed",
			from: time.Date(2026, 11, 2, 0, 0, 0, 0, time.UTC),
			roster: buildRoster([]*withdrawal{
				nil, nil, nil,
				withdrawalUntil(december, time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)),
				nil,
			}),
			wantNames:   []string{"ALUMNO UNO", "ALUMNO DOS", "ALUMNO TRES", "ALUMNO CINCO"},
			wantNumbers: []int{1, 2, 3, 5},
		},
		{
			name: "an absence after the last visible day is dropped",
			from: september,
			roster: buildRoster([]*withdrawal{
				nil, nil, nil, octoberWithdrawal, nil,
			}),
			records: []absenceRecord{
				{studentName: "ALUMNO CUATRO", date: time.Date(2026, 10, 20, 0, 0, 0, 0, time.UTC), typ: "F", notes: "posterior", withdrawal: octoberWithdrawal},
			},
			wantNames:    []string{"ALUMNO UNO", "ALUMNO DOS", "ALUMNO TRES", "ALUMNO CUATRO", "ALUMNO CINCO"},
			wantNumbers:  []int{1, 2, 3, 4, 5},
			wantAbsences: nil,
		},
		{
			name: "an absence on the last visible day is kept",
			from: september,
			roster: buildRoster([]*withdrawal{
				nil, nil, nil, octoberWithdrawal, nil,
			}),
			records: []absenceRecord{
				{studentName: "ALUMNO CUATRO", date: time.Date(2026, 10, 15, 0, 0, 0, 0, time.UTC), typ: "F", withdrawal: octoberWithdrawal},
			},
			wantNames:    []string{"ALUMNO UNO", "ALUMNO DOS", "ALUMNO TRES", "ALUMNO CUATRO", "ALUMNO CINCO"},
			wantNumbers:  []int{1, 2, 3, 4, 5},
			wantAbsences: []string{"ALUMNO CUATRO|F|2026-10-15"},
		},
		{
			name: "an absence between the last visible day and the withdrawal date is dropped",
			from: september,
			roster: buildRoster([]*withdrawal{
				nil, nil, nil, decemberWithdrawal, nil,
			}),
			records: []absenceRecord{
				{studentName: "ALUMNO CUATRO", date: time.Date(2026, 12, 3, 0, 0, 0, 0, time.UTC), typ: "F", withdrawal: decemberWithdrawal},
			},
			wantNames:    []string{"ALUMNO UNO", "ALUMNO DOS", "ALUMNO TRES", "ALUMNO CUATRO", "ALUMNO CINCO"},
			wantNumbers:  []int{1, 2, 3, 4, 5},
			wantAbsences: nil,
		},
		{
			name: "a withdrawal for the whole year drops the student and all their absences",
			from: september,
			roster: buildRoster([]*withdrawal{
				nil, nil, nil, yearLongWithdrawal, nil,
			}),
			records: []absenceRecord{
				{studentName: "ALUMNO CUATRO", date: time.Date(2026, 9, 15, 0, 0, 0, 0, time.UTC), typ: "F", withdrawal: yearLongWithdrawal},
			},
			wantNames:    []string{"ALUMNO UNO", "ALUMNO DOS", "ALUMNO TRES", "ALUMNO CINCO"},
			wantNumbers:  []int{1, 2, 3, 5},
			wantAbsences: nil,
		},
		{
			name: "the absences of a dropped student never reach a student sharing their name",
			from: september,
			roster: []rosterStudent{
				{studentName: "PEREZ LOPEZ JUAN", rosterNumber: intPtr(1)},
				{studentName: "PEREZ LOPEZ PEDRO", rosterNumber: intPtr(2), withdrawal: yearLongWithdrawal},
			},
			records: []absenceRecord{
				{studentName: "PEREZ LOPEZ PEDRO", date: time.Date(2026, 9, 15, 0, 0, 0, 0, time.UTC), typ: "F", withdrawal: yearLongWithdrawal},
			},
			wantNames:    []string{"PEREZ LOPEZ JUAN"},
			wantNumbers:  []int{1},
			wantAbsences: nil,
		},
		{
			name:   "a student without withdrawal keeps everything",
			from:   september,
			roster: buildRoster([]*withdrawal{nil, nil, nil, nil, nil}),
			records: []absenceRecord{
				{studentName: "ALUMNO CUATRO", date: time.Date(2026, 9, 15, 0, 0, 0, 0, time.UTC), typ: "F"},
				{studentName: "ALUMNO UNO", date: time.Date(2026, 10, 20, 0, 0, 0, 0, time.UTC), typ: "AT"},
			},
			wantNames:   []string{"ALUMNO UNO", "ALUMNO DOS", "ALUMNO TRES", "ALUMNO CUATRO", "ALUMNO CINCO"},
			wantNumbers: []int{1, 2, 3, 4, 5},
			wantAbsences: []string{
				"ALUMNO CUATRO|F|2026-09-15",
				"ALUMNO UNO|AT|2026-10-20",
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			cd := courseData{id: 1, name: "CURSO DE PRUEBA", roster: tc.roster, records: tc.records}
			got := filterWithdrawn(cd, tc.from)

			var names []string
			var numbers []int
			for _, student := range got.roster {
				names = append(names, student.studentName)
				if student.rosterNumber != nil {
					numbers = append(numbers, *student.rosterNumber)
				}
			}
			if !reflect.DeepEqual(names, tc.wantNames) {
				t.Fatalf("roster names: got %v, want %v", names, tc.wantNames)
			}
			if !reflect.DeepEqual(numbers, tc.wantNumbers) {
				t.Fatalf("roster numbers: got %v, want %v", numbers, tc.wantNumbers)
			}

			var labels []string
			for _, rec := range got.records {
				labels = append(labels, absenceLabel(rec))
			}
			if !reflect.DeepEqual(labels, tc.wantAbsences) {
				t.Fatalf("absences: got %v, want %v", labels, tc.wantAbsences)
			}

			// The input must stay untouched: the filter returns a copy.
			if len(cd.roster) != len(tc.roster) {
				t.Fatalf("input roster was mutated: got %d entries, want %d", len(cd.roster), len(tc.roster))
			}
			if len(cd.records) != len(tc.records) {
				t.Fatalf("input absences were mutated: got %d entries, want %d", len(cd.records), len(tc.records))
			}
		})
	}
}

func TestNameWithWithdrawalMark(t *testing.T) {
	cases := []struct {
		name    string
		student rosterStudent
		want    string
	}{
		{
			name:    "a student without withdrawal keeps the plain name",
			student: rosterStudent{studentName: "PEREZ LOPEZ JUAN", rosterNumber: intPtr(1)},
			want:    "PEREZ LOPEZ JUAN",
		},
		{
			name: "the mark shows the withdrawal date",
			student: rosterStudent{
				studentName:  "PEREZ LOPEZ JUAN",
				rosterNumber: intPtr(1),
				withdrawal:   withdrawalUntil(time.Date(2026, 10, 15, 0, 0, 0, 0, time.UTC), time.Date(2026, 10, 15, 0, 0, 0, 0, time.UTC)),
			},
			want: "PEREZ LOPEZ JUAN (RETIRADO 15/10/2026)",
		},
		{
			name: "the day of the withdrawal is zero padded",
			student: rosterStudent{
				studentName:  "PEREZ LOPEZ JUAN",
				rosterNumber: intPtr(1),
				withdrawal:   withdrawalUntil(time.Date(2026, 3, 5, 0, 0, 0, 0, time.UTC), time.Date(2026, 3, 5, 0, 0, 0, 0, time.UTC)),
			},
			want: "PEREZ LOPEZ JUAN (RETIRADO 05/03/2026)",
		},
		{
			name: "the mark shows the withdrawal date, not the last visible day",
			student: rosterStudent{
				studentName:  "PEREZ LOPEZ JUAN",
				rosterNumber: intPtr(1),
				withdrawal:   withdrawalUntil(time.Date(2026, 12, 10, 0, 0, 0, 0, time.UTC), time.Date(2026, 11, 30, 0, 0, 0, 0, time.UTC)),
			},
			want: "PEREZ LOPEZ JUAN (RETIRADO 10/12/2026)",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := nameWithWithdrawalMark(tc.student); got != tc.want {
				t.Fatalf("name cell: got %q, want %q", got, tc.want)
			}
		})
	}
}

// ── processCourse con estudiantes retirados ─────────────────────────────────

// commentTextFor returns the text of the comment attached to the given cell
// reference in an xl/comments1.xml payload ("" when the cell has none).
func commentTextFor(commentsXML []byte, ref string) string {
	re := regexp.MustCompile(`(?s)<comment ref="` + regexp.QuoteMeta(ref) + `"[^>]*>(.*?)</comment>`)
	m := re.FindSubmatch(commentsXML)
	if m == nil {
		return ""
	}
	tm := regexp.MustCompile(`(?s)<t[^>]*>(.*?)</t>`).FindSubmatch(m[1])
	if tm == nil {
		return ""
	}
	return string(tm[1])
}

// readCommentsPart returns the xl/comments1.xml payload of a workbook (nil
// when the workbook has no comments).
func readCommentsPart(t *testing.T, path string) []byte {
	t.Helper()
	entries, err := readZipEntries(path)
	if err != nil {
		t.Fatalf("readZipEntries(%s): %v", path, err)
	}
	for _, e := range entries {
		if e.name == "xl/comments1.xml" {
			return e.content
		}
	}
	return nil
}

// cellSnapshot is the value and style of one cell of a generated workbook.
type cellSnapshot struct {
	ref   string
	value string
	style int
}

// snapshotCells reads the value and the style of every given cell reference.
func snapshotCells(t *testing.T, path, sheet string, refs []string) []cellSnapshot {
	t.Helper()
	f, err := excelize.OpenFile(path)
	if err != nil {
		t.Fatalf("open %s: %v", path, err)
	}
	defer f.Close()
	snapshot := make([]cellSnapshot, 0, len(refs))
	for _, ref := range refs {
		value, err := f.GetCellValue(sheet, ref)
		if err != nil {
			t.Fatalf("GetCellValue(%s): %v", ref, err)
		}
		style, err := f.GetCellStyle(sheet, ref)
		if err != nil {
			t.Fatalf("GetCellStyle(%s): %v", ref, err)
		}
		snapshot = append(snapshot, cellSnapshot{ref: ref, value: value, style: style})
	}
	return snapshot
}

func TestProcessCourse_WithdrawnStudent(t *testing.T) {
	sheet, dates, cols := probeTemplate(t, 5)
	day1, day2, day3, day4, day5 := dates[0], dates[1], dates[2], dates[3], dates[4]
	col1, col2, col3, col4 := cols[0], cols[1], cols[2], cols[3]

	withdrawalUntilDay2 := withdrawalUntil(day2, day2)
	withdrawalUntilTrimesterStart := withdrawalUntil(day4, day2)
	withdrawalAfterPeriod := withdrawalUntil(day5, day5)

	roster := []rosterStudent{
		{studentName: "ALUMNO RETIRADO", rosterNumber: intPtr(1), withdrawal: withdrawalUntilDay2},
		{studentName: "ALUMNO TRIMESTRE", rosterNumber: intPtr(2), withdrawal: withdrawalUntilTrimesterStart},
		{studentName: "ALUMNO POSTERIOR", rosterNumber: intPtr(3), withdrawal: withdrawalAfterPeriod},
		{studentName: "ALUMNO NORMAL", rosterNumber: intPtr(4)},
	}
	cd := courseData{
		id: 1, name: "TEST COURSE", fullName: "PRIMERO BS", parallel: "A",
		shift: "MAÑANA", roster: roster,
		records: []absenceRecord{
			{studentName: "ALUMNO RETIRADO", date: day2, typ: "F", notes: "gripe", withdrawal: withdrawalUntilDay2},
			{studentName: "ALUMNO RETIRADO", date: day3, typ: "F", notes: "posterior al retiro", withdrawal: withdrawalUntilDay2},
			{studentName: "ALUMNO TRIMESTRE", date: day3, typ: "F", notes: "entre el trimestre y el retiro", withdrawal: withdrawalUntilTrimesterStart},
		},
	}

	cd = filterWithdrawn(cd, day1)

	outputDir := t.TempDir()
	ts := time.Now().Format("20060102_150405")
	p, err := processCourse("plantilla_asistencia.xlsx", outputDir, ts, cd, sheet, 0, []time.Time{day1, day2, day3, day4}, nil)
	if err != nil {
		t.Fatalf("processCourse: %v", err)
	}

	f, err := excelize.OpenFile(p)
	if err != nil {
		t.Fatalf("open %s: %v", p, err)
	}
	defer f.Close()

	value := func(row, col int) string {
		t.Helper()
		ref, _ := excelize.CoordinatesToCellName(col, row)
		v, err := f.GetCellValue(sheet, ref)
		if err != nil {
			t.Fatalf("GetCellValue(%s): %v", ref, err)
		}
		return v
	}
	style := func(row, col int) int {
		t.Helper()
		ref, _ := excelize.CoordinatesToCellName(col, row)
		idx, err := f.GetCellStyle(sheet, ref)
		if err != nil {
			t.Fatalf("GetCellStyle(%s): %v", ref, err)
		}
		return idx
	}
	nameCell := func(row int) string {
		t.Helper()
		ref, _ := excelize.CoordinatesToCellName(2, row)
		v, err := f.GetCellValue(sheet, ref)
		if err != nil {
			t.Fatalf("GetCellValue(%s): %v", ref, err)
		}
		return v
	}

	// La marca del retiro va en la celda del nombre, con la fecha del retiro.
	for _, tc := range []struct {
		row  int
		want string
	}{
		{rosterFirstRow, "ALUMNO RETIRADO (RETIRADO " + day2.Format("02/01/2006") + ")"},
		{rosterFirstRow + 1, "ALUMNO TRIMESTRE (RETIRADO " + day4.Format("02/01/2006") + ")"},
		{rosterFirstRow + 2, "ALUMNO POSTERIOR (RETIRADO " + day5.Format("02/01/2006") + ")"},
		{rosterFirstRow + 3, "ALUMNO NORMAL"},
	} {
		if got := nameCell(tc.row); got != tc.want {
			t.Fatalf("name cell of row %d: got %q, want %q", tc.row, got, tc.want)
		}
	}

	// El número de nómina guardado se respeta.
	for i, row := range []int{rosterFirstRow, rosterFirstRow + 1, rosterFirstRow + 2, rosterFirstRow + 3} {
		ref, _ := excelize.CoordinatesToCellName(1, row)
		got, err := f.GetCellValue(sheet, ref)
		if err != nil {
			t.Fatalf("GetCellValue(%s): %v", ref, err)
		}
		if got != fmt.Sprintf("%d", i+1) {
			t.Fatalf("roster number of row %d: got %q, want %d", row, got, i+1)
		}
	}

	// Días: hasta el último día visible la absences manda, después la celda
	// queda en blanco y sin el estilo de presencia.
	for _, tc := range []struct {
		row  int
		want []string
	}{
		{rosterFirstRow, []string{"A", "F", "", ""}},
		{rosterFirstRow + 1, []string{"A", "A", "", ""}},
		{rosterFirstRow + 2, []string{"A", "A", "A", "A"}},
		{rosterFirstRow + 3, []string{"A", "A", "A", "A"}},
	} {
		for i, want := range tc.want {
			col := []int{col1, col2, col3, col4}[i]
			if got := value(tc.row, col); got != want {
				t.Fatalf("cell of row %d and day %d: got %q, want %q", tc.row, i+1, got, want)
			}
		}
	}

	// La celda en blanco conserva el estilo de la plantilla: ni el de la
	// ausencia ni el de la presencia.
	if style(rosterFirstRow, col3) == style(rosterFirstRow, col2) {
		t.Fatalf("blanked cell must not keep the absence style")
	}
	if style(rosterFirstRow, col3) == style(rosterFirstRow+3, col3) {
		t.Fatalf("blanked cell must not use the presence style")
	}

	// Las celdas en blanco no llevan comentario.
	commentsXML := readCommentsPart(t, p)
	if commentsXML == nil {
		t.Fatalf("xl/comments1.xml missing in output")
	}
	rowRef, _ := excelize.CoordinatesToCellName(col2, rosterFirstRow)
	if commentTextFor(commentsXML, rowRef) == "" {
		t.Fatalf("the absence on the last visible day must keep its comment")
	}
	for _, row := range []int{rosterFirstRow, rosterFirstRow + 1} {
		for _, col := range []int{col3, col4} {
			ref, _ := excelize.CoordinatesToCellName(col, row)
			if text := commentTextFor(commentsXML, ref); text != "" {
				t.Fatalf("cell %s must not carry a comment, got %q", ref, text)
			}
		}
	}
}

func TestProcessCourse_WithdrawnStudentKeepsEarlierRecords(t *testing.T) {
	sheet, dates, cols := probeTemplate(t, 3)
	day1, day2, day3 := dates[0], dates[1], dates[2]
	col1, col2, col3 := cols[0], cols[1], cols[2]

	withdrawalUntilDay3 := withdrawalUntil(day3, day3)

	cd := courseData{
		id: 1, name: "TEST COURSE", fullName: "PRIMERO BS", parallel: "A",
		shift: "MAÑANA",
		roster: []rosterStudent{
			{studentName: "ALUMNO RETIRADO", rosterNumber: intPtr(1), withdrawal: withdrawalUntilDay3},
			{studentName: "ALUMNO NORMAL", rosterNumber: intPtr(2)},
		},
		records: []absenceRecord{
			{studentName: "ALUMNO RETIRADO", date: day1, typ: "F", notes: "gripe", withdrawal: withdrawalUntilDay3},
			{studentName: "ALUMNO RETIRADO", date: day2, typ: "AT", withdrawal: withdrawalUntilDay3},
			{studentName: "ALUMNO RETIRADO", date: day3, typ: "F", justified: true, notes: "reposo", justificationReason: stringPtr("enfermedad"), withdrawal: withdrawalUntilDay3},
			{studentName: "ALUMNO NORMAL", date: day1, typ: "F", notes: "gripe"},
			{studentName: "ALUMNO NORMAL", date: day2, typ: "AT"},
			{studentName: "ALUMNO NORMAL", date: day3, typ: "F", justified: true, notes: "reposo", justificationReason: stringPtr("enfermedad")},
		},
	}

	cd = filterWithdrawn(cd, day1)

	outputDir := t.TempDir()
	ts := time.Now().Format("20060102_150405")
	p, err := processCourse("plantilla_asistencia.xlsx", outputDir, ts, cd, sheet, 0, []time.Time{day1, day2, day3}, nil)
	if err != nil {
		t.Fatalf("processCourse: %v", err)
	}

	commentsXML := readCommentsPart(t, p)
	if commentsXML == nil {
		t.Fatalf("xl/comments1.xml missing in output")
	}

	f, err := excelize.OpenFile(p)
	if err != nil {
		t.Fatalf("open %s: %v", p, err)
	}
	defer f.Close()

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

	// Las ausencias hasta el último día visible se exportan igual que las de
	// un estudiante sin retiro.
	for i, tc := range []struct {
		col   int
		value string
	}{
		{col1, "F"},
		{col2, "AT"},
		{col3, "J"},
	} {
		withdrawnRef, _ := excelize.CoordinatesToCellName(tc.col, rosterFirstRow)
		regularRef, _ := excelize.CoordinatesToCellName(tc.col, rosterFirstRow+1)

		gotWithdrawn, err := f.GetCellValue(sheet, withdrawnRef)
		if err != nil {
			t.Fatalf("GetCellValue(%s): %v", withdrawnRef, err)
		}
		gotRegular, err := f.GetCellValue(sheet, regularRef)
		if err != nil {
			t.Fatalf("GetCellValue(%s): %v", regularRef, err)
		}
		if gotWithdrawn != tc.value || gotRegular != tc.value {
			t.Fatalf("record %d: withdrawn cell %s is %q and regular cell %s is %q, want %q in both", i+1, withdrawnRef, gotWithdrawn, regularRef, gotRegular, tc.value)
		}

		if hasDiagonal(withdrawnRef) != hasDiagonal(regularRef) {
			t.Fatalf("record %d: the note border of %s and %s must match", i+1, withdrawnRef, regularRef)
		}

		withdrawnText := commentTextFor(commentsXML, withdrawnRef)
		regularText := commentTextFor(commentsXML, regularRef)
		if withdrawnText != regularText {
			t.Fatalf("record %d: comment of %s is %q and comment of %s is %q, want the same text", i+1, withdrawnRef, withdrawnText, regularRef, regularText)
		}
	}
}

func TestProcessCourse_NoWithdrawalsUnchanged(t *testing.T) {
	sheet, dates, cols := probeTemplate(t, 4)
	days := dates[:4]

	cd := courseData{
		id: 1, name: "TEST COURSE", fullName: "PRIMERO BS", parallel: "A",
		shift: "MAÑANA",
		roster: []rosterStudent{
			{studentName: "ALUMNO UNO", rosterNumber: intPtr(1)},
			{studentName: "ALUMNO DOS", rosterNumber: intPtr(2)},
			{studentName: "ALUMNO TRES", rosterNumber: intPtr(3)},
		},
		records: []absenceRecord{
			{studentName: "ALUMNO UNO", date: days[0], typ: "F", notes: "gripe"},
			{studentName: "ALUMNO DOS", date: days[1], typ: "AT"},
			{studentName: "ALUMNO TRES", date: days[2], typ: "F", justified: true, notes: "reposo", justificationReason: stringPtr("enfermedad")},
		},
	}

	outputDir := t.TempDir()
	ts := time.Now().Format("20060102_150405")

	filtered := filterWithdrawn(cd, days[0])
	filtered.id = 11
	pFiltered, err := processCourse("plantilla_asistencia.xlsx", outputDir, ts, filtered, sheet, 0, days, nil)
	if err != nil {
		t.Fatalf("processCourse (filtered): %v", err)
	}

	unfiltered := cd
	unfiltered.id = 12
	pUnfiltered, err := processCourse("plantilla_asistencia.xlsx", outputDir, ts, unfiltered, sheet, 0, days, nil)
	if err != nil {
		t.Fatalf("processCourse (not filtered): %v", err)
	}

	var refs []string
	for i := range 3 {
		row := rosterFirstRow + i
		for _, col := range []int{1, 2} {
			ref, _ := excelize.CoordinatesToCellName(col, row)
			refs = append(refs, ref)
		}
		for _, col := range cols[:4] {
			ref, _ := excelize.CoordinatesToCellName(col, row)
			refs = append(refs, ref)
		}
	}

	filteredCells := snapshotCells(t, pFiltered, sheet, refs)
	unfilteredCells := snapshotCells(t, pUnfiltered, sheet, refs)
	if !reflect.DeepEqual(filteredCells, unfilteredCells) {
		t.Fatalf("a course without withdrawals must export exactly as before:\nfiltered:   %+v\nnot filtered: %+v", filteredCells, unfilteredCells)
	}

	filteredComments := readCommentsPart(t, pFiltered)
	unfilteredComments := readCommentsPart(t, pUnfiltered)
	if !bytes.Equal(filteredComments, unfilteredComments) {
		t.Fatalf("the comments of a course without withdrawals must not change")
	}
}
