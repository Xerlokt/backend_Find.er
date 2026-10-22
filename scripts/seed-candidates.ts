// Mock: cria ~24 candidatos de teste variados para o ranking do recrutador (melhores por fit, censurados).
// Uso: npm run seed:candidates   (precisa do Postgres do docker-compose no ar; não precisa do Neo4j)
// Idempotente: chaveado pelo email (@mock.finder.test). Senha de todos: Senha123!
// Alguns já têm LIKE/DISLIKE nas vagas do recrutador1@test.com, para aparecerem liberados no ranking.
import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { prisma } from '../src/infrastructure/database/prisma'
import { closeRedis, getRedisClient } from '../src/infrastructure/database/redis'

type Modality = 'REMOTE' | 'HYBRID' | 'IN_PERSON'
type Disc = 'D' | 'I' | 'S' | 'C'

const SP = { lat: -23.5505, lng: -46.6333 }
const CAMPINAS = { lat: -22.9099, lng: -47.0626 }
const RIO = { lat: -22.9068, lng: -43.1729 }
const NO_LOCATION = { lat: null, lng: null }

interface Mock {
  slug: string
  name: string
  professionId: string
  skills: string[]
  modalities: Modality[]
  where: { lat: number | null; lng: number | null }
  radiusKm: number
  salary: number | null
  disc: Disc | null
  bio: string
  /** título da vaga do recrutador1 -> reação */
  swipes?: Record<string, 'LIKE' | 'DISLIKE'>
}

