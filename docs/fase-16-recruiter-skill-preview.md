# Fase 16 — Recruiter Skill Preview (v3.0)

## O que foi construído

Candidatos DISLIKE (não desbloqueados) agora expõem ao recrutador uma prévia estruturada: `matchingSkills[]` (skills compartilhadas com a vaga) e `fitReasons[]` (explicações de fit sem dados de identidade). Uma função pura `censorProfile()` é o único ponto de decisão de reveal/conceal.

---

## Módulos e arquivos

| Arquivo | Responsabilidade |
|---------|-----------------|
| `src/application/use-cases/swipe/get-ranking.use-case.ts` | `GetRankingUseCase` — chama `censorProfile()` para cada candidato |
| `src/adapters/controllers/swipe.controller.ts` | Passa `RankingItem[]` com `matchingSkills` e `fitReasons` ao response |
| `src/infrastructure/http/routes/swipe.routes.ts` | `RankingItem` type atualizado — inclui `CensoredProfile` |
| `tests/unit/get-ranking.use-case.test.ts` | Testes unitários dos 3 estados: LIKE, DISLIKE-desbloqueado, DISLIKE-bloqueado |

---

## Por que foi feito assim

### `censorProfile()` como único ponto de decisão

Antes da fase 16, a lógica de reveal era um ternário inline no `GetRankingUseCase`. Com `censorProfile()`, há um único lugar que decide o que revelar para cada estado do candidato:

| Estado | Retorno |
|--------|---------|
| LIKE | perfil completo (nome, email, foto, localização) |
| DISLIKE + desbloqueado | perfil completo |
| DISLIKE + bloqueado | `CensoredProfile` (matchingSkills + fitReasons, sem identidade) |

Toda cobertura de teste aponta para essa função, não para o use case inteiro.

### `matchingSkills` na direção candidato→vaga

```typescript
matchingSkills = candidate.skills.filter(s => job.requiredSkills.includes(s))
```

A filtragem parte das skills do candidato — não das skills da vaga. Se a direção fosse invertida, um candidato vazio daria `matchingSkills = []` mas vazaria a lista completa de `requiredSkills` implicitamente pelo comportamento. Candidato-first evita o leak (T-16-02-02).

### `fitReasons[]` descritivo, nunca identificador

Exemplos de `fitReasons`: `"4/6 skills match"`, `"salary outside range"`, `"preferred modality mismatch"`. Esses textos descrevem fit sem qualquer dado pessoal. Um recrutador pode usar isso para decidir se vale a pena gastar créditos para desbloquear o candidato.

### Import circular evitado com `import()`

`RankingItem` em `swipe.routes.ts` usa `import()` lazy para `RankingProfile` de `get-ranking.use-case.ts`, evitando risco de circular import que surgiu ao mover tipos entre arquivos durante a fase.

---

## Response shape de `/jobs/:id/ranking`

```json
[
  {
    "candidateId": "uuid",
    "fitScore": 87,
    "discProfile": "D",
    "profile": {
      "name": "Ana Silva",
      "email": "ana@email.com",
      "avatarUrl": "...",
      "skills": ["Node.js", "TypeScript"]
    }
  },
  {
    "candidateId": "uuid",
    "fitScore": 72,
    "discProfile": "I",
    "profile": null,
    "matchingSkills": ["Node.js"],
    "fitReasons": ["1/3 skills match", "salary within range"]
  }
]
```

---

## Rodar os testes

```bash
npm run test:unit         # tests/unit/get-ranking.use-case.test.ts
npm run test:integration  # tests/integration/swipe.test.ts
```
