# Job Tinder — Design Spec

**Data:** 2026-04-09
**Status:** Aprovado

---

## Visão Geral

Plataforma de empregos com mecânica de swipe inspirada no Tinder. Candidatos navegam por vagas em cards e dão like/dislike. Recrutadores publicam vagas e visualizam candidatos interessados com percentual de match. O sistema de recomendação usa um grafo de profissões (Neo4j) para calcular afinidade entre o perfil do candidato e a vaga.

---

## Plataformas (MVP)

| Plataforma | Usuário |
|---|---|
| App mobile (React Native) | Candidato |
| Web (Next.js) | Recrutador |

**Futuro:** Web para candidato e app mobile para recrutador — a arquitetura já suporta essa expansão.

---

## Arquitetura

**Estilo:** Monolito modular com separação estratégica dos módulos de recomendação e chat, prontos para extração em microserviços no futuro.

**Stack:**
- Backend: Node.js + Fastify + TypeScript
- Banco relacional: PostgreSQL
- Banco de grafo: Neo4j (sistema de recomendação)
- App mobile: React Native
- Web: Next.js
- WebSocket: para chat em tempo real

```
┌─────────────────────────────────────────────────────┐
│                    CLIENTES                         │
│   App Candidato (React Native)  │  Web Recrutador   │
│                                 │  (Next.js)        │
└──────────────────┬──────────────────────────────────┘
                   │ HTTPS / WSS
┌──────────────────▼──────────────────────────────────┐
│              API Gateway (Fastify)                  │
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │   Auth   │  │  Vagas   │  │  Recomendação    │  │
│  │ Module   │  │ Module   │  │  Module (Neo4j)  │  │
│  └──────────┘  └──────────┘  └──────────────────┘  │
│                                                     │
│  ┌──────────────────────┐  ┌──────────────────────┐ │
│  │    Chat Module       │  │   Admin Module       │ │
│  │    (WebSocket)       │  │  (curadoria grafo)   │ │
│  └──────────────────────┘  └──────────────────────┘ │
└──────────────────┬──────────────────────────────────┘
                   │
       ┌───────────┴───────────┐
       ▼                       ▼
  PostgreSQL               Neo4j
  (usuários, vagas,        (grafo de profissões,
   candidaturas, chat)      skills, relações)
```

---

## Autenticação

- JWT com refresh token
- OAuth2 Google
- Candidato e recrutador usam o mesmo sistema de login com roles: `CANDIDATE` | `RECRUITER`

---

## Modelo de Dados (PostgreSQL)

```sql
users
  id, email, password_hash, role (CANDIDATE | RECRUITER)
  google_id, avatar_url, created_at

candidate_profiles
  user_id, name, bio, location (lat/lng)
  profession_id        -- referência ao nó no Neo4j
  skills[]             -- tags de conhecimento
  preferred_modalities[] -- mínimo 1: REMOTE | HYBRID | IN_PERSON
  search_radius_km     -- raio de busca para vagas presenciais/híbridas

companies
  id, name, logo_url, description
  rating               -- média das avaliações feitas por candidatos após entrevistas
  plan (FREE | PRO | ...)
  plan_expires_at
  credits              -- saldo de créditos

jobs
  id, company_id, title, description
  profession_id        -- referência ao nó no Neo4j
  salary_min, salary_max
  location (lat/lng)
  modality (REMOTE | HYBRID | IN_PERSON)
  required_skills[]
  expires_at           -- calculado automaticamente pelo plano
  is_active

swipes
  candidate_id, job_id
  direction (LIKE | DISLIKE)
  swiped_at

chats
  id, candidate_id, job_id, company_id
  initiated_by (MATCH | CREDIT)
  expires_at           -- null se MATCH, created_at + 3 dias se CREDIT
  is_active

messages
  id, chat_id, sender_id
  content, created_at, read_at

credit_transactions
  company_id, amount, reason, created_at
```

---

## Grafo de Profissões (Neo4j)

```cypher
(:Profession {id, name, area})-[:RELATED_TO {weight: 0.75}]->(:Profession)
(:Profession)-[:HAS_SKILL]->(:Skill {name})
(:Profession)-[:BELONGS_TO]->(:Area {name: "Tech"})
```

