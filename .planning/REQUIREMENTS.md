# Requirements — Job Tinder Backend

## v1 Requirements (Milestone v1.0 — Complete)

### Authentication (AUTH)

- [x] **AUTH-01**: Usuário pode criar conta com email/senha
- [x] **AUTH-02**: Usuário pode fazer login com email/senha e receber JWT de acesso + refresh token
- [x] **AUTH-03**: Usuário pode autenticar via Google OAuth2
- [x] **AUTH-04**: Usuário pode renovar token de acesso via refresh token
- [x] **AUTH-05**: Usuário pode fazer logout (invalidar refresh token)
- [x] **AUTH-06**: Rotas protegidas rejeitam requisições sem JWT válido

### Candidate Profile (CAND)

- [x] **CAND-01**: Candidato pode criar e editar perfil com nome, bio, localização (lat/lng), profissão, skills, modalidades preferidas e pretensão salarial
- [x] **CAND-02**: Candidato pode definir raio de busca em km para vagas
- [x] **CAND-03**: Candidato pode ver lista de vagas recomendadas para dar swipe

### Company & Recruiter (COMP)

- [x] **COMP-01**: Recrutador pode criar e editar perfil vinculado a uma empresa
- [x] **COMP-02**: Admin pode criar empresas na plataforma
- [x] **COMP-03**: Empresa tem saldo de créditos gerenciado via admin

### Jobs (JOB)

- [x] **JOB-01**: Recrutador pode criar vaga com título, descrição, profissão, skills requeridas, faixa salarial, localização, modalidade e data de expiração
- [x] **JOB-02**: Recrutador pode editar e desativar vagas
- [x] **JOB-03**: Vagas expiradas são desativadas automaticamente (scheduler)
- [x] **JOB-04**: Recrutador vê página da vaga com ranking de candidatos por % de fit

### Swipe (SWIPE)

- [x] **SWIPE-01**: Candidato pode dar swipe LIKE ou DISLIKE em uma vaga
- [x] **SWIPE-02**: Candidato não pode dar swipe na mesma vaga duas vezes
- [x] **SWIPE-03**: No ranking da vaga, candidatos que deram LIKE aparecem com perfil completo visível
- [x] **SWIPE-04**: No ranking da vaga, candidatos que deram DISLIKE aparecem com identidade censurada (posição no rank visível)

### Recommendation (REC)

- [x] **REC-01**: Score de fit calculado via Neo4j considerando: profissão, skills, localização, modalidade de trabalho, pretensão salarial
- [x] **REC-02**: Grafo de profissões/habilidades seed no Neo4j
- [x] **REC-03**: Candidatos rankeados por % de fit descendente na página da vaga

### Credits (CREDIT)

- [x] **CREDIT-01**: Empresa pode usar créditos para desbloquear perfil de candidato que deu DISLIKE
- [x] **CREDIT-02**: Cada desbloqueio desconta créditos do saldo da empresa
- [x] **CREDIT-03**: Transações de crédito são registradas (audit log)
- [x] **CREDIT-04**: Admin pode adicionar créditos a uma empresa

### Chat (CHAT)

- [x] **CHAT-01**: Chat em tempo real via WebSocket entre candidato e recrutador
- [x] **CHAT-02**: Chat criado automaticamente quando candidato dá LIKE (match) ou quando empresa desbloqueia candidato
- [x] **CHAT-03**: Mensagens persistidas no PostgreSQL
- [x] **CHAT-04**: Histórico de mensagens carregado ao abrir chat

### Admin (ADMIN)

- [x] **ADMIN-01**: Admin pode listar e gerenciar usuários
- [x] **ADMIN-02**: Admin pode adicionar créditos a empresas
- [x] **ADMIN-03**: Rotas admin protegidas por role ADMIN

### Security (SEC)

- [x] **SEC-01**: Todas as queries ao DB usam Prisma ORM (sem raw SQL com interpolação de strings) — previne SQL injection
- [x] **SEC-02**: Inputs de usuário validados e sanitizados via Zod em todos os endpoints
- [x] **SEC-03**: Operações de crédito e swipe executadas em transações atômicas — previne race conditions
- [x] **SEC-04**: Senhas armazenadas com bcrypt (salt rounds ≥ 12)
- [x] **SEC-05**: Rate limiting em rotas sensíveis (login, register, swipe)
- [x] **SEC-06**: JWT de curta duração (access token ≤ 15min), refresh token com rotação
- [x] **SEC-07**: Headers de segurança HTTP via @fastify/helmet

### Architecture (ARCH)

- [x] **ARCH-01**: Cada módulo segue Clean Architecture — routes → service → repository (sem pular camadas)
- [x] **ARCH-02**: Services não importam diretamente clientes de DB — dependência injetada via repositórios
- [x] **ARCH-03**: Responsabilidade única por classe/função (SOLID - SRP)
- [x] **ARCH-04**: Módulos não importam diretamente de outros módulos — comunicação via interfaces

---

## v2 Requirements (Milestone v2.0 — Clean Architecture Refactor)

### Architecture — Layer Isolation (ARCH)

