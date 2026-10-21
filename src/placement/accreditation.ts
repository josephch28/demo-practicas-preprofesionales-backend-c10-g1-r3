export interface AccreditationInput {
  placementId: number
  studentName: string
  requiredHours: number
  approvedHours: number
  pendingHours: number
  hasAgreement: boolean
  hasInsurance: boolean
  hasFinalReport: boolean
  tutorEvaluationScore: number | null
  companyEvaluationScore: number | null
  placementStatus: string
}

export type AccreditationLevel =
  | 'ACREDITADO'
  | 'ACREDITADO_CON_OBSERVACIONES'
  | 'PENDIENTE'
  | 'NO_ACREDITADO'

export interface AccreditationResult {
  placementId: number
  studentName: string
  level: AccreditationLevel
  // Lo que se imprime en el acta: solo razones que explican el nivel.
  reasons: string[]
  // Contradicciones entre documentos y estado del placement. NO van al acta;
  // se consultan en el informe de inconsistencias (ver AccreditationService).
  inconsistencies: string[]
  completionPercentage: number
}

export type EvaluationOutcome = Pick<AccreditationResult, 'level' | 'reasons' | 'inconsistencies'>

export function handleTerminated(
  input: Pick<AccreditationInput, 'placementStatus' | 'pendingHours' | 'hasAgreement'>,
): EvaluationOutcome | null {
  if (input.placementStatus === 'ABANDONED') {
    const reasons = ['placement abandonado']
    if (input.pendingHours > 0) {
      reasons.push(`hay ${input.pendingHours} horas pendientes sin revisar`)
    }
    return {
      level: 'NO_ACREDITADO',
      reasons,
      inconsistencies: [],
    }
  }

  if (input.placementStatus === 'SUSPENDED') {
    return {
      level: 'NO_ACREDITADO',
      reasons: ['placement suspendido'],
      inconsistencies: input.hasAgreement
        ? ['convenio vigente pese a la suspensión']
        : [],
    }
  }

  return null
}

export function evaluatePartialPlacement(
  input: Pick<AccreditationInput, 'pendingHours'>,
): EvaluationOutcome {
  const reasons = ['horas insuficientes']
  if (input.pendingHours > 0) {
    reasons.push(`hay ${input.pendingHours} horas pendientes de aprobación`)
  }

  return {
    level: 'PENDIENTE',
    reasons,
    inconsistencies: [],
  }
}

export function evaluateCompletedPlacement(
  input: Pick<
    AccreditationInput,
    | 'hasAgreement'
    | 'hasInsurance'
    | 'hasFinalReport'
    | 'pendingHours'
    | 'tutorEvaluationScore'
    | 'companyEvaluationScore'
  >,
): EvaluationOutcome {
  if (!input.hasAgreement) {
    return {
      level: 'NO_ACREDITADO',
      reasons: ['falta convenio'],
      inconsistencies: input.hasInsurance
        ? ['seguro vigente pese a la falta de convenio']
        : [],
    }
  }

  if (!input.hasInsurance) {
    const reasons = ['falta seguro']
    if (input.pendingHours > 0) {
      reasons.push(`hay ${input.pendingHours} horas pendientes de aprobación`)
    }
    return {
      level: 'NO_ACREDITADO',
      reasons,
      inconsistencies: [],
    }
  }

  if (!input.hasFinalReport) {
    return {
      level: 'PENDIENTE',
      reasons: ['falta informe final'],
      inconsistencies: [],
    }
  }

  if (input.tutorEvaluationScore === null) {
    return {
      level: 'PENDIENTE',
      reasons: ['falta evaluación del tutor'],
      inconsistencies: [],
    }
  }

  if (input.tutorEvaluationScore < 3) {
    return {
      level: 'NO_ACREDITADO',
      reasons: ['evaluación del tutor por debajo del mínimo'],
      inconsistencies: [],
    }
  }

  if (input.companyEvaluationScore !== null && input.companyEvaluationScore >= 3) {
    return {
      level: 'ACREDITADO',
      reasons: [],
      inconsistencies: [],
    }
  }

  return {
    level: 'ACREDITADO_CON_OBSERVACIONES',
    reasons: ['falta evaluación de la empresa o es baja'],
    inconsistencies: [],
  }
}

// E5-03 · Decisión de la coordinación (opción b): las contradicciones
// "convenio vigente pese a la suspensión" y "seguro vigente pese a la falta de
// convenio" se omiten del acta y se reportan aparte en `inconsistencies`.
//
// E5-05 · Refactorizado para reducir la complejidad ciclomática y cognitiva
// dividiendo la lógica en funciones puras y retornos tempranos.
export function calculateAccreditationStatus(input: AccreditationInput): AccreditationResult {
  const completionPercentage = Math.round((input.approvedHours / input.requiredHours) * 100)
  const baseResult = {
    placementId: input.placementId,
    studentName: input.studentName,
    completionPercentage,
  }

  const terminated = handleTerminated(input)
  if (terminated) {
    return { ...baseResult, ...terminated }
  }

  if (input.approvedHours < input.requiredHours) {
    return { ...baseResult, ...evaluatePartialPlacement(input) }
  }

  return { ...baseResult, ...evaluateCompletedPlacement(input) }
}
