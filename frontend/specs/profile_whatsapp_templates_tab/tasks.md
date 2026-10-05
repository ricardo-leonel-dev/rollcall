# Tasks — `/profile` tabs + catalog-driven WhatsApp message templates

Work top-to-bottom. Order keeps the repo buildable after each group: model
and util first, then the service (which breaks the old consumers' imports
only once they are migrated in the same group), then the profile page.
Precondition: backend feature 18 (`message_template_catalog`) deployed
locally with `postgres/24_message_template_actions.sql` applied — otherwise
`GET /api/notification-templates` returns the old shape or 500.

## Model & util

- [x] T1 (R1, R2) In `core/models/index.ts`, replace `NotificationTemplate`
      with `NotificationTemplatePlaceholder` and `NotificationTemplateItem`
      exactly as in `design.md` "Model".
- [x] T2 (R11, R31, R48) Create `shared/utils/template.util.ts` with
      `fillTemplate` (string pattern + replacer function), the emergency
      `FALLBACK_TEMPLATES` (single-line literals copied verbatim from
      `../backend` `postgres/24_message_template_actions.sql`, with the
      `EMERGENCY COPY` comment from `design.md`), `PLACEHOLDER_SAMPLES` and
      `previewTemplate` per `design.md`.

## Service

- [x] T3 (R3, R4, R5, R6, R7) Rewrite `NotificationTemplateService`: inject
      `AuthService`, `_items` signal + public `items`, `load()` memoized per
      `currentUser()?.id` (discard memo and items on user change), memo
      cleared on GET failure, `getTemplate` returning the item's `template`
      or `''`.
- [x] T4 (R8, R9, R10) Add `saveTemplate` (returns the item) and
      `restoreDefault` (`DELETE` with `encodeURIComponent`), both updating
      the cache via `replace()` only after the awaited call succeeds.
- [x] T5 (R11, R46, R47, R49) Add `renderTemplate(actionKey, vars)`: fill
      the cached item's `template`; when no item matches, `console.warn`
      once (no toast) and fill `FALLBACK_TEMPLATES[actionKey] ?? ''`. This is
      the only use of `FALLBACK_TEMPLATES` in the service; `getTemplate` stays
      cache-only.
- [x] T6 (R12) Delete `DEFAULT_TEMPLATES` from the service.
- [x] T24 (R50, R51) Add `hasTemplate(actionKey)` (cached item exists) and
      `ensureLoaded()` (awaits `load()`, swallows the error, never rejects).
      Listed after T6 to keep existing ids stable; do it before T7.

## WhatsApp consumers

- [x] T7 (R13, R15, R16, R52, R53, R54, R55, R56, R57)
      `absences.component.ts`: in `ngOnInit`'s `Promise.all` replace
      `templateService.load()` with `ensureLoaded()`; make `notifyGuardian`
      async per `design.md` "Consumers" — keep the `isJustified` bare-link
      early return; fast path (`hasTemplate`) opens
      `?text=`+`renderTemplate('absences', { nombre, fecha, tipo, curso })`
      synchronously; otherwise reserve a tab with `window.open('', '_blank')`,
      `await ensureLoaded()`, render (catalog or emergency fallback) and
      navigate the reserved tab (or `window.open` if it was `null`). Callers
      ignore the returned promise.
- [x] T8 (R14, R15, R16, R52, R53, R54, R55, R56, R57)
      `citations.component.ts`: same as T7 with
      `renderTemplate('citations', { nombre, fecha })`, `row.whatsappLink`, and
      the closed-citation bare-link early return kept.

## Profile page — structure

- [x] T9 (R12, R22) In `profile.component.ts`, remove
      `DEFAULT_NOTIFICATION_TEMPLATE`, `Me.notificationTemplate`,
      `MeSnapshot.notificationTemplate`, the `template`/`savingTemplate`
      signals, `preview()`, `insert()`, `saveTemplate()`, both direct
      `/api/notification-templates` calls and the old section markup; inject
      `NotificationTemplateService`, `ActivatedRoute`, `Router`.
