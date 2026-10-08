import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { describe, expect, it } from 'vitest'
import { CreateOfferDto } from './create-offer.dto'

describe('CreateOfferDto', () => {
  it('passes validation with valid data', async () => {
    const dto = plainToInstance(CreateOfferDto, {
      companyId: 1,
      title: 'Desarrollador Fullstack',
      description: 'Prácticas preprofesionales en desarrollo web',
      modality: 'HIBRIDO',
      seats: 2,
      requiredHours: 240,
      periodStart: '2027-01-01',
      periodEnd: '2027-06-30',
    })

    const errors = await validate(dto)
    expect(errors.length).toBe(0)
  })

  it('fails validation when required fields are invalid or missing', async () => {
    const dto = plainToInstance(CreateOfferDto, {
      companyId: 'invalid',
      seats: 0,
      requiredHours: 0,
    })

    const errors = await validate(dto)
    expect(errors.length).toBeGreaterThan(0)
  })
})
