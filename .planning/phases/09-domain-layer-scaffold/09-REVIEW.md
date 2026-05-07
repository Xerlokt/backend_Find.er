---
phase: 09-domain-layer-scaffold
reviewed: 2026-05-06T00:00:00Z
depth: standard
files_reviewed: 25
files_reviewed_list:
  - src/domain/entities/user.entity.ts
  - src/domain/entities/refresh-token.entity.ts
  - src/domain/entities/job.entity.ts
  - src/domain/entities/candidate.entity.ts
  - src/domain/entities/company.entity.ts
  - src/domain/entities/recruiter.entity.ts
  - src/domain/entities/swipe.entity.ts
  - src/domain/entities/chat.entity.ts
  - src/domain/entities/message.entity.ts
  - src/domain/entities/credit-transaction.entity.ts
  - src/domain/entities/unlock.entity.ts
  - src/application/errors/domain.error.ts
  - src/application/ports/hash.port.ts
  - src/application/ports/token.port.ts
  - src/application/ports/graph.port.ts
  - src/domain/interfaces/user.repository.interface.ts
  - src/domain/interfaces/refresh-token.repository.interface.ts
  - src/domain/interfaces/candidate.repository.interface.ts
  - src/domain/interfaces/company.repository.interface.ts
  - src/domain/interfaces/recruiter.repository.interface.ts
  - src/domain/interfaces/job.repository.interface.ts
  - src/domain/interfaces/swipe.repository.interface.ts
  - src/domain/interfaces/credit.repository.interface.ts
  - src/domain/interfaces/chat.repository.interface.ts
  - src/domain/interfaces/recommendation.repository.interface.ts
findings:
  critical: 0
  warning: 6
  info: 5
  total: 11
status: issues_found
---

# Phase 09: Code Review Report

**Reviewed:** 2026-05-06
**Depth:** standard
**Files Reviewed:** 25
**Status:** issues_found

## Summary

Phase 09 establishes the domain entity types, application-layer port interfaces, and repository contracts for the entire backend. All files compile cleanly and the overall structure correctly reflects Clean Architecture principles — entities carry no behaviour, ports are dependency-inversion contracts, and repository interfaces are owned by the domain.

Six warnings were found, all of them architectural contract issues that will propagate bugs into Phase 10+ implementations if not addressed now. The most impactful are: cross-entity lookup methods placed in wrong repositories (SRP violations that force incorrect transactional boundaries), a synchronous `verifyAccess` signature that hides exception paths from callers, and a `Set<string>` return type on a repository method that leaks an application-layer concern into the domain interface. No security vulnerabilities were found in this scaffold layer.

---

## Warnings

### WR-01: Cross-entity lookups in ISwipeRepository violate SRP and force incorrect transaction scopes

**File:** `src/domain/interfaces/swipe.repository.interface.ts:21-23`

**Issue:** `ISwipeRepository` declares `findJobById`, `findCandidateProfileByUserId`, and `findRecruiterProfileByUserId`. These entities are owned by `IJobRepository`, `ICandidateRepository`, and `IRecruiterRepository` respectively. When the swipe service performs a swipe operation (which must be atomic per the security rules), it will need to inject `ISwipeRepository` only — but that repository's implementation will internally duplicate reads already owned by other repositories. If those reads need to happen in the same Prisma transaction as `createSwipe`, the implementation will be forced to open a transaction inside the swipe repository that spans data logically owned elsewhere, making it impossible to compose repository operations under a single externally-supplied transaction context. The same pattern appears in `ICreditRepository` (WR-02).

**Fix:** Remove the cross-entity methods from `ISwipeRepository`. The swipe service should receive all three repositories and perform pre-validation reads via the correct owner before calling `ISwipeRepository.createSwipe`:

```typescript
// REMOVE from ISwipeRepository:
//   findJobById(id: string): Promise<Job | null>
//   findCandidateProfileByUserId(userId: string): Promise<CandidateProfile | null>
//   findRecruiterProfileByUserId(userId: string): Promise<RecruiterProfile | null>

// ISwipeRepository should only own swipe-domain operations:
export interface ISwipeRepository {
  createSwipe(data: {
    candidateId: string
    jobId: string
    direction: SwipeDirection
  }): Promise<Swipe>
  findFeedJobs(
    candidateId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<Job[]>
  findSwipesByJobId(jobId: string): Promise<SwipeWithCandidateInfo[]>
  findUnlocksByJobAndCompany(jobId: string, companyId: string): Promise<Set<string>>
}
```

---

### WR-02: Cross-entity lookups in ICreditRepository violate SRP

**File:** `src/domain/interfaces/credit.repository.interface.ts:28-38`

**Issue:** `ICreditRepository` declares `findRecruiterByUserId`, `findJobById`, `findSwipe`, `findCandidateProfileById`. The recruiter, job, swipe, and candidate entities are owned by their respective repositories. Embedding these in `ICreditRepository` means the implementation must duplicate read logic from four other repositories. This will also make it impossible to correctly enforce the atomic credit deduction + unlock creation transaction without entangling unrelated read logic inside the transaction boundary.