- [x] T10 (R17, R18) Add `ChapterHeaderComponent` (eyebrow only, copy from
      `design.md`) above the existing `page-header` `h1 Mi perfil`; wrap the
      four account sections (markup unchanged, inside the existing 720px
      card) in the `Mi cuenta` tab of a `mat-tab-group` styled like the
      absences tab group; add the `Mensajes de WhatsApp` tab. Import
      `MatTabsModule`, `ChapterHeaderComponent`, `LoadingSpinnerComponent`,
      `WhatsappIconComponent`, `TextFieldModule`.
- [x] T11 (R19, R20) Add `selectedTab` (`toSignal` over `queryParamMap`,
      `mensajes` → 1, else 0) and `onTabChange` navigating with
      `queryParams: { tab: 'mensajes' | null }`, `queryParamsHandling:
      'merge'`, `replaceUrl: true`.
- [x] T12 (R21, R41) Extract `accountDirty()` from `hasDirty()`; add
      `templatesDirty` `computed`; `hasDirty()` = both; render the dirty dot
      (with `aria-label`/`title` `Cambios sin guardar` and the one allowed
      fade-in, reduced-motion safe) in each tab label.

## Profile page — Mensajes tab

- [x] T13 (R22, R23, R24, R25, R26) Add `templatesStatus` + `cards` signals
      and `loadTemplates()` (never rejects; sets `error` on failure), called
      inside `ngOnInit`'s `Promise.all` with `GET /api/auth/me`; render
      loading (`app-loading-spinner`, `Cargando mensajes…`), error (with
      `Reintentar` → `loadTemplates()`), empty, and `@for (card of cards();
      track card.item.actionKey)` states with the copy from `design.md`.
- [x] T14 (R27, R28, R29) Card markup per `design.md` "Visual direction":
      heading `label`, optional `description`, status pill, chip row (text
      `{{key}}`, `title`/`aria-label` = placeholder label), autosize
      textarea bound to `card.text` via `patchCard`.
- [x] T15 (R30) Caret tracking (`select`/`click`/`keyup`/`blur`) and
      `insertPlaceholder(card, key, textarea)` inserting at the recorded
      selection, then restoring focus and caret after the inserted token.
- [x] T16 (R31, R32) Preview block with the `--stripe` notebook margin rule,
      shown only for non-blank text, via `previewTemplate`; blank hint
      otherwise.
- [x] T17 (R33, R34, R35, R40) `canSave` and `saveCard` (per-card `busy`,
      success toast, error toast with backend message fallback, rethrow for
      the guard) plus a click handler that swallows the rejection.
- [x] T18 (R36, R37, R38, R39, R40) `canRestore` and `restoreCard`: local
      revert for non-custom cards; `ConfirmDialogComponent` (data from
      `design.md`) then `restoreDefault` for custom cards, with toasts.
- [x] T19 (R42, R43) In `canDeactivate()`'s `'save'` branch: blank dirty card
      → warning toast and `false` before any request; otherwise include
      `saveCard` for every dirty card in the existing `allSettled` task list.
- [x] T20 (R27, R29, R31) Apply the remaining `design.md` "Visual direction" details
      (tokens only, chip/pill colors, ≥1024px two-column card body,
      single column below, mobile stacked actions, focus-visible outlines) and
      check dark mode. Load `frontend-design` before touching
      `template:`/`styles:` (project convention).

## Verification

- [x] T21 (R2, R12, R16, R22, R23, R48, R49, R56) Run the grep checks in
      `design.md` "Verification": the six "must print nothing" checks print
      nothing; `FALLBACK_TEMPLATES` appears in exactly the 3 expected lines;
      the R48 `grep -c` checks each print `1`. Record the output.
- [x] T22 (R44) `pnpm run build` exits `0`.
- [x] T23 (R1, R3, R4, R5, R6, R7, R8, R9, R10, R11, R13, R14, R15, R17, R18, R19, R20, R21, R22, R23, R24, R25, R26, R27, R28, R29, R30, R31, R32, R33, R34, R35, R36, R37, R38, R39, R40, R41, R42, R43, R45, R46, R47, R50, R51, R52, R53, R54, R55, R56, R57)
      Run the 18-step manual smoke from `design.md` and record pass/fail,
      screenshots and the `R<n>` → step traceability table in
      `progress/impl_profile_whatsapp_templates_tab.md`.
