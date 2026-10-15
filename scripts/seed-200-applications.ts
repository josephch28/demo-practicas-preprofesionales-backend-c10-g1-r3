import 'dotenv/config'
import { PrismaClient, Role, ApplicationStatus } from '@prisma/client'
import * as bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const offer = await prisma.offer.findFirst({
    include: { company: true },
  })

  if (!offer) {
    throw new Error('No offer found')
  }

  console.log(`Using offer id=${offer.id}, companyId=${offer.companyId}, title="${offer.title}"`)

  // Count existing applications for this offer
  const existingApplications = await prisma.application.findMany({
    where: { offerId: offer.id },
  })
  console.log(`Current applications on offer ${offer.id}: ${existingApplications.length}`)

  const needed = 200 - existingApplications.length
  if (needed > 0) {
    console.log(`Creating ${needed} additional students and applications for offer ${offer.id}...`)
    const password = await bcrypt.hash('yura1234', 10)

    for (let i = 0; i < needed; i++) {
      const studentEmail = `benchmark_student_${Date.now()}_${i}@miyura.com`
      const student = await prisma.user.create({
        data: {
          email: studentEmail,
          password,
          fullName: `Estudiante Benchmark ${i + 1}`,
          role: Role.STUDENT,
        },
      })

      await prisma.application.create({
        data: {
          offerId: offer.id,
          studentId: student.id,
          status: ApplicationStatus.SUBMITTED,
          motivation: `Postulación benchmark ${i + 1}`,
          submittedAt: new Date(),
        },
      })
    }
  }

  const finalCount = await prisma.application.count({
    where: { offerId: offer.id },
  })
  console.log(`Total applications on offer ${offer.id}: ${finalCount}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
