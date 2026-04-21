import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

process.env.DATABASE_URL = 'postgresql://jobtinder:jobtinder@localhost:5432/jobtinder'

const p = new PrismaClient()
const hash = await bcrypt.hash('Senha123!', 12)
const user = await p.user.create({ data: { email: 'admin@test.com', passwordHash: hash, role: 'ADMIN' } })
console.log('criado:', user.id)
await p.$disconnect()
