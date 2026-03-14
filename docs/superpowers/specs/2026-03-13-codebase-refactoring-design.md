# Nametag Codebase Refactoring Design

## Context

Nametag has grown organically through 11+ development stages. The foundations are solid — zero `any` types, consistent auth/error handling via `withAuth` + `handleApiError`, centralized Zod validation, and good API test coverage. However, several areas have accumulated duplication and complexity that make maintenance and feature work harder than necessary.

**Key pain points:**
- Adding a new Person field requires touching too many files with near-identical changes
- Prisma has a soft-delete extension for top-level queries, but nested includes on soft-deletable relations still require manual `deletedAt: null` filtering — and the deep include trees (graph routes, relationship queries) are duplicated across routes with no shared builders
- PersonForm.tsx is 1,212 lines with 18 `useState` hooks
- Six field manager components share ~70% identical code
- Seven API routes exceed 350 lines of mixed HTTP and domain logic
- vCard transformation logic is duplicated across 3 files
- OpenAPI spec is a 2,596-line monolith
- Only 21% of components have tests

## Approach: Layered Refactoring (Bottom-Up)

Refactoring is organized into three tiers. Tier 1 builds abstractions. Tier 2 uses them to simplify existing code. Tier 3 handles independent polish. High-impact, low-risk items in Tier 1 are batched for a focused effort. Larger extractions in Tier 2 are done incrementally.

---

## Tier 1 — Foundation (high impact, low risk)

### 1. Prisma Query Helpers

**New file:** `lib/prisma/queries.ts`

**Note:** The codebase already has a Prisma client extension (`lib/prisma.ts`, lines 31-88) that auto-injects `deletedAt: null` for all top-level queries (`findMany`, `findFirst`, `findUnique`, `count`, `aggregate`, `groupBy`) on soft-deletable models. The real pain point is **nested includes** — the extension does not cover `where` clauses inside `include` blocks, which is where the deep duplication lives (graph routes nest soft-delete filters 9+ levels deep). Additionally, `withDeleted()` (`lib/prisma.ts`, line 110) returns a raw client for restore/trash operations — the new query helpers must not be used for those operations.

**1a. Ownership-scoped where helpers:**
```typescript
personWhere(id: string, userId: string) → { id, userId }
// Top-level deletedAt filtering is handled by the Prisma extension.
// These helpers standardize ownership checks that repeat across routes.
```

**1b. Composable include builders — the primary value of this module:**
```typescript
findPersonById(id, userId)              // basic person
findPersonWithDetails(id, userId)       // + phones, emails, addresses, dates, groups (with nested soft-delete filters)
findPersonWithRelationships(id, userId) // + relationships with related persons (with nested soft-delete filters)
findPersonForGraph(id, userId)          // full nested graph include (encapsulates the 100+ line include trees)
```

These encapsulate the deep nested include structures with correct soft-delete filtering at every level, eliminating the duplicated 100+ line include blocks in graph routes and person detail queries.

**1c. List/search helpers:**
```typescript
findPeopleByUser(userId, options?: { search?, groupId?, sort?, includeDetails? })
countPeopleByUser(userId)
```

These are thin wrappers that standardize `where` and `include` patterns while returning Prisma types. Routes needing custom queries still use Prisma directly.

**Tests:** Unit tests verifying correct where/include clause construction, especially nested soft-delete filtering.

### 2. Person Service Layer

**New file:** `lib/services/person.ts`

**2a. Create/Update with unified input shape:**
```typescript
createPerson(userId: string, data: PersonInput): Promise<Person>
updatePerson(id: string, userId: string, data: Partial<PersonInput>): Promise<Person>
```

`PersonInput` matches the Zod validation output shape (e.g., `phoneNumbers` as an array of `{value, type, isPrimary}`). The service is responsible for transforming this into Prisma's `create`/`connectOrCreate` nested write format. This keeps the route layer thin (it just passes `validation.data` to the service) and centralizes the Prisma mapping in one place. The service handles:
- Sanitization (name, surname, etc.)
- Nested object creation/update (phones, emails, addresses, URLs, IMs, locations, custom fields, important dates)
- Group assignments
- Auto-export to CardDAV (background, non-blocking)

**2b. Other person operations:**
```typescript
deletePerson(id: string, userId: string): Promise<void>       // soft-delete + cascades
restorePerson(id: string, userId: string): Promise<Person>
mergePeople(targetId, sourceId, userId, overrides): Promise<Person>
```

**2c. Impact on routes:**
`POST /api/people` shrinks from 385 lines to ~30 lines of HTTP handling (parse, validate, billing check, call service, return response). Same pattern for PUT, DELETE, merge.

**Tests:** Unit tests for create/update/merge with mocked Prisma.

### 3. Generic Field Manager Component

**New files:** `components/fields/FieldManager.tsx`, `lib/field-configs.ts`

**3a. Core component — configured via props:**
```typescript
<FieldManager<PhoneNumber>
  items={phoneNumbers}
  onChange={setPhoneNumbers}
  fieldConfig={phoneFieldConfig}
  labels={{ add: t('addPhone'), empty: t('noPhones') }}
/>
```

