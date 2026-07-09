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

// ── processCourse ─────────────────────────────────────────────────────────────

// processCourse writes one course into a fresh copy of the template and returns
// the path to the resulting temp file. The caller is responsible for removing it.
func processCourse(plantillaPath, outputDir, ts string, cd courseData, sheetName string, diasDelRango []time.Time, signers []Signer) (string, error) {
	tempPath := filepath.Join(outputDir, fmt.Sprintf("temp_%d_%s.xlsx", cd.id, ts))
	if err := copyFile(plantillaPath, tempPath); err != nil {
		return "", err
	}

	f, err := excelize.OpenFile(tempPath)
	if err != nil {
		os.Remove(tempPath)
		return "", err
	}

	// Delete every sheet except the first (removes 2DO TRIMESTRE, 3ER TRIMESTRE, etc.)
	for _, extra := range f.GetSheetList()[1:] {
		f.DeleteSheet(extra)
	}

	// Force formula recalculation so COUNTIF totals are correct
	fullCalc := true
	if err := f.SetCalcProps(&excelize.CalcPropsOptions{FullCalcOnLoad: &fullCalc}); err != nil {
		f.Close()
		os.Remove(tempPath)
		return "", err
	}

	base := f.GetSheetList()[0]

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

	if err := escribirNomina(f, base, cd.roster); err != nil {
		f.Close()
		os.Remove(tempPath)
		return "", err
	}

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
		f.SetCellValue(base, cellRef, displayType)
		switch displayType {
		case "F":
			f.SetCellStyle(base, cellRef, cellRef, styleF)
		case "AT":
			f.SetCellStyle(base, cellRef, cellRef, styleAT)
		case "J":
			f.SetCellStyle(base, cellRef, cellRef, styleJ)
		}
		marcadas[[2]int{row, col}] = true

		var parts []string
		if reg.notes != "" {
			parts = append(parts, "Nota: "+reg.notes)
		}
		if reg.justificationReason != nil && *reg.justificationReason != "" {
			parts = append(parts, "Justificación: "+*reg.justificationReason)
		}
		if len(parts) > 0 {
			f.AddComment(base, excelize.Comment{
				Cell:      cellRef,
				Author:    "Sistema",
				Paragraph: []excelize.RichTextRun{{Text: strings.Join(parts, "\n")}},
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
	return tempPath, nil
}

// ── signers ───────────────────────────────────────────────────────────────────

type Signer struct {
	Name  string `json:"name"`
	Title string `json:"title"`
	Label string `json:"label"`
}

// signerDisplayName returns "TITLE NAME" or just "NAME" when title is empty.
func signerDisplayName(s Signer) string {
	if s.Title != "" {
		return s.Title + " " + s.Name
	}
	return s.Name
}

// labelToSignatureCol maps a signature_label to the column index (1-based) for
// row 44/45 of the template. Returns 0 when the label does not match any slot.
func labelToSignatureCol(label string) int {
	upper := strings.ToUpper(strings.TrimSpace(label))
	switch {
	case strings.Contains(upper, "DOCENTE TUTOR") || strings.Contains(upper, "DOCENTE TUTORA"):
		return 4 // col D
	case strings.Contains(upper, "INSPECTOR PISO") || (strings.Contains(upper, "INSPECTOR") && strings.Contains(upper, "PISO")):
		return 26 // col Z
	case upper == "INSPECTOR GENERAL":
		return 45 // col AS
	case strings.Contains(upper, "RECTOR"):
		return 64 // col BL
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

		// Row 7 gets the docente tutor or inspector piso signer name
		upper := strings.ToUpper(strings.TrimSpace(s.Label))
		if strings.Contains(upper, "DOCENTE TUTOR") || strings.Contains(upper, "INSPECTOR PISO") {
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
				"SELECT name FROM courses WHERE id = $1 AND institution_id = $2",
				courseID, institutionID,
			).Scan(&cd.name); err != nil {
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
			p, err := processCourse(plantillaPath, outputDir, ts, cd, sheetNames[i], diasDelRango, signers)
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
