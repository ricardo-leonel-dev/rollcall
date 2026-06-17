package main

import "strings"

func normalizeName(name string) string {
	return strings.ToUpper(strings.Join(strings.Fields(name), " "))
}

func wordSet(name string) map[string]bool {
	set := make(map[string]bool)
	for _, w := range strings.Fields(name) {
		set[w] = true
	}
	return set
}

// matchName busca ocrName dentro de candidateKeys (ya normalizadas).
// Calca la heurística del servicio Python: match exacto primero, si no,
// el candidato con más palabras en común (mínimo 2).
func matchName(ocrName string, candidateKeys map[string]bool) (string, bool) {
	ocrNorm := normalizeName(ocrName)
	if candidateKeys[ocrNorm] {
		return ocrNorm, true
	}

	ocrWords := wordSet(ocrNorm)
	best, bestScore := "", 0
	for key := range candidateKeys {
		common := 0
		for w := range wordSet(key) {
			if ocrWords[w] {
				common++
			}
		}
		if common >= 2 && common > bestScore {
			best, bestScore = key, common
		}
	}
	if best == "" {
		return "", false
	}
	return best, true
}
