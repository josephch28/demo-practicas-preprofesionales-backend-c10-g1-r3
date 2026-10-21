import { describe, expect, it } from 'vitest'
import { calculateAccreditationStatus, type AccreditationInput } from './accreditation'

/**
 * E5-01 · Tests de caracterización de `calculateAccreditationStatus`.
 *
 * Esta función fue marcada por el linter como D-05 en `KNOWN_ISSUES.md`:
 * complejidad ciclomática 17, complejidad cognitiva 84. Decide si un
 * estudiante se titula a tiempo, así que nadie quería tocarla sin red.
 *
 * Estos tests CONGELAN el comportamiento actual, bueno o malo. No proponen
 * cambios: si una regla parece incorrecta (p. ej. la razón redundante
 * "informe final entregado pese a evaluación baja" cuando la rama ya
 * exige `hasFinalReport`), queda documentada aquí y abre una tarea aparte.
 *
 * Cada rama de decisión del árbol tiene al menos un test; los cuatro
 * niveles de resultado están cubiertos. La tabla con todas las entradas
 * y resultados esperados vive en el cuerpo del PR.
 */

const base: AccreditationInput = {
  placementId: 1,
  studentName: 'Estudiante 0',
  requiredHours: 240,
  approvedHours: 240,
  pendingHours: 0,
  hasAgreement: true,
  hasInsurance: true,
  hasFinalReport: true,
  tutorEvaluationScore: 4.5,
  companyEvaluationScore: 4.2,
  placementStatus: 'COMPLETED',
}

describe('calculateAccreditationStatus — camino feliz: ACREDITADO', () => {
  it('acredita un placement con horas, documentos y evaluaciones completas', () => {
    const result = calculateAccreditationStatus(base)

    expect(result.level).toBe('ACREDITADO')
    expect(result.reasons).toHaveLength(0)
    expect(result.inconsistencies).toHaveLength(0)
    expect(result.completionPercentage).toBe(100)
  })
})

describe('calculateAccreditationStatus — ACREDITADO_CON_OBSERVACIONES', () => {
  it('con observaciones cuando falta la evaluación de la empresa (null)', () => {
    const result = calculateAccreditationStatus({ ...base, companyEvaluationScore: null })

    expect(result.level).toBe('ACREDITADO_CON_OBSERVACIONES')
    expect(result.reasons).toEqual(['falta evaluación de la empresa o es baja'])
  })

  it('con observaciones cuando la evaluación de la empresa es baja (< 3)', () => {
    const result = calculateAccreditationStatus({ ...base, companyEvaluationScore: 2.5 })

    expect(result.level).toBe('ACREDITADO_CON_OBSERVACIONES')
    expect(result.reasons).toEqual(['falta evaluación de la empresa o es baja'])
  })
})

describe('calculateAccreditationStatus — NO_ACREDITADO por evaluaciones', () => {
  it('rechaza cuando la evaluación del tutor es baja (< 3)', () => {
    // E5-02 / G1-55: Se eliminó el chequeo redundante `if (input.hasFinalReport)` y la razón
    // "informe final entregado pese a evaluación baja", ya que input.hasFinalReport siempre
    // era true en esta rama y la información ya se deduce del resultado.
    const result = calculateAccreditationStatus({ ...base, tutorEvaluationScore: 2.9 })

    expect(result.level).toBe('NO_ACREDITADO')
    expect(result.reasons).toEqual(['evaluación del tutor por debajo del mínimo'])
  })
})

describe('calculateAccreditationStatus — PENDIENTE por documentos o evaluaciones faltantes', () => {
  it('pendiente cuando falta la evaluación del tutor (null)', () => {
    const result = calculateAccreditationStatus({ ...base, tutorEvaluationScore: null })

    expect(result.level).toBe('PENDIENTE')
    expect(result.reasons).toEqual(['falta evaluación del tutor'])
  })

  it('pendiente cuando falta el informe final', () => {
    const result = calculateAccreditationStatus({ ...base, hasFinalReport: false })

    expect(result.level).toBe('PENDIENTE')
    expect(result.reasons).toEqual(['falta informe final'])
  })
})

describe('calculateAccreditationStatus — NO_ACREDITADO por seguro', () => {
  it('rechaza cuando falta el seguro, sin horas pendientes', () => {
    const result = calculateAccreditationStatus({ ...base, hasInsurance: false })

    expect(result.level).toBe('NO_ACREDITADO')
    expect(result.reasons).toEqual(['falta seguro'])
  })

  it('rechaza cuando falta el seguro y hay horas pendientes de aprobación', () => {
    const result = calculateAccreditationStatus({ ...base, hasInsurance: false, pendingHours: 10 })

    expect(result.level).toBe('NO_ACREDITADO')
    expect(result.reasons).toEqual([
      'falta seguro',
      'hay 10 horas pendientes de aprobación',
    ])
  })
})