- `weight` na aresta define o percentual base de match entre dois cargos
- Escopo inicial: área de tecnologia
- Expansão: área por área conforme o produto cresce
- Novos cargos (ex: "Engenheiro de IA") são adicionados via painel admin sem impactar cargos existentes

---

## Sistema de Recomendação

### Filtros pré-score (eliminatórios)
1. **Modalidade:** `job.modality` deve estar em `candidate.preferred_modalities[]`
2. **Localização:** candidato dentro do raio definido por ele, ou vaga remota (ignora localização)
3. **Vaga ativa:** `job.is_active = true` e `job.expires_at > now()`

### Cálculo do match_score

```
match_score = peso_cargo (50%) + peso_skills (35%) + peso_localização (15%)
```

**Cargo (50%):**
Distância entre `candidate.profession_id` e `job.profession_id` no grafo Neo4j:
- Mesmo nó → 100%
- 1 hop (ex: Backend → Fullstack) → peso da aresta (~75%)
- 2 hops → produto dos pesos (~40%)
- Sem conexão → 0%

**Skills (35%):**
```
skills_match = skills_em_comum / total_skills_exigidas_pela_vaga
```

**Localização (15%):**
- Dentro do raio → 100%
- Fora do raio → 0%
- Vaga remota → 100% (ignora distância)

**Threshold mínimo:** vagas com `match_score < 30%` não aparecem no feed.

O feed do candidato é ordenado por `match_score` decrescente. O percentual é exibido no card da vaga.

### Curadoria do grafo (Admin)
Painel admin para:
1. Criar novo nó de profissão
2. Definir arestas e pesos com profissões existentes
3. Publicar — candidatos relacionados passam a receber vagas imediatamente

---

## Regras de Chat

| Situação | Empresa pode enviar mensagem? | Custo |
|---|---|---|
| Candidato deu LIKE | Sim | Grátis |
| Candidato não viu a vaga | Sim | 1 crédito |
| Candidato deu DISLIKE | Sim | 1 crédito |

**Fluxo por crédito:**
- Chat criado com `expires_at = now() + 3 dias`
- Candidato recebe notificação: "Uma empresa tem interesse em você"
- Se candidato responder → chat vira permanente (`expires_at = null`)
- Se não interagir em 3 dias → chat expira e some

**Chat por match:**
- Aberto automaticamente após LIKE do candidato
- Permanente, sem expiração

---

## Regras de Vagas e Planos

### Plano Free
- 3 vagas simultâneas
- Duração de 3 dias por vaga
- Sem créditos incluídos

### Planos Pagos
- Número de vagas e duração definidos conforme estratégia comercial (a definir)
- Créditos incluídos ou comprados separadamente

### Expiração automática
- Job scheduler roda periodicamente
- Vagas com `expires_at < now()` → `is_active = false`
- Vagas expiradas somem do feed dos candidatos
- Chats ativos permanecem abertos (conversa não é interrompida)

---

## Fluxos Principais

### Candidato
```
Cadastro
→ Preenche: cargo, skills, localização, modalidades preferidas (mín. 1)
→ Feed de vagas em cards com: nome da empresa, logo, cargo, salário estimado, % de match, avaliação
→ Swipe direita (LIKE) → entra na lista do recrutador
→ Swipe esquerda (DISLIKE) → não aparece mais
→ Chat disponível quando empresa iniciar contato
```

### Recrutador
```
Cadastro da empresa
→ Escolhe plano
→ Cria vaga: cargo, skills exigidas, salário, modalidade, localização
→ Publica → vaga entra no feed dos candidatos com expiração automática
→ Visualiza lista de candidatos que deram LIKE, ordenada por % de match
→ Inicia chat: grátis (match) ou com créditos (sem match)
```

---

## Decisões em Aberto

- **Planos pagos:** tiers, preços e benefícios a definir na estratégia comercial
- **Expiração de chat por crédito:** fixada em 3 dias (pode ser ajustada)
- **Threshold mínimo de match:** fixado em 30% (pode ser ajustado com dados reais)
- **Gateway de pagamento:** a definir (Stripe ou Pagar.me recomendados para BR)
