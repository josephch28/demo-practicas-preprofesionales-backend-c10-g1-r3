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

export interface AccreditationDecision {
  level: AccreditationLevel
  reasons: string[]
}

export interface AccreditationRule {
  readonly id: string
  readonly description: string
  readonly applies: (input: AccreditationInput) => boolean
  readonly evaluate: (input: AccreditationInput) => AccreditationDecision
}

/**
 * Tabla de reglas de decisión para acreditación (G1-31 / E5-04).
 *
 * Modelo: Reglas como datos (Decision Table).
 * Cada regla está totalmente desacoplada y se evalúa en estricto orden de precedencia.
 * Para agregar una nueva normativa de coordinación, basta con agregar una nueva regla
 * en este arreglo sin tener que tocar ni anidar lógica en las reglas existentes.
 */
export const ACCREDITATION_RULES: readonly AccreditationRule[] = [
  {
    id: 'R01_PLACEMENT_ABANDONADO',
    description: 'Placement abandonado: no se acredita y se reportan horas pendientes si las hubiera',
    applies: (input) => input.placementStatus === 'ABANDONED',
    evaluate: (input) => ({
      level: 'NO_ACREDITADO',
      reasons: [
        'placement abandonado',
        ...(input.pendingHours > 0 ? [`hay ${input.pendingHours} horas pendientes sin revisar`] : []),
      ],
    }),
  },
  {
    id: 'R02_PLACEMENT_SUSPENDIDO',
    description: 'Placement suspendido: no se acredita',
    applies: (input) => input.placementStatus === 'SUSPENDED',
    evaluate: () => ({
      level: 'NO_ACREDITADO',
      reasons: ['placement suspendido'],
    }),
  },
  {
    id: 'R03_HORAS_INSUFICIENTES',
    description: 'Horas aprobadas menores a las requeridas: estado pendiente',
    applies: (input) => input.approvedHours < input.requiredHours,
    evaluate: (input) => ({
      level: 'PENDIENTE',
      reasons: [
        'horas insuficientes',
        ...(input.pendingHours > 0 ? [`hay ${input.pendingHours} horas pendientes de aprobación`] : []),
      ],
    }),
  },
  {
    id: 'R04_CONVENIO_OBLIGATORIO',
    description: 'Falta de convenio de prácticas: no se acredita',
    applies: (input) => !input.hasAgreement,
    evaluate: () => ({
      level: 'NO_ACREDITADO',
      reasons: ['falta convenio'],
    }),
  },
  {
    id: 'R05_SEGURO_OBLIGATORIO',
    description: 'Falta de seguro estudiantil: no se acredita',
    applies: (input) => !input.hasInsurance,
    evaluate: (input) => ({
      level: 'NO_ACREDITADO',
      reasons: [
        'falta seguro',
        ...(input.pendingHours > 0 ? [`hay ${input.pendingHours} horas pendientes de aprobación`] : []),
      ],
    }),
  },
  {
    id: 'R06_INFORME_FINAL_OBLIGATORIO',
    description: 'Falta de entrega de informe final: estado pendiente',
    applies: (input) => !input.hasFinalReport,
    evaluate: () => ({
      level: 'PENDIENTE',
      reasons: ['falta informe final'],
    }),
  },
  {
    id: 'R07_EVALUACION_TUTOR_PENDIENTE',
    description: 'Falta evaluación del tutor académico: estado pendiente',
    applies: (input) => input.tutorEvaluationScore === null,
    evaluate: () => ({
      level: 'PENDIENTE',
      reasons: ['falta evaluación del tutor'],
    }),
  },
  {
    id: 'R08_EVALUACION_TUTOR_INSUFICIENTE',
    description: 'Evaluación del tutor académico por debajo del mínimo (3.0): no se acredita',
    applies: (input) => (input.tutorEvaluationScore as number) < 3,
    evaluate: () => ({
      level: 'NO_ACREDITADO',
      reasons: ['evaluación del tutor por debajo del mínimo'],
    }),
  },
  {
    id: 'R09_EVALUACION_EMPRESA_OBSERVADA',
    description: 'Falta evaluación de la empresa o es baja (< 3.0): acredita con observaciones',
    applies: (input) => input.companyEvaluationScore === null || input.companyEvaluationScore < 3,
    evaluate: () => ({
      level: 'ACREDITADO_CON_OBSERVACIONES',
      reasons: ['falta evaluación de la empresa o es baja'],
    }),
  },
]

/**
 * Detecta contradicciones administrativas entre documentos y estado del placement.
 * E5-03: No se imprimen en el acta oficial, pero se reportan para auditoría de coordinación.
 */
export function detectInconsistencies(input: AccreditationInput): string[] {
  const inconsistencies: string[] = []

  if (input.placementStatus === 'SUSPENDED' && input.hasAgreement) {
    inconsistencies.push('convenio vigente pese a la suspensión')
  }

  const isEligibleForReview = input.placementStatus !== 'ABANDONED' && input.placementStatus !== 'SUSPENDED'
  if (isEligibleForReview && input.approvedHours >= input.requiredHours && !input.hasAgreement && input.hasInsurance) {
    inconsistencies.push('seguro vigente pese a la falta de convenio')
  }

  return inconsistencies
}

/**
 * Evalúa las reglas de acreditación y determina el resultado oficial del estudiante.
 */
export function calculateAccreditationStatus(input: AccreditationInput): AccreditationResult {
  const percentage = Math.min(100, Math.round((input.approvedHours / input.requiredHours) * 100))
  const inconsistencies = detectInconsistencies(input)

  for (const rule of ACCREDITATION_RULES) {
    if (rule.applies(input)) {
      const decision = rule.evaluate(input)
      return {
        placementId: input.placementId,
        studentName: input.studentName,
        level: decision.level,
        reasons: decision.reasons,
        inconsistencies,
        completionPercentage: percentage,
      }
    }
  }

  return {
    placementId: input.placementId,
    studentName: input.studentName,
    level: 'ACREDITADO',
    reasons: [],
    inconsistencies,
    completionPercentage: percentage,
  }
}