describe('calculateAccreditationStatus — NO_ACREDITADO por convenio', () => {
  // E5-03 (opción b): la contradicción ya no va al acta, se reporta aparte.
  it('rechaza cuando falta el convenio; el seguro vigente se reporta como inconsistencia, no como razón', () => {
    const result = calculateAccreditationStatus({ ...base, hasAgreement: false })

    expect(result.level).toBe('NO_ACREDITADO')
    expect(result.reasons).toEqual(['falta convenio'])
    expect(result.inconsistencies).toEqual(['seguro vigente pese a la falta de convenio'])
  })

  it('rechaza cuando falta el convenio y tampoco hay seguro (sin inconsistencias)', () => {
    const result = calculateAccreditationStatus({ ...base, hasAgreement: false, hasInsurance: false })

    expect(result.level).toBe('NO_ACREDITADO')
    expect(result.reasons).toEqual(['falta convenio'])
    expect(result.inconsistencies).toEqual([])
  })
})

describe('calculateAccreditationStatus — PENDIENTE por horas insuficientes', () => {
  it('pendiente cuando faltan horas aprobadas (ya existía como test base)', () => {
    const result = calculateAccreditationStatus({
      ...base, approvedHours: 120, pendingHours: 40, placementStatus: 'ACTIVE',
    })

    expect(result.level).toBe('PENDIENTE')
    expect(result.reasons).toContain('horas insuficientes')
    expect(result.completionPercentage).toBe(50)
  })

  it('pendiente por horas insuficientes sin horas pendientes (solo razón única)', () => {
    const result = calculateAccreditationStatus({
      ...base, approvedHours: 120, pendingHours: 0, placementStatus: 'ACTIVE',
    })

    expect(result.level).toBe('PENDIENTE')
    expect(result.reasons).toEqual(['horas insuficientes'])
    expect(result.completionPercentage).toBe(50)
  })
})

describe('calculateAccreditationStatus — NO_ACREDITADO por placement ABANDONED', () => {
  it('rechaza un placement abandonado sin horas pendientes', () => {
    const result = calculateAccreditationStatus({ ...base, placementStatus: 'ABANDONED' })

    expect(result.level).toBe('NO_ACREDITADO')
    expect(result.reasons).toEqual(['placement abandonado'])
  })

  it('rechaza un placement abandonado y agrega razón si quedaron horas sin revisar', () => {
    const result = calculateAccreditationStatus({
      ...base, placementStatus: 'ABANDONED', pendingHours: 15,
    })

    expect(result.level).toBe('NO_ACREDITADO')
    expect(result.reasons).toEqual([
      'placement abandonado',
      'hay 15 horas pendientes sin revisar',
    ])
  })
})

describe('calculateAccreditationStatus — NO_ACREDITADO por placement SUSPENDED', () => {
  // E5-03 (opción b): la contradicción ya no va al acta, se reporta aparte.
  it('rechaza un placement suspendido; el convenio vigente se reporta como inconsistencia, no como razón', () => {
    const result = calculateAccreditationStatus({ ...base, placementStatus: 'SUSPENDED' })

    expect(result.level).toBe('NO_ACREDITADO')
    expect(result.reasons).toEqual(['placement suspendido'])
    expect(result.inconsistencies).toEqual(['convenio vigente pese a la suspensión'])
  })

  it('rechaza un placement suspendido sin convenio (sin inconsistencias)', () => {
    const result = calculateAccreditationStatus({
      ...base, placementStatus: 'SUSPENDED', hasAgreement: false,
    })

    expect(result.level).toBe('NO_ACREDITADO')
    expect(result.reasons).toEqual(['placement suspendido'])
    expect(result.inconsistencies).toEqual([])
  })
})

describe('calculateAccreditationStatus — porcentaje de avance', () => {
  it('calcula el porcentaje de avance como ratio redondeado', () => {
    const result = calculateAccreditationStatus({
      ...base, approvedHours: 180, placementStatus: 'ACTIVE',
    })

    expect(result.completionPercentage).toBe(75)
  })

  it('devuelve 0 cuando no hay horas aprobadas', () => {
    const result = calculateAccreditationStatus({
      ...base, approvedHours: 0, placementStatus: 'ACTIVE',
    })

    expect(result.completionPercentage).toBe(0)
  })

  it('puede devolver más de 100 si el estudiante acumuló por encima del requerido (no se tope)', () => {
    // Observación: la función no acota el porcentaje a 100. Es parte del
    // comportamiento actual y lo congelamos como viene.
    const result = calculateAccreditationStatus({ ...base, approvedHours: 300 })

    expect(result.completionPercentage).toBe(125)
    expect(result.level).toBe('ACREDITADO')
  })
})
