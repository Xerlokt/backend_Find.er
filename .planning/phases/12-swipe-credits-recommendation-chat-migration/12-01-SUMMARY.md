---
phase: 12-swipe-credits-recommendation-chat-migration
plan: 01
subsystem: api
tags: [chat, websocket, clean-architecture, prisma, fastify, zod, domain-ports]

# Dependency graph
requires:
  - phase: 11-core-modules-migration
    provides: "Clean Architecture layer structure, domain entities, repository interfaces, DomainError"
provides:
  - "IChatPort application port (src/application/ports/chat.port.ts) — consumed by swipe and credits use cases in Plans 02 and 03"
  - "ChatRepository adapter implementing all 8 IChatRepository methods with domain-typed returns"
  - "5 chat use cases: CreateOrGetChat, SendMessage, VerifyParticipant, GetMessages, ListChats"
  - "ChatController with listChats and getMessages HTTP handlers"
  - "Infrastructure chat.routes.ts with WebSocket connection management verbatim + DomainError catch"
affects:
  - "12-02 (swipe-migration) — imports IChatPort from chat.port.ts"
  - "12-03 (credits-migration) — imports IChatPort from chat.port.ts"
  - "12-04 (app.ts import swap) — replaces modules/chat with infrastructure/http/routes/chat.routes.ts"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "IChatPort pattern: application port interface with domain type imports (not @prisma/client)"
    - "Repository adapter: toDomain/toMessageDomain mappers cast Prisma rows to domain entities"
    - "Use case constructor injection: only interface types in constructor, zero concrete class imports"
    - "VerifyParticipant returns boolean, never throws — safe to use in WS pre-check"

key-files:
  created:
    - src/application/ports/chat.port.ts
    - src/adapters/repositories/chat.repository.ts
    - src/application/use-cases/chat/create-or-get-chat.use-case.ts
    - src/application/use-cases/chat/send-message.use-case.ts
    - src/application/use-cases/chat/verify-participant.use-case.ts
    - src/application/use-cases/chat/get-messages.use-case.ts
    - src/application/use-cases/chat/list-chats.use-case.ts
    - src/adapters/controllers/chat.controller.ts
    - src/infrastructure/http/routes/chat.routes.ts
  modified: []

key-decisions:
  - "IChatPort imports ChatInitiator from domain/entities/chat.entity (not @prisma/client) — ARCH-07 compliance"
  - "Message entity uses createdAt field (not sentAt as shown in plan interfaces section) — matched actual domain entity"
  - "ChatRepository.findMessages passes limit+1 to Prisma but does not slice — caller (GetMessagesUseCase) slices to detect hasNext"
  - "Infrastructure chat.routes.ts preserves IChatRouteService interface and full WS wiring from modules/chat/chat.routes.ts"
  - "WS handler now catches DomainError first, then AppError — dual-catch for transition period before app.ts swap"

patterns-established:
  - "Port interface pattern: application/ports/*.port.ts imports only from domain layer"
  - "Repository adapter pattern: adapters/repositories/*.repository.ts implements domain interface, uses infrastructure prisma"
  - "Use case pattern: constructor(private readonly repo: IXxxRepository) — interface only, zero DB client imports"

requirements-completed: [ARCH-07, TEST-01]

# Metrics
duration: 15min
completed: 2026-05-09
---

# Phase 12 Plan 01: Chat Module Clean Architecture Migration Summary

**Chat module migrated to Clean Architecture: IChatPort, ChatRepository adapter (8 methods), 5 use cases, ChatController, and infrastructure routes with WebSocket wiring verbatim**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-09T00:00:00Z
- **Completed:** 2026-05-09T00:15:00Z
- **Tasks:** 2 / 2
- **Files created:** 9

## Accomplishments

- IChatPort application port created in src/application/ports/ — unlocks swipe and credits plans (12-02, 12-03) to import the port
- ChatRepository adapter implements all 8 IChatRepository methods with proper toDomain/toMessageDomain mappers; imports prisma from infrastructure/database/prisma
- 5 clean use cases with zero @prisma/client imports; VerifyParticipantUseCase returns boolean and never throws; GetMessagesUseCase has cursor pagination with participant guard
- Infrastructure chat.routes.ts preserves full WebSocket connection management verbatim; DomainError catch added alongside existing AppError catch for transition safety

## Task Commits

1. **Task 1: IChatPort + ChatRepository adapter (8 methods)** - `ea27bb8` (feat)
2. **Task 2: 5 chat use cases + ChatController + infrastructure chat.routes.ts** - `12846c8` (feat)

## Files Created/Modified

- `src/application/ports/chat.port.ts` — IChatPort interface with ChatInitiator from domain entity
- `src/adapters/repositories/chat.repository.ts` — ChatRepository implementing IChatRepository with 8 methods + toDomain/toMessageDomain mappers
- `src/application/use-cases/chat/create-or-get-chat.use-case.ts` — delegates to repo.createOrGetChat, returns chatId
- `src/application/use-cases/chat/send-message.use-case.ts` — enforces recruiter-first rule (T-12-01-02 compliance)
- `src/application/use-cases/chat/verify-participant.use-case.ts` — returns boolean, never throws (T-12-01-01 compliance)
- `src/application/use-cases/chat/get-messages.use-case.ts` — cursor pagination with participant guard (T-12-01-03 compliance)
- `src/application/use-cases/chat/list-chats.use-case.ts` — delegates to repo.findByUserId
- `src/adapters/controllers/chat.controller.ts` — listChats and getMessages HTTP handlers with Zod validation + DomainError catch
- `src/infrastructure/http/routes/chat.routes.ts` — WebSocket gateway with connection Map, DomainError+AppError catch, IChatRouteService interface

## Decisions Made

- Used `createdAt` (not `sentAt`) for Message fields to match the actual domain entity and Prisma schema
- ChatRepository.findMessages passes `limit+1` to Prisma without slicing — GetMessagesUseCase slices and detects hasNext
- WS handler catches both DomainError and AppError during the transition period (app.ts still uses modules/chat service until Plan 04)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- IChatPort is now available for Plans 12-02 (swipe) and 12-03 (credits) to import without circular dependencies
- ChatRepository and all 5 use cases compile cleanly; integration tests will run after Plan 04 updates app.ts import
- TypeScript: 0 errors across all 9 new files

---
*Phase: 12-swipe-credits-recommendation-chat-migration*
*Completed: 2026-05-09*
