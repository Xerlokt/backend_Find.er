process.env.DATABASE_URL = 'postgresql://jobtinder:jobtinder@localhost:5432/jobtinder'
const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')
const p = new PrismaClient();
(async () => {
  const hash = await bcrypt.hash('Senha123!', 12)
  const user = await p.user.create({ data: { email: 'admin@test.com', passwordHash: hash, role: 'ADMIN' } })
  console.log('criado:', user.id)
  await p.$disconnect()
})().catch(e => { console.error(e.message); p.$disconnect() })
