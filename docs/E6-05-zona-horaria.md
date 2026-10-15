# E6-05 · Guardar las fechas de la práctica sin desfase de zona horaria

**Épica:** E6 — Calidad del libro de horas
**Sprint:** 3

> Nota técnica pedida por la historia: "Decide y documenta si la fecha es
> 'día calendario' o 'instante'. No es lo mismo y mezclarlo es lo que
> produce estos errores." Este documento es esa decisión.

## 1 · El problema

`HourLog.create()` guardaba `dto.date` —el valor que mandó el dispositivo—
tal cual, sin normalizar. Dos fuentes de desfase, mezcladas:

1. **Zona horaria del dispositivo.** Un estudiante que registra sus horas
   después de las 7pm en Ecuador (UTC-5) ya está, en UTC, en el día
   siguiente. Guardar el instante crudo pone el registro un día adelante.
2. **Reloj del dispositivo mal puesto.** Un teléfono con la fecha u hora
   incorrecta produce el mismo síntoma por una razón distinta, pero la
   solución es la misma: no confiar en la noción de "qué día es" que trae
   el dispositivo.

Tampoco se validaba que la fecha cayera dentro del periodo de la práctica,
ni que no fuera futura.

## 2 · Decisión: `HourLog.date` es un día calendario, no un instante

A quien registra horas no le importa el instante exacto en UTC en el que
tocó "guardar" — le importa en qué día de la semana cayó la jornada. Por
eso `date` se trata como **día calendario**, siempre.

La pregunta entonces es: ¿calendario de quién? No puede ser el del
dispositivo (no es confiable, es justamente la causa del bug) ni el del
servidor (podría estar desplegado en cualquier región). Tiene que ser el
**de la institución** — configurable con `HOUR_LOG_TIME_ZONE` en `.env`
(por defecto `America/Guayaquil`, UTC-5, sin horario de verano).

### Cómo se normaliza

`src/hour-log/timezone.ts` expone dos funciones que **no se deben
confundir** — de hecho, confundirlas es el bug que casi introduzco yo
mismo mientras escribía esto (ver el test
`truncateToUtcDay > no mueve un día calendario a otro día...` en
`timezone.spec.ts`):

- **`toInstitutionCalendarDay(instant)`** — para instantes reales: el
  momento en que el dispositivo registró la hora (`dto.date`, o `new
  Date()` para "hoy"). Usa `Intl.DateTimeFormat` con `timeZone` para
  preguntar "¿qué día calendario es este instante, visto desde
  Guayaquil?", y ancla la respuesta a medianoche UTC de ese día.
- **`truncateToUtcDay(date)`** — para fechas que YA son un día calendario
  por construcción, como `Placement.startDate`/`endDate` (un coordinador
  escribió "la práctica empieza el 16 de septiembre"; eso no es un
  instante real en ninguna zona horaria, es una etiqueta de día). Esta
  función solo trunca la hora en UTC, **nunca reinterpreta vía zona
  horaria** — si se le aplicara `toInstitutionCalendarDay`, una fecha
  guardada como medianoche UTC "retrocedería" un día en zonas con offset
  negativo, sin que eso tenga relación con ninguna zona horaria real.

`HourLogService.create()` ahora:
1. Convierte `dto.date` a día calendario institucional con
   `toInstitutionCalendarDay`.
2. Rechaza si ese día es posterior al día de hoy (`institutionToday()`).
3. Trunca `placement.startDate`/`endDate` con `truncateToUtcDay` y rechaza
   si el día normalizado cae fuera de ese rango, con un mensaje que dice el
   rango exacto (`"la fecha debe estar entre YYYY-MM-DD y YYYY-MM-DD"`).
4. Persiste el día normalizado, no el instante crudo.

## 3 · Migración de datos existentes: no se hace, y es la decisión correcta

El criterio de aceptación dice: *"si hace falta migrarlos, la migración es
explícita y reversible"*. La decisión de este PR es que **no hace falta
migrarlos**, y punto:

- El cambio solo toca `HourLogService.create()` — un registro ya guardado
  en la base no pasa de nuevo por este código, así que no cambia de valor
  solo por desplegar. El criterio *"los registros existentes no cambian de
  día al desplegar"* se cumple por construcción, no por una migración.
- Intentar "corregir" retroactivamente el día de los registros viejos
  sería peor: no hay forma de saber, para un registro ya guardado, en qué
  zona horaria estaba el dispositivo que lo creó. Cualquier migración
  tendría que *adivinar*, y adivinar mal movería horas ya aprobadas a un
  día distinto del que el estudiante y su tutor ya revisaron — el problema
  exacto que esta historia busca evitar, pero aplicado a datos que ya
  importan.
- No hay cambio de schema (`HourLog.date` sigue siendo `DateTime`), así que
  no hay migración de Prisma que escribir ni revertir.

## 4 · Qué no cubre este PR

- No se tocó `listForPlacement`, `progressReport` ni ningún reporte que lea
  `date` — siguen leyendo el valor tal como está guardado, y con registros
  nuevos ya normalizados no deberían necesitar cambios. Si algún reporte
  agrupa por día y mezcla registros viejos (sin normalizar) con nuevos
  (normalizados), podría mostrar un salto para practicas que cruzan la
  fecha de despliegue — es un costo aceptado de no migrar, documentado
  aquí para que el equipo lo sepa si aparece.