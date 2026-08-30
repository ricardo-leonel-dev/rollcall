package main

import (
	"reflect"
	"strings"
	"testing"

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
