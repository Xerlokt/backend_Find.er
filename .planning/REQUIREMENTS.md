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
- [ ] **CAND-03**: Candidato pode ver lista de vagas recomendadas para dar swipe

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

- [ ] **REC-01**: Score de fit calculado via Neo4j considerando: profissão, skills, localização, modalidade de trabalho, pretensão salarial
- [ ] **REC-02**: Grafo de profissões/habilidades seed no Neo4j
- [ ] **REC-03**: Candidatos rankeados por % de fit descendente na página da vaga

### Credits (CREDIT)

- [ ] **CREDIT-01**: Empresa pode usar créditos para desbloquear perfil de candidato que deu DISLIKE
- [ ] **CREDIT-02**: Cada desbloqueio desconta créditos do saldo da empresa
- [ ] **CREDIT-03**: Transações de crédito são registradas (audit log)
- [ ] **CREDIT-04**: Admin pode adicionar créditos a uma empresa

### Chat (CHAT)

- [ ] **CHAT-01**: Chat em tempo real via WebSocket entre candidato e recrutador
- [ ] **CHAT-02**: Chat criado automaticamente quando candidato dá LIKE (match) ou quando empresa desbloqueia candidato
- [ ] **CHAT-03**: Mensagens persistidas no PostgreSQL
- [ ] **CHAT-04**: Histórico de mensagens carregado ao abrir chat

### Admin (ADMIN)

- [ ] **ADMIN-01**: Admin pode listar e gerenciar usuários
- [ ] **ADMIN-02**: Admin pode adicionar créditos a empresas
- [ ] **ADMIN-03**: Rotas admin protegidas por role ADMIN

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
| AUTH-01 → AUTH-06 | — | Pending |
| CAND-01 → CAND-03 | — | Pending |
| COMP-01 → COMP-03 | — | Pending |
| JOB-01 → JOB-04 | — | Pending |
| SWIPE-01 → SWIPE-04 | — | Pending |
| REC-01 → REC-03 | — | Pending |
| CREDIT-01 → CREDIT-04 | — | Pending |
| CHAT-01 → CHAT-04 | — | Pending |
| ADMIN-01 → ADMIN-03 | — | Pending |