**3b. Field configs define each field type's shape:**
```typescript
const phoneFieldConfig: FieldConfig<PhoneNumber> = {
  typeOptions: ['mobile', 'home', 'work', 'other'],
  defaultType: 'mobile',
  fields: [
    { key: 'value', type: 'tel', placeholder: 'Phone number', required: true },
  ],
  emptyItem: () => ({ value: '', type: 'mobile', isPrimary: false }),
};
```

**3c. What gets replaced:**

| Component (current) | Lines | Replacement |
|---------------------|-------|-------------|
| `PersonPhoneManager.tsx` | 240 | `phoneFieldConfig` (~15 lines) |
| `PersonEmailManager.tsx` | 238 | `emailFieldConfig` (~15 lines) |
| `PersonAddressManager.tsx` | 304 | `addressFieldConfig` (~25 lines) |
| `PersonUrlManager.tsx` | 258 | `urlFieldConfig` (~15 lines) |
| `PersonLocationManager.tsx` | 321 | `locationFieldConfig` (~20 lines) |
| `PersonCustomFieldManager.tsx` | 296 | `customFieldConfig` (~20 lines) |

~1,650 lines → ~350 lines (FieldManager) + ~110 lines (configs). One place to fix bugs or add features.

**3d. Consumption:** PersonForm uses 4 of these managers (Phone, Email, Address, URL). PersonLocationManager and PersonCustomFieldManager are currently unused — they were built but never integrated. As part of this refactoring, they will be replaced by their FieldManager configs and wired into PersonForm's MultiValueSection, giving users access to location and custom field editing that was previously missing from the form.

**3e. ImportantDatesManager is intentionally excluded.** It has a fundamentally different shape (date pickers + reminder toggles + recurring event logic) that doesn't fit the "list of typed items with inline editing" pattern. It stays as its own component wrapped by DatesSection.

**3f. Edge cases:**
- Address: multi-field layout (street, city, state, zip, country) — config supports multiple fields
- Location: lat/lon with map picker — config supports a `renderField` slot per field config entry: `renderField?: (item: T, onChange: (item: T) => void) => ReactNode`. This is scoped to individual fields, not the entire item layout, to prevent the abstraction from bloating.
- CustomField: freeform key — `keyEditable: true` flag in config

**3g. Existing test migration:** Four field managers already have tests (`PersonPhoneManager.test.tsx`, `PersonEmailManager.test.tsx`, `PersonAddressManager.test.tsx`, `PersonUrlManager.test.tsx`). These test files will be migrated to test the same behavior through FieldManager + their respective configs. The behavioral expectations from the existing tests must be preserved — they encode real interaction patterns.

**Tests:** Component tests for add/edit/delete/reorder interactions, incorporating expectations from migrated tests.

---

## Tier 2 — Extraction (high impact, medium risk)

### 4. PersonForm Decomposition

**New directory:** `components/person-form/`

**4a. Section components:**
```
PersonForm.tsx          (~200-250 lines) — orchestrator, form state, submit handler, API payload construction
NameSection.tsx         (~80 lines)  — name, surname, nickname, second lastname
PhotoSection.tsx        (~100 lines) — photo upload, crop, preview
BasicInfoSection.tsx    (~60 lines)  — organization, title, notes
DatesSection.tsx        (~40 lines)  — wraps ImportantDatesManager
GroupsSection.tsx       (~40 lines)  — group assignment checkboxes
RelationshipsSection.tsx(~40 lines)  — wraps RelationshipManager
MultiValueSection.tsx   (~60 lines)  — renders FieldManager for all multi-value fields
```

**4b. State management — `useReducer` replacing 18 `useState` calls:**
```typescript
// hooks/usePersonForm.ts
const [state, dispatch] = useReducer(personFormReducer, initialState);
```

One custom hook owns all form state. The hook exposes scoped setter callbacks (e.g., `setName(value)`, `setPhones(items)`) rather than raw `dispatch` — this way section components don't need to know action type names. The `dispatch` and reducer remain internal to the hook.

**4c. Migration path:**
Extract one section at a time, starting with MultiValueSection (uses the new FieldManager). Each extraction is a self-contained PR that doesn't change behavior.

**Tests:** Component tests for each section.

### 5. API Route Slimming

Using the person service layer and query helpers, routes become thin HTTP handlers.

| Route | Current | After | What moves out |
|-------|---------|-------|----------------|
| `POST /api/people` | 385 lines | ~30 lines | Nested creation → `personService.create()` |
| `PUT /api/people/[id]` | 464 lines | ~35 lines | Update mapping → `personService.update()` |
| `POST /api/people/merge` | 469 lines | ~40 lines | Merge logic → `personService.merge()` |
| `POST /api/carddav/import` | 397 lines | ~50 lines | Import loop → `carddavService.importContacts()` |
| `GET /api/cron/send-reminders` | 484 lines | ~30 lines | Reminder logic → `lib/services/reminders.ts` |
| `POST /api/user/import` | 360 lines | ~40 lines | Import parsing/validation → `lib/services/import.ts` |