**Fix:** Remove cross-entity lookups. The credit service should accept `IRecruiterRepository`, `IJobRepository`, `ISwipeRepository`, and `ICandidateRepository` for reads, then call `ICreditRepository.executeUnlock` for the atomic write. `ICreditRepository` should own only credit-domain state:

```typescript
export interface ICreditRepository {
  findUnlock(
    companyId: string,
    candidateId: string,
    jobId: string,
  ): Promise<Unlock | null>
  executeUnlock(
    companyId: string,
    candidateId: string,
    jobId: string,
    creditsCost: number,
  ): Promise<UnlockResult>
  grantCredits(companyId: string, amount: number, reason: string): Promise<Company>
}
```

---

### WR-03: IRecruiterRepository.findCompanyById duplicates ICompanyRepository.findById

**File:** `src/domain/interfaces/recruiter.repository.interface.ts:7`

**Issue:** `IRecruiterRepository` exposes `findCompanyById(id: string): Promise<Company | null>`. This is identical in contract to `ICompanyRepository.findById`. When a recruiter service needs a company, it currently has two paths to the same data — through `IRecruiterRepository` or `ICompanyRepository` — which creates inconsistency: caching, eager-loading, and column selection may differ between the two implementations. It also means any recruiter service must inject `IRecruiterRepository` even when it only needs company data.

**Fix:** Remove `findCompanyById` from `IRecruiterRepository`. Services that need both recruiter and company data should inject both `IRecruiterRepository` and `ICompanyRepository`:

```typescript
export interface IRecruiterRepository {
  upsertProfile(userId: string, data: { companyId: string }): Promise<RecruiterProfile>
  findByUserId(userId: string): Promise<RecruiterProfile | null>
  // findCompanyById removed — use ICompanyRepository.findById
}
```

---

### WR-04: IJobRepository.findRecruiterProfileByUserId does not belong in a job repository

**File:** `src/domain/interfaces/job.repository.interface.ts:27`

**Issue:** `IJobRepository.findRecruiterProfileByUserId` reads a `RecruiterProfile` — an entity owned by `IRecruiterRepository`. The job repository should have no knowledge of recruiter profiles. When the job service needs to verify that a user is a recruiter before creating a job, that check must happen via `IRecruiterRepository`, not via a duplicated lookup inside `IJobRepository`.

**Fix:** Remove this method from `IJobRepository`. The job service should accept `IRecruiterRepository` for the recruiter lookup:

```typescript
export interface IJobRepository {
  create(recruiterId: string, data: { ... }): Promise<Job>
  findById(id: string): Promise<Job | null>
  update(id: string, data: Partial<Omit<Job, 'id' | 'companyId' | 'recruiterId' | 'createdAt'>>): Promise<Job>
  findByRecruiterId(recruiterId: string): Promise<Job[]>
  deactivateExpiredJobs(): Promise<number>
  // findRecruiterProfileByUserId removed — use IRecruiterRepository.findByUserId
}
```

---

### WR-05: ITokenPort.verifyAccess is synchronous but JWT verification throws on invalid tokens

**File:** `src/application/ports/token.port.ts:4`

**Issue:** `verifyAccess(token: string): { id: string; role: string }` has a synchronous return type. In practice, JWT verification throws (e.g., `JsonWebTokenError`, `TokenExpiredError`) on invalid or expired tokens. Because the interface declares no `throws` annotation and TypeScript has no checked exceptions, every caller of `verifyAccess` will need to wrap it in a try/catch to handle the error path — but nothing in the contract signals this requirement. A developer implementing the Fastify auth hook could reasonably call this without a try/catch and produce unhandled exceptions in production.

**Fix:** Either return a discriminated union to make the error path explicit, or document the throw contract clearly. The discriminated union approach is safer:

```typescript
export type TokenVerifyResult =
  | { ok: true; payload: { id: string; role: string } }
  | { ok: false; reason: 'expired' | 'invalid' }

export interface ITokenPort {
  signAccess(payload: { id: string; role: string }): string
  generateRefreshToken(): { raw: string; hashed: string }
  verifyAccess(token: string): TokenVerifyResult
}
```

Alternatively, if the synchronous throwing pattern is intentional (to be consistent with JWT library conventions), add an explicit JSDoc comment to the interface method marking that it throws, so all callers wrap it in try/catch.

---

### WR-06: ISwipeRepository.findUnlocksByJobAndCompany returns Set<string> — leaks application concern into domain interface

**File:** `src/domain/interfaces/swipe.repository.interface.ts:30`

**Issue:** Returning `Set<string>` from a repository method is unusual. Repository interfaces in the domain layer should return plain data structures (arrays, objects, primitives). The conversion from a query result to a `Set` is an application-layer performance optimization (O(1) membership testing), not a domain concern. This forces every implementation of `ISwipeRepository` to materialize a `Set`, and makes the interface harder to implement correctly in test doubles (where returning a plain array would be more natural).

