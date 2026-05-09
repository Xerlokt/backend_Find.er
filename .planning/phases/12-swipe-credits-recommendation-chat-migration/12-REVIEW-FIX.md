---
phase: 12-swipe-credits-recommendation-chat-migration
fixed_at: 2026-05-09T00:00:00Z
review_path: .planning/phases/12-swipe-credits-recommendation-chat-migration/12-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 12: Code Review Fix Report

**Fixed at:** 2026-05-09T00:00:00Z
**Source review:** `.planning/phases/12-swipe-credits-recommendation-chat-migration/12-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 6 (CR-01, CR-02, WR-01, WR-02, WR-03, WR-04)
- Fixed: 6
- Skipped: 0

## Fixed Issues

### CR-01: Dead error-remapping in CreditService never catches DomainError from executeUnlock

**Files modified:** `src/modules/credits/credits.service.ts`
**Commit:** bb78755
**Applied fix:** Removed the dead catch conditions that checked for wrong string literals (`'INSUFFICIENT_CREDITS'`, `'COMPANY_NOT_FOUND'`, and `Prisma.PrismaClientKnownRequestError`) and replaced the entire catch block with a proper `instanceof DomainError` check that re-throws as `AppError`. Also removed the now-unused `Prisma` import and added `import { DomainError }` from the application errors module.

---

### CR-02: GetMessagesUseCase passes limit+1 to findMessages — off-by-one

**Files modified:** `src/application/use-cases/chat/get-messages.use-case.ts`
**Commit:** 3461fe1
**Applied fix:** Changed `this.repo.findMessages(chatId, cursor, limit + 1)` to `this.repo.findMessages(chatId, cursor, limit)`. `ChatRepository.findMessages` already adds `+1` internally (`take: limit + 1`) for cursor pagination detection, so the use case was causing the DB to fetch `limit + 2` rows and incorrectly reporting `hasNext = true` when exactly `limit + 1` real messages existed.

---

### WR-01: src/modules/credits/credits.routes.ts is dead code — not registered in app.ts

**Files modified:** `src/modules/credits/credits.routes.ts` (deleted)
**Commit:** 4d018fa
**Applied fix:** Deleted the file entirely. Confirmed via `app.ts` that all traffic routes through `src/infrastructure/http/routes/credits.routes.ts` → `CreditsController`. The module-level file was never imported and contained diverging logic that created a silent maintenance hazard.

---

### WR-02: Duplicate send-message logic in SendMessageUseCase and ChatService

**Files modified:** `src/application/use-cases/chat/send-message.use-case.ts` (deleted)
**Commit:** 4133592
**Applied fix:** Deleted `SendMessageUseCase` — confirmed it had no registered consumers in `src/` or `tests/` (only referenced in its own file). `chat.routes.ts` routes all send-message traffic through `ChatService.sendMessage`, which is the authoritative implementation. Removing the dead use case eliminates the silent drift risk for the recruiter-first business rule.

---

### WR-03: ChatController instantiates ChatRepository directly — violates Clean Architecture

**Files modified:** `src/adapters/controllers/chat.controller.ts`, `src/infrastructure/http/routes/chat.routes.ts`, `src/app.ts`
**Commit:** 93d3042
**Applied fix:** Refactored `ChatController` to accept `IChatRepository` via constructor injection instead of instantiating `ChatRepository` directly in each method. Updated `chatRoutes` opts type to include `repo: IChatRepository` and pass `opts.repo` to the controller constructor. Updated `app.ts` to pass the existing `chatRepo` instance to `chatRoutes`, reusing the composition-root repository already constructed there.

---

### WR-04: GetRankingUseCase passes null lat/lng to haversineKm without guarding return value

**Files modified:** `src/application/use-cases/swipe/get-ranking.use-case.ts`
**Commit:** def497b
**Applied fix:** Added explicit `number | null` type annotation to the `distanceKm` declaration. `haversineKm` already returns `number | null` (returns `null` when any coordinate is null), so TypeScript inferred the correct type — but the annotation makes the nullability explicit in the source, ensuring any future explicit return-type declaration on the ranking item will be flagged by the compiler if `distanceKm: number` is used incorrectly.

---

## Skipped Issues

None — all in-scope findings were fixed.

---

_Fixed: 2026-05-09T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
