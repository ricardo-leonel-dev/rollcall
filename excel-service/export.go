package main

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/xuri/excelize/v2"
)

var monthNames = []string{
	"ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
	"JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE",
}

const (
	filaInicialNomina = 11
	filaFinalNomina   = 40
)

type absenceRecord struct {
	studentName         string
	rosterNumber        *int
	date                time.Time
	typ                 string
	notes               string
	justified           bool
	justificationReason *string
}

type rosterStudent struct {
	studentName  string
	rosterNumber *int
}

type courseData struct {
	id        int
	name      string
	fullName  string
	paralelo  string
	shift     string
	roster    []rosterStudent
	registros []absenceRecord
}

// ── template helpers ──────────────────────────────────────────────────────────

func isMonth(s string) bool {
	for _, m := range monthNames {
		if m == s {
			return true
		}
	}
	return false
}

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

func escribirNomina(f *excelize.File, sheet string, roster []rosterStudent) error {
	for idx, est := range roster {
		row := filaInicialNomina + idx
		if row > filaFinalNomina {
			break
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

var ordinalWords = map[string]string{
	"1": "PRIMERO", "2": "SEGUNDO", "3": "TERCERO", "4": "CUARTO", "5": "QUINTO",
	"6": "SEXTO", "7": "SÉPTIMO", "8": "OCTAVO", "9": "NOVENO", "10": "DÉCIMO",
}
var reGradeOrdinal = regexp.MustCompile(`^(\d{1,2})(?:ERO|ER|DO|RO|TO|MO|VO|NO|MA)\b`)

// gradoDesdeAbreviado infers the grade word from a leading numeral-ordinal
// abbreviation in the course's abbreviated name (e.g. "10MO F BS" -> "DÉCIMO F BS").
// Used only as a fallback for courses without a structured full_name yet.
func gradoDesdeAbreviado(courseName string) string {
	upper := strings.ToUpper(strings.TrimSpace(courseName))
	loc := reGradeOrdinal.FindStringSubmatchIndex(upper)
	if loc == nil {
		return upper
	}
	word, ok := ordinalWords[upper[loc[2]:loc[3]]]
	if !ok {
		return upper
	}
	return word + upper[loc[1]:]
}

// insertarParalelo inserts the paralelo (quoted, uppercase) right after the
// first word of the grade text, e.g. "DÉCIMO BS" + "A" -> `DÉCIMO "A" BS`.
func insertarParalelo(grado, paralelo string) string {
	paralelo = strings.ToUpper(strings.TrimSpace(paralelo))
	if paralelo == "" {
		return grado
	}
	partes := strings.SplitN(grado, " ", 2)
	if len(partes) == 2 {
		return partes[0] + ` "` + paralelo + `" ` + partes[1]
	}
	return grado + ` "` + paralelo + `"`
}

// gradoDisplay prefers the structured full_name (with paralelo inserted after
// the first word); falls back to inferring the grade word from the
// abbreviated name for courses not yet migrated — that fallback already
// carries the paralelo embedded (e.g. "10MO F BS"), so it isn't added again.
func gradoDisplay(cd courseData) string {
	if fn := strings.ToUpper(strings.TrimSpace(cd.fullName)); fn != "" {
		return insertarParalelo(fn, cd.paralelo)
	}
	return gradoDesdeAbreviado(cd.name)
}

// escribirGradoYJornada writes the course's grade (C9) and shift (B9) values.
func escribirGradoYJornada(f *excelize.File, sheet string, cd courseData) {
	f.SetCellValue(sheet, "C9", gradoDisplay(cd))
	f.SetCellValue(sheet, "B9", strings.ToUpper(strings.TrimSpace(cd.shift)))
}

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

func parseCourseIDs(q map[string][]string) ([]int, error) {
	if vals, ok := q["course_ids"]; ok && len(vals) > 0 && vals[0] != "" {
		parts := strings.Split(vals[0], ",")
		ids := make([]int, 0, len(parts))
		for _, p := range parts {
			id, err := strconv.Atoi(strings.TrimSpace(p))
			if err != nil {
				return nil, fmt.Errorf("invalid course id: %s", p)
			}
			ids = append(ids, id)
		}
		if len(ids) == 0 {
			return nil, fmt.Errorf("course_ids is empty")
		}
		return ids, nil
	}
	if vals, ok := q["course_id"]; ok && len(vals) > 0 && vals[0] != "" {
		id, err := strconv.Atoi(strings.TrimSpace(vals[0]))
		if err != nil {
			return nil, fmt.Errorf("invalid course_id: %s", vals[0])
		}
		return []int{id}, nil
	}
	return nil, fmt.Errorf("course_ids or course_id required")
}

func truncateSheetName(name string) string {
	runes := []rune(name)
	if len(runes) > 31 {
		return string(runes[:31])
	}
	return name
}

// ── ZIP utilities ─────────────────────────────────────────────────────────────

type zipEntry struct {
	name    string
	content []byte
}

func readZipEntries(path string) ([]zipEntry, error) {
	r, err := zip.OpenReader(path)
	if err != nil {
		return nil, err
	}
	defer r.Close()
	var entries []zipEntry
	for _, f := range r.File {
		rc, err := f.Open()
		if err != nil {
			return nil, err
		}
		data, err := io.ReadAll(rc)
		rc.Close()
		if err != nil {
			return nil, err
		}
		entries = append(entries, zipEntry{f.Name, data})
	}
	return entries, nil
}

func writeZipEntries(path string, entries []zipEntry) error {
	var buf bytes.Buffer
	w := zip.NewWriter(&buf)
	for _, e := range entries {
		fw, err := w.Create(e.name)
		if err != nil {
			return err
		}
		if _, err := fw.Write(e.content); err != nil {
			return err
		}
	}
	if err := w.Close(); err != nil {
		return err
	}
	return os.WriteFile(path, buf.Bytes(), 0644)
}

// ── shared-string merge ───────────────────────────────────────────────────────

var (
	reSI              = regexp.MustCompile(`(?s)<si>.*?</si>`)
	reSSTOpen         = regexp.MustCompile(`<sst\b[^>]*>`)
	reCountAttr       = regexp.MustCompile(`\bcount="[^"]*"`)
	reUniqueCountAttr = regexp.MustCompile(`\buniqueCount="[^"]*"`)
	reSSCellRef       = regexp.MustCompile(`(?s)(<c\b[^>]*\bt="s"[^>]*>.*?<v>)(\d+)(</v>)`)
	reRIdNum          = regexp.MustCompile(`\bId="rId(\d+)"`)
	reSheetIdNum      = regexp.MustCompile(`\bsheetId="(\d+)"`)
)

// mergeSharedStrings merges extra's <si> entries into base.
// Returns the merged XML and a map from extra-index → merged-index.
func mergeSharedStrings(baseXML, extraXML []byte) ([]byte, map[int]int) {
	baseSIs := reSI.FindAll(baseXML, -1)
	extraSIs := reSI.FindAll(extraXML, -1)

	baseIndex := make(map[string]int, len(baseSIs))
	for i, si := range baseSIs {
		baseIndex[string(bytes.TrimSpace(si))] = i
	}

	remapping := make(map[int]int, len(extraSIs))
	var newSIs [][]byte
	for i, si := range extraSIs {
		key := string(bytes.TrimSpace(si))
		if idx, found := baseIndex[key]; found {
			remapping[i] = idx
		} else {
			newIdx := len(baseSIs) + len(newSIs)
			baseIndex[key] = newIdx
			remapping[i] = newIdx
			newSIs = append(newSIs, si)
		}
	}

	allSIs := append(baseSIs, newSIs...)
	total := len(allSIs)

	headerLoc := reSSTOpen.FindIndex(baseXML)
	if headerLoc == nil {
		return baseXML, remapping
	}
	prefix := baseXML[:headerLoc[0]]
	header := string(baseXML[headerLoc[0]:headerLoc[1]])
	header = reCountAttr.ReplaceAllString(header, fmt.Sprintf(`count="%d"`, total))
	header = reUniqueCountAttr.ReplaceAllString(header, fmt.Sprintf(`uniqueCount="%d"`, total))

	var sb strings.Builder
	sb.Write(prefix)
	sb.WriteString(header)
	for _, si := range allSIs {
		sb.Write(si)
	}
	sb.WriteString("</sst>")
	return []byte(sb.String()), remapping
}

// remapSharedStringRefs rewrites <v>N</v> inside t="s" cells using the given mapping.
func remapSharedStringRefs(sheetXML []byte, remapping map[int]int) []byte {
	return reSSCellRef.ReplaceAllFunc(sheetXML, func(m []byte) []byte {
		sub := reSSCellRef.FindSubmatch(m)
		if len(sub) < 4 {
			return m
		}
		srcIdx, err := strconv.Atoi(string(sub[2]))
		if err != nil {
			return m
		}
		baseIdx, ok := remapping[srcIdx]
		if !ok {
			return m
		}
		return append(append(append([]byte{}, sub[1]...), []byte(strconv.Itoa(baseIdx))...), sub[3]...)
	})
}

func maxIntInRegex(re *regexp.Regexp, data []byte) int {
	max := 0
	for _, m := range re.FindAllSubmatch(data, -1) {
		if n, err := strconv.Atoi(string(m[1])); err == nil && n > max {
			max = n
		}
	}
	return max
}

func xmlEscAttr(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, `"`, "&quot;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	return s
}

// ── mergeWorkbooks ────────────────────────────────────────────────────────────

// mergeWorkbooks inserts each extra single-sheet xlsx into basePath as additional sheets.
func mergeWorkbooks(basePath string, extraPaths []string, extraSheetNames []string) error {
	entries, err := readZipEntries(basePath)
	if err != nil {
		return fmt.Errorf("mergeWorkbooks: read base: %w", err)
	}

	// Build index for fast lookup / in-place update
	idx := make(map[string]int, len(entries))
	for i, e := range entries {
		idx[e.name] = i
	}
	get := func(name string) []byte {
		if i, ok := idx[name]; ok {
			return entries[i].content
		}
		return nil
	}
	set := func(name string, content []byte) {
		if i, ok := idx[name]; ok {
			entries[i].content = content
		} else {
			entries = append(entries, zipEntry{name, content})
			idx[name] = len(entries) - 1
		}
	}

	for i, extraPath := range extraPaths {
		sheetNum := i + 2 // base already occupies sheet1

		extraEntries, err := readZipEntries(extraPath)
		if err != nil {
			return fmt.Errorf("mergeWorkbooks: read extra %s: %w", extraPath, err)
		}
		extra := make(map[string][]byte, len(extraEntries))
		for _, e := range extraEntries {
			extra[e.name] = e.content
		}

		// Merge shared strings and build index remapping
		var remapping map[int]int
		if baseSST := get("xl/sharedStrings.xml"); baseSST != nil {
			if extraSST := extra["xl/sharedStrings.xml"]; extraSST != nil {
				merged, remap := mergeSharedStrings(baseSST, extraSST)
				set("xl/sharedStrings.xml", merged)
				remapping = remap
			}
		}

		// Add sheet XML (with remapped shared-string refs)
		newSheetFile := fmt.Sprintf("xl/worksheets/sheet%d.xml", sheetNum)
		sheetXML := extra["xl/worksheets/sheet1.xml"]
		if remapping != nil {
			sheetXML = remapSharedStringRefs(sheetXML, remapping)
		}
		set(newSheetFile, sheetXML)

		// Copy sheet rels (comments / VML drawings) if present
		if sheetRels := extra["xl/worksheets/_rels/sheet1.xml.rels"]; sheetRels != nil {
			newComment := fmt.Sprintf("comments%d.xml", sheetNum)
			newVml := fmt.Sprintf("vmlDrawing%d.vml", sheetNum)
			sheetRels = bytes.ReplaceAll(sheetRels, []byte("comments1.xml"), []byte(newComment))
			sheetRels = bytes.ReplaceAll(sheetRels, []byte("vmlDrawing1.vml"), []byte(newVml))
			set(fmt.Sprintf("xl/worksheets/_rels/sheet%d.xml.rels", sheetNum), sheetRels)
		}
		if commentsXML := extra["xl/comments1.xml"]; commentsXML != nil {
			newKey := fmt.Sprintf("xl/comments%d.xml", sheetNum)
			set(newKey, commentsXML)
			ct := get("[Content_Types].xml")
			override := fmt.Sprintf(`<Override PartName="/xl/comments%d.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml"/>`, sheetNum)
			ct = bytes.Replace(ct, []byte("</Types>"), []byte(override+"</Types>"), 1)
			set("[Content_Types].xml", ct)
		}
		if vmlXML := extra["xl/drawings/vmlDrawing1.vml"]; vmlXML != nil {
			set(fmt.Sprintf("xl/drawings/vmlDrawing%d.vml", sheetNum), vmlXML)
		}

		// [Content_Types].xml — add Override for new sheet
		ct := get("[Content_Types].xml")
		ct = bytes.Replace(ct, []byte("</Types>"),
			[]byte(fmt.Sprintf(`<Override PartName="/xl/worksheets/sheet%d.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`, sheetNum)+"</Types>"), 1)
		set("[Content_Types].xml", ct)

		// xl/_rels/workbook.xml.rels — add worksheet relationship
		rels := get("xl/_rels/workbook.xml.rels")
		nextRId := maxIntInRegex(reRIdNum, rels) + 1
		rId := fmt.Sprintf("rId%d", nextRId)
		rel := fmt.Sprintf(`<Relationship Id="%s" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet%d.xml"/>`, rId, sheetNum)
		rels = bytes.Replace(rels, []byte("</Relationships>"), []byte(rel+"</Relationships>"), 1)
		set("xl/_rels/workbook.xml.rels", rels)

		// xl/workbook.xml — add <sheet> entry
		wb := get("xl/workbook.xml")
		nextSheetId := maxIntInRegex(reSheetIdNum, wb) + 1
		sheetEntry := fmt.Sprintf(`<sheet name="%s" sheetId="%d" r:id="%s"/>`, xmlEscAttr(extraSheetNames[i]), nextSheetId, rId)
		wb = bytes.Replace(wb, []byte("</sheets>"), []byte(sheetEntry+"</sheets>"), 1)
		set("xl/workbook.xml", wb)
	}

	return writeZipEntries(basePath, entries)
}

// ── stripExternalLinks ────────────────────────────────────────────────────────

var (
	reExtLinkRel = regexp.MustCompile(`(?s)<Relationship\b[^>]*externalLink[^>]*/>\s*`)
	reExtRefs    = regexp.MustCompile(`(?s)<externalReferences\b[^>]*>.*?</externalReferences>\s*`)
	reExtCT      = regexp.MustCompile(`(?s)<Override\b[^>]*externalLink[^>]*/>\s*`)
)

// stripExternalLinks removes xl/externalLinks/* and all references to them so
// that FullCalcOnLoad does not trigger the "unable to refresh" dialog.
func stripExternalLinks(zipPath string) error {
	entries, err := readZipEntries(zipPath)
	if err != nil {
		return err
	}
	cleaned := entries[:0]
	for _, e := range entries {
		if strings.HasPrefix(e.name, "xl/externalLinks") {
			continue
		}
		switch e.name {
		case "xl/_rels/workbook.xml.rels":
			e.content = reExtLinkRel.ReplaceAll(e.content, nil)
		case "xl/workbook.xml":
			e.content = reExtRefs.ReplaceAll(e.content, nil)
		case "[Content_Types].xml":
			e.content = reExtCT.ReplaceAll(e.content, nil)
		}
		cleaned = append(cleaned, e)
	}
	return writeZipEntries(zipPath, cleaned)
}

// ── dedupeCommentShapeIDs ─────────────────────────────────────────────────────

// reVMLShapeID matches the id attribute of <v:shape> elements in a VML drawing
// part. The _x0000_s prefix is specific to <v:shape>; the sheet's single,
// shared <v:shapetype id="_x0000_t202"> uses a different prefix (_x0000_t) and
// must not be renumbered.
var reVMLShapeID = regexp.MustCompile(`id="_x0000_s\d+"`)

// dedupeCommentShapeIDs rewrites the id attribute of every <v:shape> found in
// zipPath's xl/drawings/vmlDrawing*.vml parts so each comment shape on a given
// sheet gets a unique, sequential id starting at 1025 (matching the id Excel
// itself uses for the first manually-added comment on a sheet). excelize's
// AddComment hardcodes id="_x0000_s1025" for every shape it appends (see
// addDrawingVML in the vendored excelize v2.10.1's vml.go), so any sheet with
// 2+ comments ends up with duplicate ids, which real Excel's VML/legacy-drawing
// object model does not tolerate (R4). No-ops (returns nil without rewriting
// the zip) if the file has no vmlDrawing part, i.e. the course had zero
// comments.
func dedupeCommentShapeIDs(zipPath string) error {
	entries, err := readZipEntries(zipPath)
	if err != nil {
		return err
	}
	changed := false
	for i, e := range entries {
		if !strings.HasPrefix(e.name, "xl/drawings/vmlDrawing") || !strings.HasSuffix(e.name, ".vml") {
			continue
		}
		next := 1025
		entries[i].content = reVMLShapeID.ReplaceAllFunc(e.content, func([]byte) []byte {
			id := fmt.Sprintf(`id="_x0000_s%d"`, next)
			next++
			return []byte(id)
		})
		changed = true
	}
	if !changed {
		return nil
	}
	return writeZipEntries(zipPath, entries)
}

// ── commentBoxSize ────────────────────────────────────────────────────────────

const (
	commentMinWidth  uint = 140 // matches excelize's own unset-Comment default (prepareFormCtrlOptions) — a short note's box is unchanged from today
	commentMaxWidth  uint = 220
	commentMinHeight uint = 60  // matches excelize's own unset-Comment default
	commentMaxHeight uint = 300 // still manually resizable past this in Excel; just caps runaway auto-sizing

	commentWrapCharsPerLine = 28 // approx chars per line at commentMaxWidth in the default VML comment font
	commentLineHeightPx     = 16 // approx px per wrapped line at the default font size
)

// commentBoxSize computes a VML comment box Width/Height (pixels) from the
// comment's combined "Nota: .../Justificación: ..." text, so short notes
// stay compact and long notes get a taller box without manual resizing in
// Excel (R1-R5). Width and Height are each clamped to
// [commentMin*, commentMax*] regardless of text length.
func commentBoxSize(text string) (width, height uint) {
	lines := strings.Split(text, "\n")
	maxLineLen := 0
	wrappedLines := 0
	for _, line := range lines {
		n := utf8.RuneCountInString(line)
		if n > maxLineLen {
			maxLineLen = n
		}
		w := n / commentWrapCharsPerLine
		if n%commentWrapCharsPerLine != 0 || n == 0 {
			w++
		}
		wrappedLines += w
	}
	width = commentMinWidth
	if maxLineLen > commentWrapCharsPerLine {
		width = commentMaxWidth
	}
	height = commentMinHeight
	if wrappedLines > 1 {
		height += uint(wrappedLines-1) * commentLineHeightPx
	}
	if height > commentMaxHeight {
		height = commentMaxHeight
	}
	return width, height
}

// diagonalNoteBorder marks an F/AT/J cell that has an attached note: a thin
// double diagonal line rising from the bottom-left to the top-right corner
// (excelize's diagonalUp), appended to the cell's existing border list.
// Excel's own comment-triangle indicator is a fixed red triangle, not
// configurable via OOXML/excelize, and disappears against styleF's red fill
// — this is the visible "this cell has a note" signal instead (R7). A
// marker character in the cell's text value was explicitly rejected:
// COUNTIF-based totals elsewhere in the template depend on the cell holding
// exactly "F"/"AT"/"J" (R9).
var diagonalNoteBorder = excelize.Border{Type: "diagonalUp", Style: 6, Color: "000000"}

// appendDiagonalBorder returns a new slice with diagonalNoteBorder appended
// to base, without mutating base's backing array. base (templateBorder) is
// reused across every style NewStyle call in processCourse; appending to it
// in place via append(base, ...) would risk a shared-backing-array aliasing
// bug the moment base has spare capacity.
func appendDiagonalBorder(base []excelize.Border) []excelize.Border {
	out := make([]excelize.Border, len(base)+1)
	copy(out, base)
	out[len(base)] = diagonalNoteBorder
	return out
}

// ── processCourse ─────────────────────────────────────────────────────────────

const trimesterSheetCount = 3

// trimesterOrdinalNames bridges the backend's Quarter.name vocabulary
// ("Primer Trimestre", "Segundo Trimestre", "Tercer Trimestre") to the
// template's sheet-position vocabulary — the two never share a common
// substring, so an explicit ordinal-word mapping is required.
var trimesterOrdinalNames = map[string]int{
	"PRIMER": 0, "PRIMERO": 0,
	"SEGUNDO": 1,
	"TERCER":  2, "TERCERO": 2,
}

// resolveTrimesterSheetIndex resolves quarter_sequence/quarter_name (raw query
// string values, "" when absent) into a 0-based position in the template's
// GetSheetList() document order. quarter_sequence always wins when both are
// supplied (R2).
func resolveTrimesterSheetIndex(quarterSequenceRaw, quarterNameRaw string) (int, error) {
	if quarterSequenceRaw != "" {
		n, err := strconv.Atoi(strings.TrimSpace(quarterSequenceRaw))
		if err != nil {
			return 0, fmt.Errorf("invalid quarter_sequence: %s", quarterSequenceRaw)
		}
		if n < 1 || n > trimesterSheetCount {
			return 0, fmt.Errorf("quarter_sequence must be between 1 and %d", trimesterSheetCount)
		}
		return n - 1, nil
	}
	if quarterNameRaw != "" {
		first := strings.ToUpper(strings.TrimSpace(quarterNameRaw))
		if idx := strings.IndexAny(first, " \t"); idx >= 0 {
			first = first[:idx]
		}
		if pos, ok := trimesterOrdinalNames[first]; ok {
			return pos, nil
		}
		return 0, fmt.Errorf("unrecognized quarter_name: %s", quarterNameRaw)
	}
	return 0, nil
}

// selectAndKeepSheet deletes every sheet in f except the one at sheetIndex
// (0-based position in f.GetSheetList()) and returns the kept sheet name.
// Returns an error if sheetIndex is out of range (R8); the caller must clean
// up the file and any temp copy in that case.
func selectAndKeepSheet(f *excelize.File, sheetIndex int) (string, error) {
	sheetList := f.GetSheetList()
	if sheetIndex >= len(sheetList) {
		return "", fmt.Errorf("template has %d sheet(s), expected at least %d", len(sheetList), sheetIndex+1)
	}
	base := sheetList[sheetIndex]
	for _, name := range sheetList {
		if name == base {
			continue
		}
		f.DeleteSheet(name)
	}
	return base, nil
}

// processCourse writes one course into a fresh copy of the template and returns
// the path to the resulting temp file. The caller is responsible for removing it.
func processCourse(plantillaPath, outputDir, ts string, cd courseData, sheetName string, sheetIndex int, diasDelRango []time.Time, signers []Signer) (string, error) {
	tempPath := filepath.Join(outputDir, fmt.Sprintf("temp_%d_%s.xlsx", cd.id, ts))
	if err := copyFile(plantillaPath, tempPath); err != nil {
		return "", err
	}

	f, err := excelize.OpenFile(tempPath)
	if err != nil {
		os.Remove(tempPath)
		return "", err
	}

	base, err := selectAndKeepSheet(f, sheetIndex)
	if err != nil {
		f.Close()
		os.Remove(tempPath)
		return "", err
	}

	// Force formula recalculation so COUNTIF totals are correct
	fullCalc := true
	if err := f.SetCalcProps(&excelize.CalcPropsOptions{FullCalcOnLoad: &fullCalc}); err != nil {
		f.Close()
		os.Remove(tempPath)
		return "", err
	}

	colMap, err := getColumnMap(f, base)
	if err != nil {
		f.Close()
		os.Remove(tempPath)
		return "", err
	}

	// Sample borders from the first attendance cell to preserve template formatting
	var templateBorder []excelize.Border
outerBorder:
	for _, monthCols := range colMap {
		for _, col := range monthCols {
			ref, _ := excelize.CoordinatesToCellName(col, filaInicialNomina)
			styleIdx, _ := f.GetCellStyle(base, ref)
			if s, err2 := f.GetStyle(styleIdx); err2 == nil {
				templateBorder = s.Border
			}
			break outerBorder
		}
	}

	styleF, _ := f.NewStyle(&excelize.Style{Border: templateBorder, Fill: excelize.Fill{Type: "pattern", Pattern: 1, Color: []string{"FFC7CE"}}, Alignment: &excelize.Alignment{Horizontal: "center"}})
	styleAT, _ := f.NewStyle(&excelize.Style{Border: templateBorder, Fill: excelize.Fill{Type: "pattern", Pattern: 1, Color: []string{"FFEB9C"}}, Alignment: &excelize.Alignment{Horizontal: "center"}})
	styleJ, _ := f.NewStyle(&excelize.Style{Border: templateBorder, Fill: excelize.Fill{Type: "pattern", Pattern: 1, Color: []string{"C6EFCE"}}, Alignment: &excelize.Alignment{Horizontal: "center"}})
	styleP, _ := f.NewStyle(&excelize.Style{Border: templateBorder, Fill: excelize.Fill{Type: "pattern", Pattern: 1, Color: []string{"DDEBF7"}}, Alignment: &excelize.Alignment{Horizontal: "center"}})

	noteBorder := appendDiagonalBorder(templateBorder)
	styleFNote, _ := f.NewStyle(&excelize.Style{Border: noteBorder, Fill: excelize.Fill{Type: "pattern", Pattern: 1, Color: []string{"FFC7CE"}}, Alignment: &excelize.Alignment{Horizontal: "center"}})
	styleATNote, _ := f.NewStyle(&excelize.Style{Border: noteBorder, Fill: excelize.Fill{Type: "pattern", Pattern: 1, Color: []string{"FFEB9C"}}, Alignment: &excelize.Alignment{Horizontal: "center"}})
	styleJNote, _ := f.NewStyle(&excelize.Style{Border: noteBorder, Fill: excelize.Fill{Type: "pattern", Pattern: 1, Color: []string{"C6EFCE"}}, Alignment: &excelize.Alignment{Horizontal: "center"}})

	if err := escribirNomina(f, base, cd.roster); err != nil {
		f.Close()
		os.Remove(tempPath)
		return "", err
	}
	escribirGradoYJornada(f, base, cd)

	if len(signers) > 0 {
		escribirFirmas(f, base, signers)
	}

	rowMap, err := getStudentRowMap(f, base)
	if err != nil {
		f.Close()
		os.Remove(tempPath)
		return "", err
	}
	rowMapKeys := make(map[string]bool, len(rowMap))
	for k := range rowMap {
		rowMapKeys[k] = true
	}

	marcadas := map[[2]int]bool{}

	for _, reg := range cd.registros {
		mesNombre := monthNames[int(reg.date.Month())-1]
		cols, ok := colMap[mesNombre]
		if !ok {
			continue
		}
		col, ok := cols[reg.date.Day()]
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
		f.SetCellValue(base, cellRef, displayType) // unconditional, same as today — R9

		var parts []string
		if reg.notes != "" {
			parts = append(parts, "Nota: "+reg.notes)
		}
		if reg.justificationReason != nil && *reg.justificationReason != "" {
			parts = append(parts, "Justificación: "+*reg.justificationReason)
		}
		hasNote := len(parts) > 0

		switch displayType {
		case "F":
			if hasNote {
				f.SetCellStyle(base, cellRef, cellRef, styleFNote)
			} else {
				f.SetCellStyle(base, cellRef, cellRef, styleF)
			}
		case "AT":
			if hasNote {
				f.SetCellStyle(base, cellRef, cellRef, styleATNote)
			} else {
				f.SetCellStyle(base, cellRef, cellRef, styleAT)
			}
		case "J":
			if hasNote {
				f.SetCellStyle(base, cellRef, cellRef, styleJNote)
			} else {
				f.SetCellStyle(base, cellRef, cellRef, styleJ)
			}
		}
		marcadas[[2]int{row, col}] = true

		if hasNote {
			text := strings.Join(parts, "\n")
			width, height := commentBoxSize(text)
			f.AddComment(base, excelize.Comment{
				Cell:      cellRef,
				Author:    "Sistema",
				Width:     width,
				Height:    height,
				Paragraph: []excelize.RichTextRun{{Text: text}},
			})
		}
	}

	for _, est := range cd.roster {
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
			f.SetCellValue(base, cellRef, "A")
			f.SetCellStyle(base, cellRef, cellRef, styleP)
			marcadas[[2]int{row, col}] = true
		}
	}

	if err := f.SetSheetName(base, sheetName); err != nil {
		f.Close()
		os.Remove(tempPath)
		return "", err
	}
	if err := f.SaveAs(tempPath); err != nil {
		f.Close()
		os.Remove(tempPath)
		return "", err
	}
	f.Close()
	if err := dedupeCommentShapeIDs(tempPath); err != nil {
		os.Remove(tempPath)
		return "", err
	}
	return tempPath, nil
}

// ── signers ───────────────────────────────────────────────────────────────────

type Signer struct {
	Name  string `json:"name"`
	Title string `json:"title"`
	Label string `json:"label"`
}

// signerDisplayName returns "TITLE NAME" or just "NAME" when title is empty,
// always uppercased.
func signerDisplayName(s Signer) string {
	name := strings.ToUpper(strings.TrimSpace(s.Name))
	title := strings.ToUpper(strings.TrimSpace(s.Title))
	if title != "" {
		return title + " " + name
	}
	return name
}

const (
	colDocenteTutor     = 4  // D
	colInspectorPiso    = 26 // Z
	colInspectorGeneral = 45 // AS
	colRector           = 64 // BL
)

// labelToSignatureCol maps a signature_label to the column index (1-based) for
// row 44/45 of the template. Returns 0 when the label does not match any slot.
func labelToSignatureCol(label string) int {
	upper := strings.ToUpper(strings.TrimSpace(label))
	switch {
	case strings.Contains(upper, "DOCENTE TUTOR") || strings.Contains(upper, "DOCENTE TUTORA"):
		return colDocenteTutor
	case strings.Contains(upper, "INSPECTOR PISO") || (strings.Contains(upper, "INSPECTOR") && strings.Contains(upper, "PISO")):
		return colInspectorPiso
	case upper == "INSPECTOR GENERAL":
		return colInspectorGeneral
	case strings.Contains(upper, "RECTOR"):
		return colRector
	}
	return 0
}

// escribirFirmas writes signer name (row 44) and label (row 45) to the template,
// and also sets cell A7 to the tutor/inspector signer's display name.
func escribirFirmas(f *excelize.File, sheet string, signers []Signer) {
	for _, s := range signers {
		col := labelToSignatureCol(s.Label)
		if col == 0 {
			continue
		}
		nameRef, _ := excelize.CoordinatesToCellName(col, 44)
		labelRef, _ := excelize.CoordinatesToCellName(col, 45)
		f.SetCellValue(sheet, nameRef, signerDisplayName(s))
		f.SetCellValue(sheet, labelRef, s.Label)

		// A7 (under "INSPECTORA/DOCENTE TUTOR") reflects the docente tutor or
		// either inspector variant — not the rector. Reuses the same `col`
		// classification as the signature block so both stay in sync.
		if col == colDocenteTutor || col == colInspectorPiso || col == colInspectorGeneral {
			f.SetCellValue(sheet, "A7", signerDisplayName(s))
		}
	}
}

// ── handler ───────────────────────────────────────────────────────────────────

func exportExcelHandler(pool *pgxpool.Pool, plantillaPath, outputDir string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		institutionID, errI := strconv.Atoi(q.Get("institution_id"))
		academicYearID, errY := strconv.Atoi(q.Get("academic_year_id"))
		dateFromStr := q.Get("date_from")
		dateToStr := q.Get("date_to")
		courseIDs, errC := parseCourseIDs(map[string][]string(q))
		if errI != nil || errY != nil || errC != nil {
			http.Error(w, "institution_id, course_ids and academic_year_id must be integers", http.StatusBadRequest)
			return
		}

		sheetIndex, errQ := resolveTrimesterSheetIndex(q.Get("quarter_sequence"), q.Get("quarter_name"))
		if errQ != nil {
			http.Error(w, errQ.Error(), http.StatusBadRequest)
			return
		}

		var signers []Signer
		if raw := q.Get("signers"); raw != "" {
			_ = json.Unmarshal([]byte(raw), &signers)
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

		// Fetch all course data upfront
		courses := make([]courseData, 0, len(courseIDs))
		for _, courseID := range courseIDs {
			var cd courseData
			cd.id = courseID
			if err := pool.QueryRow(ctx,
				"SELECT name, shift, COALESCE(full_name, ''), COALESCE(paralelo, '') FROM courses WHERE id = $1 AND institution_id = $2",
				courseID, institutionID,
			).Scan(&cd.name, &cd.shift, &cd.fullName, &cd.paralelo); err != nil {
				http.Error(w, fmt.Sprintf("Course %d not found", courseID), http.StatusNotFound)
				return
			}

			rows, err := pool.Query(ctx, `
				SELECT
				  e.name AS student_name,
				  m.roster_number,
				  a.date,
				  a.type,
				  COALESCE(a.notes, '') AS notes,
				  EXISTS (
				    SELECT 1 FROM justification_absences ja WHERE ja.absence_id = a.id
				  ) AS is_justified,
				  (SELECT j.reason FROM justification_absences ja
				   JOIN justifications j ON j.id = ja.justification_id
				   WHERE ja.absence_id = a.id LIMIT 1) AS justification_reason
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
			for rows.Next() {
				var rec absenceRecord
				if err := rows.Scan(&rec.studentName, &rec.rosterNumber, &rec.date, &rec.typ, &rec.notes, &rec.justified, &rec.justificationReason); err != nil {
					rows.Close()
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}
				cd.registros = append(cd.registros, rec)
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
			for rosterRows.Next() {
				var est rosterStudent
				if err := rosterRows.Scan(&est.studentName, &est.rosterNumber); err != nil {
					rosterRows.Close()
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}
				cd.roster = append(cd.roster, est)
			}
			rosterRows.Close()

			courses = append(courses, cd)
		}

		ts := time.Now().Format("20060102_150405")
		diasDelRango := diasHabiles(fDesde, fHasta)

		// Compute unique sheet names (Excel forbids duplicates)
		sheetNames := make([]string, len(courses))
		usedNames := map[string]bool{}
		for i, cd := range courses {
			name := truncateSheetName(cd.name)
			for j := 2; usedNames[name]; j++ {
				name = truncateSheetName(fmt.Sprintf("%s (%d)", cd.name, j))
			}
			usedNames[name] = true
			sheetNames[i] = name
		}

		// Process each course in its own fresh template copy
		tempPaths := make([]string, 0, len(courses))
		for i, cd := range courses {
			p, err := processCourse(plantillaPath, outputDir, ts, cd, sheetNames[i], sheetIndex, diasDelRango, signers)
			if err != nil {
				for _, old := range tempPaths {
					os.Remove(old)
				}
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			tempPaths = append(tempPaths, p)
		}
		defer func() {
			for _, p := range tempPaths {
				os.Remove(p)
			}
		}()

		// Merge all temp files into the first one
		outputPath := tempPaths[0]
		if len(tempPaths) > 1 {
			if err := mergeWorkbooks(outputPath, tempPaths[1:], sheetNames[1:]); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		}

		// Remove external links so FullCalcOnLoad does not trigger the refresh dialog
		if err := stripExternalLinks(outputPath); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		var filename string
		if len(courses) == 1 {
			filename = fmt.Sprintf("absences_%s_%s_%s.xlsx", sanitizeFilename(courses[0].name), dateFromStr, dateToStr)
		} else {
			filename = fmt.Sprintf("asistencias_%s_%s.xlsx", dateFromStr, dateToStr)
		}

		w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
		http.ServeFile(w, r, outputPath)
	}
}