- [ ] **ARCH-05**: Domain entities em `src/domain/entities/` não importam nenhuma lib externa (Prisma, Fastify, bcrypt, JWT)
- [ ] **ARCH-06**: Repository interfaces em `src/domain/interfaces/` definem contratos de acesso a dados sem implementação (portas de saída)
- [ ] **ARCH-07**: Use cases em `src/application/use-cases/` recebem todas as dependências exclusivamente via interfaces e ports — nunca implementações concretas
- [ ] **ARCH-08**: Ports em `src/application/ports/` definem contratos para serviços externos: `IHashPort` (bcrypt), `ITokenPort` (JWT), `IGraphPort` (Neo4j)
- [ ] **ARCH-09**: Controllers em `src/adapters/controllers/` orquestram use cases e formatam resposta HTTP sem conter lógica de negócio
- [ ] **ARCH-10**: Repository implementations em `src/adapters/repositories/` implementam as interfaces definidas em `src/domain/interfaces/`
- [ ] **ARCH-11**: Service adapters em `src/adapters/services/` implementam os ports definidos em `src/application/ports/`
- [ ] **ARCH-12**: Routes em `src/infrastructure/http/routes/` apenas registram endpoints e instanciam controllers — sem lógica de negócio
- [ ] **ARCH-13**: Regra de dependência enforced: `domain` não importa nada do projeto; `application` importa apenas `domain`; `adapters` importa `application` + `domain`; `infrastructure` importa todas as camadas

### Test Preservation (TEST)

- [ ] **TEST-01**: Todos os testes de integração existentes (41 testes) continuam passando após refatoração — regressão zero
- [ ] **TEST-02**: Use cases são testáveis unitariamente sem banco usando mocks Jest das interfaces de domínio
- [ ] **TEST-03**: Repository implementations são testadas contra banco real (Docker Compose) sem mocks

### Migration Completeness (MIGRATE)

- [ ] **MIGRATE-01**: Nenhum arquivo de lógica permanece em `src/modules/` após migração completa
- [ ] **MIGRATE-02**: Todos os arquivos seguem o mapeamento definido no `plan-architecture.md` — tabela "Arquivo Atual → Nova Localização"

---

## Out of Scope (v2.0)

- Adicionar novas features durante a refatoração — milestone é exclusivamente refactor
- Alterar a API pública (endpoints, schemas de resposta) — comportamento externo preservado
- Trocar bibliotecas (ex: substituir Prisma por outro ORM) — mesmo stack
- Candidatos comprando créditos — deferred
- Sistema de pagamento integrado — deferred
- App mobile — fora de escopo
- Notificação push — deferred

---

## Traceability

### v1.0 (Completed — 2026-05-03)

| REQ-ID | Phase | Status |
|--------|-------|--------|
| AUTH-01 | Phase 2 | Complete |
| AUTH-02 | Phase 2 | Complete |
| AUTH-03 | Phase 2 | Complete |
| AUTH-04 | Phase 2 | Complete |
| AUTH-05 | Phase 2 | Complete |
| AUTH-06 | Phase 2 | Complete |
| CAND-01 | Phase 3 | Complete |
| CAND-02 | Phase 3 | Complete |
| CAND-03 | Phase 6 | Complete |
| COMP-01 | Phase 3 | Complete |
| COMP-02 | Phase 3 | Complete |
| COMP-03 | Phase 3 | Complete |
| JOB-01 | Phase 4 | Complete |
| JOB-02 | Phase 4 | Complete |
| JOB-03 | Phase 4 | Complete |
| JOB-04 | Phase 4 | Complete |
| SWIPE-01 | Phase 5 | Complete |
| SWIPE-02 | Phase 5 | Complete |
| SWIPE-03 | Phase 5 | Complete |
| SWIPE-04 | Phase 5 | Complete |
| REC-01 | Phase 6 | Complete |
| REC-02 | Phase 6 | Complete |
| REC-03 | Phase 6 | Complete |
| CREDIT-01 | Phase 7 | Complete |
| CREDIT-02 | Phase 7 | Complete |
| CREDIT-03 | Phase 7 | Complete |
| CREDIT-04 | Phase 7 | Complete |
| CHAT-01 | Phase 8 | Complete |
| CHAT-02 | Phase 8 | Complete |
| CHAT-03 | Phase 8 | Complete |
| CHAT-04 | Phase 8 | Complete |
| ADMIN-01 | Phase 3 | Complete |
| ADMIN-02 | Phase 3 | Complete |
| ADMIN-03 | Phase 3 | Complete |
| SEC-01 | All Phases | Complete |
| SEC-02 | All Phases | Complete |
| SEC-03 | Phase 5, 7 | Complete |
| SEC-04 | Phase 2 | Complete |
| SEC-05 | Phase 2 | Complete |
| SEC-06 | Phase 2 | Complete |
| SEC-07 | Phase 1 | Complete |
| ARCH-01 | All Phases | Complete |
| ARCH-02 | All Phases | Complete |
| ARCH-03 | All Phases | Complete |
| ARCH-04 | All Phases | Complete |

### v2.0 (In Progress)

| REQ-ID | Phase | Status |
|--------|-------|--------|
| ARCH-05 | Phase 9 | Pending |
| ARCH-06 | Phase 9 | Pending |
| ARCH-07 | Phase 12 | Pending |
| ARCH-08 | Phase 9 | Pending |
| ARCH-09 | Phase 10 | Pending |
| ARCH-10 | Phase 10 | Pending |
| ARCH-11 | Phase 10 | Pending |
| ARCH-12 | Phase 10 | Pending |
| ARCH-13 | Phase 13 | Pending |
| TEST-01 | Phase 12 | Pending |
| TEST-02 | Phase 13 | Pending |
| TEST-03 | Phase 11 | Pending |
| MIGRATE-01 | Phase 13 | Pending |
| MIGRATE-02 | Phase 13 | Pending |
