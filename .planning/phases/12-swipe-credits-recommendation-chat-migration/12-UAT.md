---
status: complete
phase: 12-swipe-credits-recommendation-chat-migration
source: 12-01-SUMMARY.md, 12-02-SUMMARY.md, 12-03-SUMMARY.md, 12-04-SUMMARY.md
started: 2026-05-09T00:00:00Z
updated: 2026-05-09T19:45:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running server. Start from scratch with docker compose up -d + npm run dev (or equivalent). Server boots without errors, 134 integration tests pass, and a basic health/auth call returns a live response.
result: pass

### 2. List Chats
expected: Authenticated GET /chats returns the logged-in user's chat list. Each item has chatId, candidateName/companyName, and the last message. Returns 200 with an array (empty array when no chats).
result: pass

### 3. Get Messages (cursor pagination)
expected: Authenticated GET /chats/:chatId/messages?limit=10 returns up to 10 messages oldest-first. Response includes hasNext: true when more pages exist. Fetching the next page with cursor= returns the next batch without duplicates or gaps.
result: pass

### 4. Unlock Candidate (credits deducted, chat created)
expected: Recruiter POST /:jobId/candidates/:candidateId/unlock — deducts the correct credit cost (FREE plan = 2, PRO = 1), creates an unlock record, and returns candidateProfile with distanceKm. A second identical call returns 409 (already unlocked). Insufficient credits returns 402/400 with an error message.
result: pass

### 5. Grant Credits
expected: POST to admin grant-credits endpoint with a positive integer — persists the grant and increments the company credit balance. Sending amount = 0 or a float returns a 400 validation error.
result: pass

### 6. Record Swipe — LIKE creates chat
expected: Candidate POST /swipes with direction: "LIKE" on a job — records the swipe and creates a chat (chat visible in GET /chats). A second swipe on the same job returns 409 (duplicate). POST with direction: "DISLIKE" records swipe without creating a chat.
result: pass

### 7. Get Feed (paginated, excludes swiped)
expected: Candidate GET /jobs/feed returns a paginated list of jobs with fitScore. Jobs the candidate already swiped on are excluded. Cursor-based pagination returns the next page correctly without repeating jobs.
result: pass

### 8. Get Ranking — DISLIKE profiles censored
expected: Recruiter GET /jobs/:jobId/ranking returns candidates ranked by fitScore descending. Candidates the recruiter DISLIKED and has not unlocked have profile: null (no personal data exposed). LIKE or unlocked candidates have full profile data.
result: pass

## Summary

total: 8
passed: 8
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none]