const MOCKS: Mock[] = [
  // ── backend-dev (vagas: "Engenheiro(a) Backend Node.js", "Tech Lead Backend")
  { slug: 'ana.ribeiro', name: 'Ana Ribeiro', professionId: 'backend-dev', skills: ['nodejs', 'typescript', 'postgresql', 'docker'], modalities: ['HYBRID', 'REMOTE'], where: SP, radiusKm: 40, salary: 14000, disc: 'C', bio: 'Oito anos com APIs Node em fintech. Gosto de modelagem de dados e de mentoria.', swipes: { 'Engenheiro(a) Backend Node.js': 'LIKE' } },
  { slug: 'bruno.tavares', name: 'Bruno Tavares', professionId: 'backend-dev', skills: ['nodejs', 'postgresql', 'typescript'], modalities: ['HYBRID'], where: SP, radiusKm: 30, salary: 19000, disc: 'D', bio: 'Tech lead há 4 anos, já escalei times de 3 para 12 pessoas.' },
  { slug: 'carla.menezes', name: 'Carla Menezes', professionId: 'backend-dev', skills: ['java', 'spring', 'postgresql'], modalities: ['IN_PERSON', 'HYBRID'], where: CAMPINAS, radiusKm: 60, salary: 13000, disc: 'S', bio: 'Backend Java/Spring, migrando para Node. Curiosa e organizada.' },
  { slug: 'diego.fonseca', name: 'Diego Fonseca', professionId: 'backend-dev', skills: ['python', 'django', 'postgresql'], modalities: ['REMOTE'], where: RIO, radiusKm: 100, salary: 12000, disc: 'I', bio: 'Python/Django, apaixonado por testes automatizados.', swipes: { 'Tech Lead Backend': 'DISLIKE' } },
  { slug: 'elisa.campos', name: 'Elisa Campos', professionId: 'backend-dev', skills: ['nodejs', 'typescript', 'docker', 'aws'], modalities: ['REMOTE', 'HYBRID'], where: SP, radiusKm: 50, salary: 17500, disc: 'C', bio: 'Arquitetura de eventos e mensageria. Foco em observabilidade.', swipes: { 'Tech Lead Backend': 'LIKE' } },
  { slug: 'fabio.lacerda', name: 'Fábio Lacerda', professionId: 'backend-dev', skills: ['go', 'postgresql', 'docker'], modalities: ['REMOTE'], where: NO_LOCATION, radiusKm: 50, salary: 21000, disc: 'D', bio: 'Go em alta carga. Prefiro times pequenos e autonomia.' },
  { slug: 'gabriela.souto', name: 'Gabriela Souto', professionId: 'backend-dev', skills: ['nodejs', 'javascript'], modalities: ['REMOTE'], where: CAMPINAS, radiusKm: 25, salary: 6500, disc: null, bio: 'Júnior, dois anos de experiência com Express. Aprendo rápido.' },

  // ── frontend-dev (vaga: "Desenvolvedor(a) Frontend React")
  { slug: 'helena.duarte', name: 'Helena Duarte', professionId: 'frontend-dev', skills: ['react', 'typescript', 'css', 'nextjs'], modalities: ['REMOTE'], where: SP, radiusKm: 50, salary: 11500, disc: 'I', bio: 'Design systems e acessibilidade. Já liderei a migração para Next.', swipes: { 'Desenvolvedor(a) Frontend React': 'LIKE' } },
  { slug: 'igor.martins', name: 'Igor Martins', professionId: 'frontend-dev', skills: ['react', 'javascript', 'css', 'sass'], modalities: ['REMOTE', 'HYBRID'], where: RIO, radiusKm: 80, salary: 9500, disc: 'S', bio: 'Pleno, bom em animações e performance de renderização.' },
  { slug: 'julia.barros', name: 'Júlia Barros', professionId: 'frontend-dev', skills: ['vue', 'javascript', 'css', 'tailwind'], modalities: ['REMOTE'], where: NO_LOCATION, radiusKm: 50, salary: 8000, disc: 'I', bio: 'Vue no dia a dia, topo aprender React.' },
  { slug: 'kaue.pires', name: 'Kauê Pires', professionId: 'frontend-dev', skills: ['react', 'typescript', 'css', 'tailwind'], modalities: ['REMOTE'], where: CAMPINAS, radiusKm: 120, salary: 18000, disc: 'D', bio: 'Sênior, foco em produto. Pretensão acima da faixa, mas negocio.' },
  { slug: 'larissa.neves', name: 'Larissa Neves', professionId: 'frontend-dev', skills: ['angular', 'typescript', 'css'], modalities: ['HYBRID', 'IN_PERSON'], where: SP, radiusKm: 20, salary: 10000, disc: 'C', bio: 'Angular corporativo; querendo mudar para React.', swipes: { 'Desenvolvedor(a) Frontend React': 'DISLIKE' } },
  { slug: 'mateus.coelho', name: 'Mateus Coelho', professionId: 'frontend-dev', skills: ['react', 'javascript'], modalities: ['REMOTE'], where: SP, radiusKm: 50, salary: 5500, disc: null, bio: 'Em início de carreira, portfólio com 6 projetos em React.' },

  // ── fullstack-dev (vagas: "Dev Fullstack Pleno", "Desenvolvedor(a) Fullstack Júnior")
  { slug: 'natalia.prado', name: 'Natália Prado', professionId: 'fullstack-dev', skills: ['react', 'nodejs', 'typescript', 'postgresql'], modalities: ['REMOTE', 'HYBRID'], where: SP, radiusKm: 50, salary: 12500, disc: 'D', bio: 'Fullstack de ponta a ponta: do modelo de dados ao deploy.', swipes: { 'Dev Fullstack Pleno': 'LIKE' } },
  { slug: 'otavio.leal', name: 'Otávio Leal', professionId: 'fullstack-dev', skills: ['react', 'nodejs'], modalities: ['REMOTE'], where: NO_LOCATION, radiusKm: 50, salary: 6500, disc: 'S', bio: 'Júnior com muita vontade. Dois estágios em startups.' },
  { slug: 'patricia.vaz', name: 'Patrícia Vaz', professionId: 'fullstack-dev', skills: ['vue', 'nodejs', 'mysql'], modalities: ['HYBRID'], where: CAMPINAS, radiusKm: 35, salary: 11000, disc: 'I', bio: 'Vue + Node, e-commerce de médio porte.' },
  { slug: 'rafael.guedes', name: 'Rafael Guedes', professionId: 'fullstack-dev', skills: ['react', 'nodejs', 'typescript', 'docker', 'aws'], modalities: ['REMOTE'], where: RIO, radiusKm: 150, salary: 15500, disc: 'C', bio: 'Pleno/sênior. Cuido de CI/CD e infra sem deixar o produto de lado.' },
  { slug: 'sofia.amaral', name: 'Sofia Amaral', professionId: 'fullstack-dev', skills: ['python', 'react', 'postgresql'], modalities: ['REMOTE', 'HYBRID'], where: SP, radiusKm: 60, salary: 9800, disc: 'S', bio: 'Vim de dados para web. Gosto de dashboards e de APIs limpas.', swipes: { 'Desenvolvedor(a) Fullstack Júnior': 'DISLIKE' } },

  // ── mobile-dev (vagas: "Desenvolvedor(a) Mobile React Native", "Desenvolvedor(a) Mobile Sênior")
  { slug: 'thiago.arantes', name: 'Thiago Arantes', professionId: 'mobile-dev', skills: ['react-native', 'typescript', 'javascript'], modalities: ['REMOTE'], where: SP, radiusKm: 50, salary: 14500, disc: 'S', bio: 'React Native em app de pagamentos, 5M de downloads.', swipes: { 'Desenvolvedor(a) Mobile React Native': 'LIKE' } },
  { slug: 'ursula.matos', name: 'Úrsula Matos', professionId: 'mobile-dev', skills: ['flutter', 'dart'], modalities: ['REMOTE', 'HYBRID'], where: RIO, radiusKm: 90, salary: 12000, disc: 'I', bio: 'Flutter com foco em UX. Boa com publicação nas lojas.' },
  { slug: 'vitor.nogueira', name: 'Vítor Nogueira', professionId: 'mobile-dev', skills: ['react-native', 'javascript', 'android'], modalities: ['REMOTE'], where: CAMPINAS, radiusKm: 70, salary: 17000, disc: 'C', bio: 'Nativo Android que virou RN. Módulos nativos e performance.' },
  { slug: 'yasmin.cabral', name: 'Yasmin Cabral', professionId: 'mobile-dev', skills: ['swift', 'ios'], modalities: ['HYBRID'], where: SP, radiusKm: 30, salary: 16000, disc: 'D', bio: 'iOS nativo há 6 anos. Estudando React Native.' },

  // ── devops (sem vaga de teste; aparece em vagas futuras)
  { slug: 'wagner.sampaio', name: 'Wagner Sampaio', professionId: 'devops', skills: ['docker', 'kubernetes', 'terraform', 'aws'], modalities: ['REMOTE'], where: SP, radiusKm: 100, salary: 18000, disc: 'C', bio: 'SRE, IaC e pipelines. Sono tranquilo é meta de time.' },
  { slug: 'zelia.antunes', name: 'Zélia Antunes', professionId: 'devops', skills: ['docker', 'github-actions', 'ci-cd'], modalities: ['REMOTE', 'HYBRID'], where: CAMPINAS, radiusKm: 60, salary: 11000, disc: 'S', bio: 'DevOps pleno, foco em CI/CD e custo de nuvem.' },
]

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash('Senha123!', 10)

  // vagas do recrutador1 por título, para os swipes
  const jobs = await prisma.job.findMany({
    where: { recruiter: { user: { email: 'recrutador1@test.com' } } },
    select: { id: true, title: true },
  })
  const jobByTitle = new Map(jobs.map((j) => [j.title, j.id]))
  if (jobs.length === 0) console.log('Aviso: recrutador1@test.com não tem vagas; criando candidatos sem LIKE/DISLIKE.')

  let created = 0
  let swipes = 0
  for (const m of MOCKS) {
    const email = `${m.slug}@mock.finder.test`
    const existed = await prisma.user.findUnique({ where: { email }, select: { id: true } })
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, passwordHash, role: 'CANDIDATE', emailVerifiedAt: new Date() },
    })
    if (!existed) created++

    const data = {
      name: m.name,
      bio: m.bio,
      lat: m.where.lat,
      lng: m.where.lng,
      professionId: m.professionId,
      skills: m.skills,
      preferredModalities: m.modalities,
      searchRadiusKm: m.radiusKm,
      salaryExpectation: m.salary,
    }
    const profile = await prisma.candidateProfile.upsert({
      where: { userId: user.id },
      update: data,
      create: { userId: user.id, ...data },
    })

    if (m.disc) {
      const scores = { D: 20, I: 20, S: 20, C: 20 }
      scores[m.disc] = 55
      const disc = { scoreD: scores.D, scoreI: scores.I, scoreS: scores.S, scoreC: scores.C, dominant: m.disc }
      await prisma.discResult.upsert({ where: { candidateId: profile.id }, update: disc, create: { candidateId: profile.id, ...disc } })
    }

    for (const [title, direction] of Object.entries(m.swipes ?? {})) {
      const jobId = jobByTitle.get(title)
      if (!jobId) continue
      await prisma.swipe.upsert({
        where: { candidateId_jobId: { candidateId: profile.id, jobId } },
        update: { direction },
        create: { candidateId: profile.id, jobId, direction },
      })
      swipes++
    }
  }

  // o ranking fica 30 s em cache no Redis: limpa para os novos candidatos aparecerem já
  try {
    const redis = getRedisClient()
    const keys = await redis.keys('ranking:*')
    if (keys.length > 0) await redis.del(...keys)
  } catch {
    console.log('Redis fora do ar: aguarde ~30 s para o ranking refletir os novos candidatos.')
  }

  const total = await prisma.user.count({ where: { email: { endsWith: '@mock.finder.test' } } })
  console.log(`Mock ok: ${created} candidatos novos, ${swipes} swipes aplicados, ${total} mocks no banco.`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
    await closeRedis()
  })
