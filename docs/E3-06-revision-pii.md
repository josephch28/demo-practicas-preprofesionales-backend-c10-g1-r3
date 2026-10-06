# E3-06 · Revisión de datos sensibles en respuestas

**Épica:** E3 — Seguridad y control de acceso
**Sprint:** 2
**Relacionado:** complementa [`E3-01-auditoria-permisos.md`](./E3-01-auditoria-permisos.md) (quién puede llamar a cada endpoint); este documento mira otra cosa — **qué campos de usuario sale efectivamente en cada respuesta**, sin importar quién la pida.

## 1 · Qué se revisó

Se buscaron en todo `src/` las consultas Prisma que tocan el modelo `User` (`prisma.user.findUnique/findMany`, e `include`/`select` de relaciones `student`, `tutor`, `evaluator`, `uploadedBy`, `validatedBy`, `reviewedBy`) y se siguió cada una hasta ver si el resultado llega, directa o indirectamente, a una respuesta HTTP.

`User` tiene un solo campo que nunca debería salir de la base: `password` (el hash bcrypt). `email`, `createdAt` y `companyId` no son secretos, pero tampoco hace falta exponerlos donde no se usan — el criterio de esta historia los trata como "no acotar explícitamente los campos" cuando la consulta no los necesita.

## 2 · Inventario de consultas que tocan `User`

| # | Archivo | Consulta | ¿Llega a una respuesta HTTP? | Campos que expone | Veredicto |
|---|---|---|---|---|---|
| 1 | `src/auth/auth.service.ts` (`login`) | `user.findUnique({ where: { email } })` | Sí — `POST /auth/login` | La consulta trae todo, pero la respuesta arma `{ id, email, fullName, role, companyId }` a mano | OK — ya acotado en la respuesta |
| 2 | `src/application/application.service.ts` (`listByOffer`) | `user.findUnique({ select: { id, email, fullName } })` | Sí — `GET /offers/:offerId/applications` | `id`, `email`, `fullName` | OK — `select` ya explícito |
| 3 | `src/placement/placement.service.ts` (`findForStudent`) | `include: { tutor: { select: { id, fullName, email } } }` | Sí — `GET /placements/me` | `id`, `fullName`, `email` del tutor | OK — `select` ya explícito (con comentario en el código explicando por qué) |
| 4 | `src/placement/accreditation.service.ts` (`reportForPeriod`) | `include: { student: true }` ⚠️ | Indirectamente — `GET /placements/accreditation` | La consulta traía el usuario completo (`password` incluido); la respuesta final solo usa `studentName` porque `calculateAccreditationStatus` arma su propia forma | **Corregido en este PR** — ver §3 |
| 5 | `src/evaluation/evaluation.service.ts` (`assertCompanyEvaluation`) | `user.findUnique({ where: { id } })` ⚠️ | No — el resultado solo se usa para comparar `companyId`, nunca se devuelve | La consulta traía el usuario completo (`password` incluido), aunque nunca salía en una respuesta | **Corregido en este PR** — ver §3 |
| 6 | `src/offer/offer.service.ts` (`findAllForCompanyUser`) | `user.findUnique({ select: { companyId: true } })` | No — solo se usa para filtrar | `companyId` | OK — `select` ya explícito |

No se encontraron otras rutas de código que toquen `User`. `Company` no tiene campos equivalentes a contraseña (ver `prisma/schema.prisma`), así que `GET /companies` y los `include: { company: true }` de ofertas y placements quedan fuera del alcance de esta revisión.

## 3 · Qué cambia este PR

Dos consultas traían el usuario completo (filas #4 y #6 de arriba) cuando solo necesitaban un campo. Ninguna de las dos filtraba `password` hacia una respuesta HTTP **hoy** — en el caso de acreditación porque la función que arma el resultado final construye su propia forma angosta, y en el de evaluaciones porque el valor nunca se devuelve — pero nada en la consulta misma lo impedía. Un cambio futuro y descuidado (por ejemplo, spread de `...placement` en vez de construir el objeto a mano) sí lo filtraría, y nadie lo notaría hasta que alguien mirara la respuesta en DevTools.

- `src/placement/accreditation.service.ts`: `student: true` → `student: { select: { fullName: true } }`.
- `src/evaluation/evaluation.service.ts`: `user.findUnique({ where: { id } })` → agrega `select: { companyId: true }`.

## 4 · Test de regresión

Una revisión manual como esta caduca en el siguiente PR — nadie la vuelve a correr. Por eso además de los cambios de arriba, este PR agrega tests que fallan si alguien revierte el `select`:

- `src/placement/accreditation.service.spec.ts`: un test comprueba la *forma de la consulta* (`toHaveBeenCalledWith(... student: { select: { fullName: true } } ...)`, falla si alguien vuelve a poner `student: true`), y otro comprueba la *forma de la respuesta* (simula que la consulta igual trajera `password`/`email`/`createdAt` y verifica que el resultado de `reportForPeriod` no los contenga).
- `src/evaluation/evaluation.service.spec.ts`: archivo nuevo (el módulo no tenía ningún test — eso sigue siendo deuda D-03, no se cierra aquí) con un único test que comprueba que la consulta del evaluador pide `select: { companyId: true }`.

## 5 · Fuera de alcance

- D-03 (evaluation sin tests) sigue abierta; el test nuevo de este PR es puntual al cambio, no cobertura del módulo.
- Esta revisión no mira la capa de logs (`console.log` en `hour-log.service.ts` notifica con `tutorId`, no con datos de PII) ni la serialización de errores (`http-exception.filter.ts`), que quedan fuera del criterio de aceptación de esta historia.