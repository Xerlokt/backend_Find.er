# Retrospective — Job Tinder Backend

---

## Milestone: v2.0 — Clean Architecture Refactor

**Shipped:** 2026-05-15
**Phases:** 5 (9–13) | **Plans:** 18

### What Was Built

- Domain scaffold: 11 pure entity interfaces, 10 repository interfaces, 3 application ports — the seams enabling use-case unit testing without a database
- Infrastructure + auth migrated: DB singletons at canonical layer, BcryptAdapter, JwtAdapter, 5 auth use cases via interface injection
- Core modules migrated: Candidate, Recruiter, Company, Job, Admin use cases + adapter repositories + controllers
- Swipe/Credits/Recommendation/Chat migrated: Neo4jAdapter wired, IChatPort created; 41 integration tests green throughout
- `src/modules/` and `src/shared/` deleted; `scripts/check-deps.ts` (madge) enforces 4-layer dependency rule
- 6 use-case unit tests (auth, candidate, job, swipe, credits, chat) — no DB, no HTTP server required

### What Worked

- **Module-by-module migration**: Migrating one module per plan kept the diff small and kept 41 integration tests green at every boundary. Never had a "big bang" failure.
- **Additive pattern**: Not deleting old modules until Phase 13 meant safe coexistence — tsc verified correctness with both old and new code in tree simultaneously.
- **Interface-first approach**: Defining all repository interfaces in Phase 9 before any implementations meant Phase 10–12 had a locked contract to implement against. No interface churn during migration.
- **Phase 13 import surgery first**: Fixing all cross-boundary imports in 13-01 before deleting in 13-02 meant the deletion was a clean operation with no surprises.

### What Was Inefficient

- **ROADMAP tracking**: Phase 10 progress table was never updated during execution — showed "0/4 Not started" throughout the milestone even though Phase 10 completed. Required a fix at milestone close.
- **REQUIREMENTS.md checkboxes**: v2.0 requirements stayed `[ ]` throughout — never checked off as phases completed. Stale tracking discovered at close.
- **Deferred UAT/verification**: 6 items (2 UAT gaps + 4 verification human_needed) carried over from v1.0 phases and were acknowledged as deferred at v2.0 close. These were v1.0 artifacts, not v2.0 work, but they added noise to the close process.

### Patterns Established

- `src/adapters/services/recommendation.repository.ts` — wrapping a repository inside an adapter service (Neo4jAdapter pattern) for clean port implementation
- Local port definitions (ICreditGrantPort, IChatPort) in use case files when importing from another module would violate ARCH-04
- `scripts/check-deps.ts` as a standard tool for enforcing architectural boundaries mechanically
- `satisfies FitScoreInput` at call sites to catch interface drift at compile time without losing type inference

### Key Lessons

1. **Lock interfaces before implementing**: Phase 9's full interface scaffold meant Phase 10–12 had stable contracts. Chasing interface changes during implementation is expensive.
2. **Don't defer ROADMAP/REQUIREMENTS updates**: Stale tracking creates cleanup work at close and can mask real gaps. Update checkboxes as plans complete.
3. **Additive migrations are worth the temporary duplication**: Coexisting old and new code for 4 phases felt wasteful but made each phase safe and independently verifiable.
4. **Mechanical enforcement > convention**: `check-deps.ts` catches a violated dependency rule in seconds; code review misses it sometimes. Any architectural rule worth having deserves a check script.

### Cost Observations

- Sessions: ~10 days of development (2026-05-05 → 2026-05-15)
- 18 plans across 5 phases — averaged ~3.6 plans/phase
- No major regressions or rollbacks needed during migration

---

## Milestone: v1.0 — MVP

**Shipped:** 2026-05-03
**Phases:** 8 (1–8) | **Plans:** 27

### What Was Built

Complete Job Tinder backend from scratch: authentication (JWT + Google OAuth2), candidate/recruiter/company profiles, job lifecycle, swipe mechanics (LIKE/DISLIKE with duplicate prevention), Neo4j fit-score recommendation (5-factor algorithm), credit/unlock economy, real-time WebSocket chat with auto-creation on match/unlock.

### Key Lessons

1. **Neo4j disableLosslessIntegers=true**: Required from the start — JS numbers vs neo4j.Integer objects caused subtle bugs until explicitly configured.
2. **Fastify static-before-parameterized**: `/mine` route must be registered before `/:id` — Fastify matches in registration order. Learned once, applied throughout.
3. **Prisma migrate in non-TTY environments**: `prisma db push` + `migrate resolve --applied` was the workaround for interactive migrate dev in CI; document this pattern upfront.
4. **TDD on complex flows first**: Recruiter-first rule in chat and DISLIKE censoring in ranking were caught early by writing tests before implementation.

---

## Cross-Milestone Trends

| Metric | v1.0 | v2.0 |
|--------|------|------|
| Phases | 8 | 5 |
| Plans | 27 | 18 |
| Days | ~24 | 10 |
| Tests at close | 41 integration | 172 total (41 integration + 131 other) |
| Regressions | 0 | 0 |
| Rollbacks | 0 | 0 |

**Consistent strengths:** TDD discipline, atomic commits per task, zero regressions across both milestones.

**Recurring weakness:** Planning artifact tracking (ROADMAP checkboxes, REQUIREMENTS checkboxes) not updated in real-time during execution — discovered stale at milestone close both times.
