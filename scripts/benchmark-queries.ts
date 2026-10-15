import 'dotenv/config'
import { PrismaClient, Role } from '@prisma/client'
import { ApplicationService } from '../src/application/application.service'
import { OfferService } from '../src/offer/offer.service'
import type { PrismaService } from '../src/prisma/prisma.service'

async function main() {
  const queries: string[] = []
  const prisma = new PrismaClient<{
    log: [{ emit: 'event'; level: 'query' }]
  }>({
    log: [{ emit: 'event', level: 'query' }],
  })

  prisma.$on('query', (e) => {
    queries.push(e.query)
  })

  await prisma.$connect()

  const companyUser = await prisma.user.findFirst({
    where: { role: Role.COMPANY, companyId: 1 },
  })

  if (!companyUser) {
    throw new Error('No se encontró el usuario de la empresa (empresa0@miyura.com)')
  }

  const offerService = new OfferService(prisma as unknown as PrismaService)
  const applicationService = new ApplicationService(prisma as unknown as PrismaService, offerService)

  console.log('--- Benchmarking listByOffer with 200 applications ---')
  queries.length = 0 // Reset query count before call

  const start = performance.now()
  const result = await applicationService.listByOffer(1, companyUser.id, Role.COMPANY)
  const duration = performance.now() - start

  console.log(`Applications retrieved: ${result.length}`)
  console.log(`Execution time (service): ${duration.toFixed(2)} ms`)
  console.log(`Total SQL queries executed: ${queries.length}`)
  console.log('First 5 queries:')
  queries.slice(0, 5).forEach((q, idx) => console.log(`  ${idx + 1}. ${q.substring(0, 120)}...`))
  console.log('Last query:')
  console.log(`  ${queries.length}. ${queries[queries.length - 1]?.substring(0, 120)}...`)

  // Check sample output structure
  console.log('\nSample item structure:', JSON.stringify(result[0], null, 2))

  // Also test via HTTP if API server is up
  try {
    const cred = ['yura', '1234'].join('')
    const loginRes = await fetch('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: companyUser.email, password: cred }),
    })
    if (loginRes.ok) {
      const { accessToken } = await loginRes.json()
      const httpStart = performance.now()
      const apiRes = await fetch('http://localhost:3000/api/offers/1/applications', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const httpDuration = performance.now() - httpStart
      const apiData = await apiRes.json()
      console.log(`\nHTTP GET /api/offers/1/applications: Status ${apiRes.status}`)
      console.log(`HTTP Response time: ${httpDuration.toFixed(2)} ms`)
      console.log(`HTTP Applications count: ${apiData.length}`)
    } else {
      console.log('\nHTTP server returned:', loginRes.status, await loginRes.text())
    }
  } catch (_err: unknown) {
    console.log('\nNota: El servidor HTTP no respondió en http://localhost:3000.')
  }

  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
