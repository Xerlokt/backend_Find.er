---
phase: 13
slug: cleanup-unit-test-layer
status: verified
threats_open: 0
asvs_level: 1
created: 2026-05-15
---

# Phase 13 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| File system | Plan reads/writes source files; no external data crosses trust boundary | Source code only — no user data, credentials, or secrets |
| Import graph | check-deps.ts reads the full src/ TypeScript import graph via madge | Structural metadata only — no runtime data |
| Deletion boundary | rm -rf operations are irreversible; wrong target = data loss | None — file paths only |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-13-01-01 | Tampering | requireRole hook moved to new path | mitigate | All 8 route files import from `'../plugins/require-role.hook'` — verified by grep; authenticate hook enforced at infrastructure layer | closed |
| T-13-01-02 | Information Disclosure | AppError moved; errorHandler must catch both AppError and DomainError | mitigate | error-handler.ts lines 13-20: `instanceof DomainError` branch (line 13) and `instanceof AppError` branch (line 19) both present and handled verbatim | closed |
| T-13-01-03 | Elevation of Privilege | requireRole using DomainError — verify 403 still thrown on role mismatch | mitigate | require-role.hook.ts line 21: `throw new DomainError('Forbidden', 'FORBIDDEN', 403)` — HTTP 403 identical to original; integration tests pass with role-protected routes | closed |
| T-13-01-04 | Denial of Service | tsc or test failure from a missed import blocks the wave | accept | Accepted — verification step runs build + full test suite before plan marked done; `npm run build` exits 0 | closed |
| T-13-02-01 | Tampering | Deleting wrong directory (e.g. src/modules vs modules/) | mitigate | src/modules/ and src/shared/ confirmed absent; Plan 01 green build confirmed imports were fixed before deletion | closed |
| T-13-02-02 | Denial of Service | Missed import causes tsc failure post-deletion | mitigate | `npm run build` exits 0 with zero TypeScript errors after deletion; 158 integration tests pass | closed |
| T-13-02-03 | Tampering | Deleting chat.service.test.ts which may have been updated to use new interfaces | mitigate | 13-02-SUMMARY confirms 8 old service unit tests deleted; 38 new-architecture unit tests pass cleanly (new tests cover adapters layer, not modules) | closed |
| T-13-02-04 | Repudiation | No record that old module files were intentionally deleted | accept | Accepted — git history records the deletion with commit message; 13-02-SUMMARY.md documents outcome | closed |
| T-13-03-01 | Elevation of Privilege | check-deps.ts may have false negatives if madge does not resolve path aliases | mitigate | `npm run check:deps` exits 0 ("Dependency rule: OK"); `npx madge --circular src/` confirms no circular deps (531 files processed) | closed |
| T-13-03-02 | Information Disclosure | Unit test mocks use `as any` casts — type safety partially bypassed | accept | Accepted — mocks are in test code only; production types enforced by TypeScript; `as jest.Mocked<IInterface>` preserves method-level type checking | closed |
| T-13-03-03 | Tampering | UnlockCandidateUseCase error code for insufficient credits may not be 'INSUFFICIENT_CREDITS' — test would pass with wrong assertion | mitigate | Test at tests/unit/unlock-candidate.use-case.test.ts line 46 asserts `'INSUFFICIENT_CREDITS'` matching actual DomainError code from use case | closed |
| T-13-03-04 | Denial of Service | check-deps script process.exit(1) in npm scripts would fail CI if violations remain | accept | Accepted — intended behavior; ARCH-13 enforcement requires violations to block CI pipeline | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-13-01 | T-13-01-04 | tsc/test failure from missed import is self-revealing; build verification step catches it before phase completion | GSD automated audit | 2026-05-15 |
| AR-13-02 | T-13-02-04 | Git history provides an immutable audit trail of all deletions; SUMMARY.md explicitly documents what was deleted and why | GSD automated audit | 2026-05-15 |
| AR-13-03 | T-13-03-02 | `as jest.Mocked<IInterface>` preserves method signatures; type bypass is scoped to test files only, never reaches production code | GSD automated audit | 2026-05-15 |
| AR-13-04 | T-13-03-04 | CI pipeline blocking on architecture violations is the desired enforcement mechanism for ARCH-13 | GSD automated audit | 2026-05-15 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-05-15 | 12 | 12 | 0 | Claude (gsd-security-auditor) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-05-15
