# Requirements — Job Tinder Backend

## v1 Requirements

### Authentication (AUTH)

- [ ] **AUTH-01**: Usuário pode criar conta com email/senha
- [ ] **AUTH-02**: Usuário pode fazer login com email/senha e receber JWT de acesso + refresh token
- [ ] **AUTH-03**: Usuário pode autenticar via Google OAuth2
- [ ] **AUTH-04**: Usuário pode renovar token de acesso via refresh token
- [ ] **AUTH-05**: Usuário pode fazer logout (invalidar refresh token)
- [ ] **AUTH-06**: Rotas protegidas rejeitam requisições sem JWT válido

### Candidate Profile (CAND)

- [ ] **CAND-01**: Candidato pode criar e editar perfil com nome, bio, localização (lat/lng), profissão, skills, modalidades preferidas e pretensão salarial
- [ ] **CAND-02**: Candidato pode definir raio de busca em km para vagas
- [x] **CAND-03**: Candidato pode ver lista de vagas recomendadas para dar swipe

### Company & Recruiter (COMP)

- [ ] **COMP-01**: Recrutador pode criar e editar perfil vinculado a uma empresa
- [ ] **COMP-02**: Admin pode criar empresas na plataforma
- [ ] **COMP-03**: Empresa tem saldo de créditos gerenciado via admin

### Jobs (JOB)

- [ ] **JOB-01**: Recrutador pode criar vaga com título, descrição, profissão, skills requeridas, faixa salarial, localização, modalidade e data de expiração
- [ ] **JOB-02**: Recrutador pode editar e desativar vagas
- [ ] **JOB-03**: Vagas expiradas são desativadas automaticamente (scheduler)
- [ ] **JOB-04**: Recrutador vê página da vaga com ranking de candidatos por % de fit

### Swipe (SWIPE)

- [ ] **SWIPE-01**: Candidato pode dar swipe LIKE ou DISLIKE em uma vaga
- [ ] **SWIPE-02**: Candidato não pode dar swipe na mesma vaga duas vezes
- [ ] **SWIPE-03**: No ranking da vaga, candidatos que deram LIKE aparecem com perfil completo visível
- [ ] **SWIPE-04**: No ranking da vaga, candidatos que deram DISLIKE aparecem com identidade censurada (posição no rank visível)

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

- [ ] **ADMIN-01**: Admin pode listar e gerenciar usuários
- [ ] **ADMIN-02**: Admin pode adicionar créditos a empresas
- [ ] **ADMIN-03**: Rotas admin protegidas por role ADMIN

### Security (SEC)

- [ ] **SEC-01**: Todas as queries ao DB usam Prisma ORM (sem raw SQL com interpolação de strings) — previne SQL injection
- [ ] **SEC-02**: Inputs de usuário validados e sanitizados via Zod em todos os endpoints
- [ ] **SEC-03**: Operações de crédito e swipe executadas em transações atômicas — previne race conditions
- [ ] **SEC-04**: Senhas armazenadas com bcrypt (salt rounds ≥ 12)
- [ ] **SEC-05**: Rate limiting em rotas sensíveis (login, register, swipe)
- [ ] **SEC-06**: JWT de curta duração (access token ≤ 15min), refresh token com rotação
- [ ] **SEC-07**: Headers de segurança HTTP via @fastify/helmet

### Architecture (ARCH)

- [ ] **ARCH-01**: Cada módulo segue Clean Architecture — routes → service → repository (sem pular camadas)
- [ ] **ARCH-02**: Services não importam diretamente clientes de DB — dependência injetada via repositórios
- [ ] **ARCH-03**: Responsabilidade única por classe/função (SOLID - SRP)
- [ ] **ARCH-04**: Módulos não importam diretamente de outros módulos — comunicação via interfaces

---

## v2 (Deferred)

- Candidatos comprando créditos — fora do escopo v1 (créditos só para empresas)
- Sistema de pagamento integrado — créditos gerenciados manualmente via admin na v1
- Notificação push quando candidato é desbloqueado
- App mobile
- Relatórios e analytics de vagas

---

## Out of Scope

- Candidatos comprando ou gerenciando créditos — créditos são exclusivos das empresas
- Pagamento online integrado (Stripe, etc.) — v1 gerencia créditos via admin
- App mobile — apenas API REST + WebSocket
- Sistema de avaliação/review de empresas por candidatos — v2

---

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| AUTH-01 | Phase 2 | Pending |
| AUTH-02 | Phase 2 | Pending |
| AUTH-03 | Phase 2 | Pending |
| AUTH-04 | Phase 2 | Pending |
| AUTH-05 | Phase 2 | Pending |
| AUTH-06 | Phase 2 | Pending |
| CAND-01 | Phase 3 | Pending |
| CAND-02 | Phase 3 | Pending |
| CAND-03 | Phase 6 | Complete |
| COMP-01 | Phase 3 | Pending |
| COMP-02 | Phase 3 | Pending |
| COMP-03 | Phase 3 | Pending |
| JOB-01 | Phase 4 | Pending |
| JOB-02 | Phase 4 | Pending |
| JOB-03 | Phase 4 | Pending |
| JOB-04 | Phase 4 | Pending |
| SWIPE-01 | Phase 5 | Pending |
| SWIPE-02 | Phase 5 | Pending |
| SWIPE-03 | Phase 5 | Pending |
| SWIPE-04 | Phase 5 | Pending |
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
| ADMIN-01 | Phase 3 | Pending |
| ADMIN-02 | Phase 3 | Pending |
| ADMIN-03 | Phase 3 | Pending |
| SEC-01 | All Phases | Pending |
| SEC-02 | All Phases | Pending |
| SEC-03 | Phase 5, 7 | Complete |
| SEC-04 | Phase 2 | Pending |
| SEC-05 | Phase 2 | Pending |
| SEC-06 | Phase 2 | Pending |
| SEC-07 | Phase 1 | Pending |
| ARCH-01 | All Phases | Pending |
| ARCH-02 | All Phases | Pending |
| ARCH-03 | All Phases | Pending |
| ARCH-04 | All Phases | Pending |
