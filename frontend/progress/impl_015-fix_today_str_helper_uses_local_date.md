# Feature 15 — fix_today_str_helper_uses_local_date

## Approach
Option A — DELETE the helper (preferred per leader instructions and per the feature's own option list, since the helper had zero callers and was dead code).

## Change
- File: `src/app/features/absences/absences.component.ts`
- Deleted lines 759–761 (the trailing blank line and the one-line `private todayStr()` method that returned `new Date().toISOString().split('T')[0]`).

## Verification
- `grep -rn "todayStr" src/` before deletion: 1 match (the definition itself).
- `grep -rn "todayStr" src/` after deletion: NO MATCHES (zero callers, zero definition).
- `pnpm run build` (production): **exit 0** (only pre-existing budget/NG810x warnings in unrelated files).

## Acceptance
- [x] `todayStr()` no longer returns UTC date — the helper no longer exists.
- [x] Global search confirms no other file imports or uses `todayStr`.
- [x] Build green.
- [ ] N/A — the "identical to dateToDateString(new Date())" branch does not apply because we went with Option A (deletion).

## Ready
Ready for reviewer.