**Fix:** Return `string[]` from the interface. The service that calls this method can construct a `Set` from the array when O(1) lookup is needed:

```typescript
// In ISwipeRepository:
findUnlocksByJobAndCompany(jobId: string, companyId: string): Promise<string[]>

// In the service layer:
const unlockedIds = new Set(
  await swipeRepository.findUnlocksByJobAndCompany(jobId, companyId)
)
```

---

## Info

### IN-01: Company.plan typed as string — no compile-time safety for plan variants

**File:** `src/domain/entities/company.entity.ts:8`

**Issue:** `plan: string` accepts any string value at the type level. The `plan` field drives business logic (credit limits, feature gates) but there is no union type or enum constraining the valid values. A typo such as `'premim'` instead of `'premium'` will compile cleanly and cause silent runtime errors.

**Fix:** Define a union type for the valid plan values:

```typescript
export type CompanyPlan = 'FREE' | 'STARTER' | 'PREMIUM' | 'ENTERPRISE'

export interface Company {
  // ...
  plan: CompanyPlan
  // ...
}
```

---

### IN-02: CreditTransaction.reason is untyped string

**File:** `src/domain/entities/credit-transaction.entity.ts:5`

**Issue:** `reason: string` carries no compile-time contract about valid reason codes. If the credit service constructs transactions with reason strings like `'UNLOCK'`, `'PURCHASE'`, `'GRANT'`, these values are never validated against a known set. Downstream reporting or business logic that branches on `reason` will be fragile.

**Fix:** Extract a union type:

```typescript
export type CreditReason = 'UNLOCK' | 'PURCHASE' | 'GRANT' | 'REFUND'

export interface CreditTransaction {
  id: string
  companyId: string
  amount: number
  reason: CreditReason
  createdAt: Date
}
```

---

### IN-03: IGraphPort.seedTaxonomy and IRecommendationRepository.seedTaxonomy are duplicate contracts

**File:** `src/application/ports/graph.port.ts:14`, `src/domain/interfaces/recommendation.repository.interface.ts:24`

**Issue:** Both `IGraphPort` and `IRecommendationRepository` expose a `seedTaxonomy(): Promise<void>` method. The plan notes (09-02-PLAN.md, line 193) that `seedTaxonomy` was added to `IGraphPort` because it is a Neo4j operation. However, `IRecommendationRepository` also declares it. When the Phase 12 adapter is built, it is unclear which interface governs the contract — and services could call either, creating two injection points for the same operation.

**Fix:** Remove `seedTaxonomy` from one of the two interfaces. Given that `IGraphPort` is the Neo4j-facing port and `IRecommendationRepository` is the domain-facing read model, `seedTaxonomy` is an infrastructure concern and belongs in `IGraphPort` only. `IRecommendationRepository` should be limited to read-model queries:

```typescript
// IRecommendationRepository — remove seedTaxonomy:
export interface IRecommendationRepository {
  computeFitScore(candidate: FitScoreInput, job: FitScoreJobInput): Promise<number>
}
```

---

### IN-04: ChatListItem projection type defined inside repository interface file

**File:** `src/domain/interfaces/chat.repository.interface.ts:9-19`

**Issue:** `ChatListItem` is a denormalized view/projection type (it joins `candidateName`, `companyName`, and user IDs from multiple tables). Defining this shape inside the repository interface file mixes the data-fetching contract with a presentation-shaped type. If the API response shape changes, developers will look in the wrong place.

**Fix:** Move `ChatListItem` and `ChatParticipants` to a dedicated types file (e.g., `src/domain/types/chat.types.ts`) and import them in the interface. This keeps the interface file focused on the repository contract and makes the view types reusable by use-case and controller layers without importing a repository interface.

---

### IN-05: RefreshToken entity has no replacedBy field for rotation chain tracking

**File:** `src/domain/entities/refresh-token.entity.ts:1-9`

**Issue:** The security rules require refresh token rotation. The current entity has `revokedAt: Date | null` which records that a token was revoked, but not *why* (rotated vs. compromised). Without a `replacedBy: string | null` field (the ID of the new token that replaced this one), it is impossible to distinguish a legitimate rotation from a reuse attack — the repository can only detect that a token was already revoked, not whether it was rotated or stolen. This is a known security pattern gap; the implementation will still be functional but the reuse-attack detection window will be wider than intended.

**Fix:** Add the rotation chain field:

```typescript
export interface RefreshToken {
  id: string
  tokenHash: string
  familyId: string
  userId: string
  expiresAt: Date
  revokedAt: Date | null
  replacedBy: string | null   // ID of successor token; null if revoked for security reasons
  createdAt: Date
}
```

This requires a corresponding Prisma migration and `IRefreshTokenRepository.create` signature update, so address it before Phase 10 implements the auth service.

---

_Reviewed: 2026-05-06_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