Graph routes (`/api/dashboard/graph`, `/api/people/[id]/graph`) deduplicate their 100+ line include blocks by using `findPersonForGraph()` from the query helpers.

**Explicitly excluded:** `/api/webhooks/stripe` (365 lines) — its shape is dictated by Stripe's webhook format and doesn't benefit from the person service abstraction. Routes under ~100 lines also stay as-is.

### 6. vCard Consolidation

CardDAV is mostly stable, so this is a conservative cleanup of duplication.

**6a. Two files with one responsibility each:**
```
lib/carddav/vcard-export.ts  — Person → vCard string
lib/carddav/vcard-import.ts  — vCard string → PersonInput
```

Absorbs `lib/vcard.ts`, `lib/carddav/person-from-vcard.ts`, and `lib/vcard-helpers.ts`.

**6b. Shared field mapping table:**
```typescript
// lib/carddav/vcard-field-map.ts (~50 lines)
const FIELD_MAP = [
  { vcard: 'TEL', person: 'phoneNumbers', transform: { toVCard: ..., fromVCard: ... } },
  { vcard: 'EMAIL', person: 'emails', transform: { toVCard: ..., fromVCard: ... } },
  // ...
];
```

Adding a new field means one entry in the field map instead of changes in multiple files.

**6c. What stays untouched:**
- `lib/carddav/vcard-parser.ts` (798 lines) — raw parser, different concern
- `lib/carddav/sync.ts` — calls new import/export files instead of old ones

Net: 3 files (~970 lines with overlap) → 3 files (~700 lines, no overlap) + shared field map.

**Import path updates:** `lib/carddav/sync.ts` and other CardDAV files currently import from the old locations. All import paths must be updated as part of this work.

---

## Tier 3 — Polish (medium impact, low risk)

### 7. OpenAPI Spec Splitting

**New directory:** `lib/openapi/`

**7a. Domain modules:**
```
lib/openapi/
  index.ts       (~80 lines)  — composes all sections, exports generateOpenAPISpec()
  schemas.ts     (~200 lines) — shared schema definitions
  people.ts      (~500 lines) — /api/people/* paths
  groups.ts      (~200 lines) — /api/groups/* paths
  relationships.ts(~200 lines)— /api/relationships/* paths
  auth.ts        (~200 lines) — /api/auth/* paths
  carddav.ts     (~300 lines) — /api/carddav/* paths
  billing.ts     (~200 lines) — /api/billing/* paths
  user.ts        (~200 lines) — /api/user/* paths
  dashboard.ts   (~100 lines) — /api/dashboard/* paths
```

**7b. Each module exports a paths object:**
```typescript
export function peoplePaths(): Record<string, PathItem> {
  return {
    '/api/people': { post: { ... }, get: { ... } },
    '/api/people/{id}': { get: { ... }, put: { ... }, delete: { ... } },
  };
}
```

**7c. Composer merges them:**
```typescript
export function generateOpenAPISpec() {
  return {
    openapi: '3.0.0',
    info: { ... },
    paths: { ...peoplePaths(), ...groupsPaths(), ...relationshipsPaths(), ... },
    components: { schemas: sharedSchemas() },
  };
}
```

Existing test (`tests/api/openapi-spec.test.ts`) stays unchanged — it calls `generateOpenAPISpec()` and validates the output. This split is purely internal with no behavioral change, so it can be done in a single PR.

### 8. Component Test Coverage

**8a. New abstractions get tests as part of implementation** (Tiers 1-2).

**8b. Critical untested existing components, prioritized by risk:**
1. `GroupForm.tsx` — data entry
2. `PersonActionsMenu.tsx` (516 lines) — many code paths
3. `PersonCompare.tsx` — merge UI
4. `PeopleListClient.tsx` — search/filter/sort/bulk actions
5. Navigation components — routing correctness

**8c. Testing approach:**
- Vitest + React Testing Library (already in place)
- Behavior-focused tests (what the user sees and does)
- Snapshot tests only for layout-sensitive components

**8d. Explicitly skipped:**
- Thin wrapper components that just pass props
- Pure presentational components with no logic
- CardDAV wizard steps (stable, low change frequency)

---

## Dependency Order

```
Tier 1:
  1. Prisma Query Helpers  ──┐ (items 1 and 3 can be done in parallel)
  2. Person Service Layer  ──┤ (depends on #1, starts after query helpers are complete)
  3. Generic Field Manager ──┘ (independent of #1 and #2)

Tier 2 (sequential, depends on Tier 1):
  4. PersonForm Decomposition  (depends on #3 FieldManager)
  5. API Route Slimming        (depends on #1 + #2)
  6. vCard Consolidation       (independent, can parallel with #4/#5)

Tier 3 (independent, any time after Tier 1):
  7. OpenAPI Spec Splitting    (independent)
  8. Component Test Coverage   (ongoing, accelerates after Tier 2)
```

## Out of Scope

- No changes to the database schema or Prisma models
- No changes to authentication architecture (already well-structured)
- No changes to the validation layer (Zod schemas are solid)
- No restructuring of the CardDAV sync engine (stable)
- No new features — this is purely structural improvement
