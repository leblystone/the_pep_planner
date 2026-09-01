# PEP Planner – Data Schema (Single Source of Truth)

> **Code is authoritative.** This document describes the current app. It is derived from the codebase. If you find a mismatch between this file and the code (e.g. `cloudStorage.js`, `AppContext.jsx`, components), the code is correct. **Do not change the code or this doc without confirming with the user first;** recommend updating this doc to match the code and ask for approval.

Derived from `src/services/cloudStorage.js`, `src/context/AppContext.jsx`, and components. See [USER_DATA_SAVE_PATTERN.md](USER_DATA_SAVE_PATTERN.md) for save/sync behavior.

---

## Overview

This file is the single source of truth for PEP Planner data: Firestore collections, the main app document keys, and entity shapes. Use it when adding or changing data. All synced user data lives in the main app document (`userData/{userId}`) and is merged with timestamps; see USER_DATA_SAVE_PATTERN.md for the three-step save pattern.

---

## Firestore collections

| Collection | Purpose |
|------------|---------|
| `userData` | Main app data per user (protocols, orders, stockpile, etc.). One doc per `userId`. Written by `cloudStorage.saveAppData` / `loadAppData`. |
| `users` | Auth/profile: email, displayName, createdAt, lastActive, subscription fields, etc. |
| `userSubscriptions` | Stripe/subscription data per user. |
| `userPreferences` | Theme, settings, etc. (optional separate store). |
| `userState` | Onboarding, demo-data flags, reengagement welcome-back state, etc. |
| `userdata` | Legacy encrypted user data (password-derived); may coexist with `userData`. |
| `inviteCodes` | Invite code definitions and usage. |
| `config` | App config (e.g. `emailWhitelist`, `featureFlags`). |
| `announcements` | Admin announcements. |
| `analytics` | Usage/counts (e.g. `usage`, `userCount`, `founderCount`). |
| `feedback` | User feedback submissions. |
| `notifications` | User-facing notifications. |
| `supportTickets` | Support tickets; subcollection `messages` per ticket. |
| `adminMessages` | Admin broadcast messages. |
| `lifetimeAccess` | Per-user lifetime access grants. |
| `lifetimeAccessPreGrants` | Pre-granted lifetime by email. |
| `lifetimeCodes` | Lifetime access codes. |
| `annualCodes` | Annual subscription codes. |
| `user_agreements` | User agreement acceptance records. |

---

## Main app document (userData)

The blob saved per user at `userData/{userId}`. Every key below is in `timestampedData` in `cloudStorage.js` (saveAppData) and is loaded by `loadAppData`. All array items should have `id` and `updatedAt` (use `prepareItemForSave` from `src/utils/userDataSave.js`).

| Key | Type | Description |
|-----|------|-------------|
| `protocols` | array | User's protocols (see Entity: Protocol). |
| `reconItems` | array | Reconstitution calculator items. |
| `reconHistory` | array | Reconstitution history entries. |
| `supplements` | array | Supplement entries. |
| `orders` | array | Orders (see Entity: Order). |
| `metrics` | array | Metrics entries. |
| `vendors` | array | Vendor list (id, name, etc.). |
| `stockpile` | array | Stockpile items (see Entity: Stockpile item). |
| `scheduledBuys` | array | Scheduled buy entries. |
| `protocolHistory` | array | Historical protocol records. |
| `wishlist` | array | Wishlist items. |
| `calendarNotes` | object | Date-keyed calendar notes (see Entity: Calendar note). |
| `userNotes` | array | Free-form user notes. |
| `userGoals` | array | User goals. |
| `waterTracker` | object | Date-keyed water intake (see Entity: WaterTracker). |
| `taskCompletion` | object | Date → timeSlot → taskId → boolean. |
| `calendarDone` | object | Same shape as taskCompletion for calendar tasks. |
| `taskScheduleOverrides` | object | Skip / catch-up / AM-PM move overrides for scheduled doses (see Entity: TaskScheduleOverrides). Synced blob; mirrored locally as three maps. |
| `injectionHistory` | array | Injection records (see Entity: Injection record). |
| `oneOffDoses` | array | Standalone one-off dose logs (see Entity: OneOffDose). No protocol required. |
| `medications` | array | Common medication journal entries (see Entity: Medication). |
| `labResults` | array | Blood/lab value journal entries (see Entity: LabResult). |
| `injectionStats` | object | `{ global: { totalInjections, sites, lastInjection }, tasks: {} }`. |
| `deletionTracking` | object | Tracks deleted item ids per type for merge (e.g. protocols, orders, stockpile). |

Doc also gets `userId`, `lastUpdated` (server timestamp), and `version` when saved.

---



### userState.reengagement

Persisted on `userState/{userId}` (not in `userData` sync blob). Controls the Welcome Back flow after a 30+ day absence.

- **lastGapDate** (string, YYYY-MM-DD) — previous `engagement.lastActiveDate` that triggered the prompt; also the backdate target for protocols/goals.
- **status** (`'pending'` | `'completed'` | `'declined'`) — remind-later leaves pending; decline suppresses for this gap; a new gap date resets.
- **promptedAt** (ISO string)
- **completedAt** (ISO string | null)

### Reconfirm / welcome-back additive fields

- **stockpile[].needsReconfirm** (boolean) — flag after welcome-back refresh; clear via Looks Right or edit.
- **supplements[].needsReconfirm** (boolean)
- **medications[].needsReconfirm** (boolean)
- **scheduledBuys[].needsReconfirm** (boolean)
- **userGoals[].completedDate** (YYYY-MM-DD) — set when a goal is auto-completed on reengagement.
- **protocolHistory[].completionStatus** — includes `'ended_reengagement'` when a protocol is closed by the Welcome Back flow.

## Entity shapes

### Protocol

- **protocolName** (string) – Display name.
- **purpose** (string) – Optional purpose/notes.
- **protocolType** (string) – e.g. `'separate'` \| `'blended'`.
- **peptides** (array) – Each: `id`, `name`, `frequency` (e.g. `{ type: 'daily'|'weekly'|'custom'|'cycle'|'as_needed', time: ['AM'], customReminder: false, reminderTime: null }`; `as_needed` = no auto-scheduled tasks), `unitValue`, etc.
  - **frequency.customReminder** (boolean) – If true, this peptide has its own push notification time.
  - **frequency.reminderTime** (string|null) – HH:mm format, e.g. `'07:30'`. Used when customReminder is true.
- **duration** (object) – `count`, `unit` (e.g. `'weeks'`), `noEnd`.
- **washout** (object) – `enabled`, `duration`, `unit`.
- **notes** (string).
- **active** (boolean) – Whether protocol is currently active.
- **id**, **updatedAt** – Required on every item (sync).

### Order

- **date** (string, ISO or date string).
- **status** (string) – e.g. `'Order Placed'`, `'Shipped'`, `'Delivered'`.
- **category** / **type** (string) – e.g. domestic, groupbuy.
- **vendor** (string or vendor id).
- **tracking** (string) – Tracking number.
- **shipDate**, **deliveryDate** (string, optional).
- **items** (array) – Each: price, quantity, etc.
- **shippingCost** (number).
- **orderNumber** (string, optional, for display).
- **id**, **updatedAt** – Required on every item.

### Stockpile item

- **name** (string) – Peptide/product name.
- **mg** (string/number) – Mg per vial.
- **quantity** (string/number) – Number of vials/units.
- **vendor** (string).
- **cost** (string/number).
- **unit** (string) – e.g. `'vial'`.
- **id**, **updatedAt** – Required on every item.

### Calendar note (per date)

- **calendarNotes** is an object: `{ [dateKey]: { notes: [ ... ] } }`.
- Each **note** in `notes`: `id`, `updatedAt` or `createdAt`, and content fields (e.g. text).

### Injection record

- **id** (string).
- **timestamp** or **date** (number/string) – When the injection occurred.
- Other fields (site, peptide, etc.) as used by injection tracking.



### OneOffDose

Standalone dose log (no protocol required). Synced array `oneOffDoses` / local key `tpprover_one_off_doses`.

- **id**, **updatedAt**, **createdAt**
- **peptideName** (string)
- **dose**, **unit**
- **dateKey** (YYYY-MM-DD), **timeSlot** (`AM`|`PM`)
- **deliveryMethod** (optional), **notes** (optional), **injectionSite** (optional)
- **protocolId** (string|null) — set when user promotes the log to an as-needed protocol

### TaskCompletion / calendarDone

- Nested object: `{ [date]: { [timeSlot]: { [taskId]: boolean } } }`.
- Used for daily task completion and calendar task completion.

### TaskScheduleOverrides

Cloud field on `userData/{userId}`. Assembled/saved via `getTaskScheduleOverridesForSave()` in `src/utils/taskScheduleOverrides.js`.

Shape:

```js
{
  moves: { [dateKey]: [ { id, type, protocolId?, peptideId?, name?, fromSlot, toSlot, updatedAt? } ] },
  skips:  { [dateKey]: [ { id, type, protocolId?, peptideId?, name?, slot, updatedAt? } ] },
  extras: { [dateKey]: [ { id, type, protocolId?, peptideId?, name?, slot, dose?, unit?, deliveryMethod?, penColor?, penType?, fromDateKey?, updatedAt? } ] },
  updatedAt: string // ISO timestamp of last local write
}
```

- **moves** — same-day AM ↔ PM slot moves for a dose.
- **skips** — mark a dose skipped that day (visible with `_skipped`; excluded from streak/adherence planned counts).
- **extras** — catch-up dose on a target day after reschedule (visible with `_extraSlot` / Catch-up chip). `fromDateKey` links back to the source day.

Local mirrors (written on change; restored from cloud on login/merge):

| localStorage key | Maps to |
|------------------|---------|
| `tpprover_task_schedule_overrides` | `moves` |
| `tpprover_task_skips` | `skips` |
| `tpprover_task_extras` | `extras` |
| `tpprover_task_schedule_overrides_lastUpdate` | last-write bump for sync protection |

Merge: `mergeTaskScheduleOverrides(local, server)` unions date-keyed lists by entry `id` (newer whole-blob `updatedAt` wins when one side is empty).

### WaterTracker (per date)

- **waterTracker** is an object: `{ [dateKey]: { glasses, goal, unit, lastUpdated } }`.

### UserNote / UserGoal

- Array items with `id`, `updatedAt`, and content fields as used by notes/goals components.

---


## userState document

Firestore document at `userState/{userId}`. Written by `cloudStorage.saveUserState` / `loadUserState`. Not part of the synced `userData` blob (no `prepareItemForSave`).

| Field | Type | Description |
|-------|------|-------------|
| `hasOnboarded` | boolean | True after the user completes (or finishes) first-run onboarding. |
| `sampleDataCleared` | boolean | True when demo/sample data was cleared. |
| `trackingMode` | string | `'simple'` \| `'advanced'`. Set during onboarding; mirrored in settings for Settings UI edits. |
| `onboardingStep` | string | Resume point: `'splash'` \| `'researcherType'` \| `'firstProtocol'` \| `'setupChecklist'` \| `'trialPricing'` \| `'done'`. |
| `setupChecklistDone` | object | Booleans for optional post-protocol setup areas: `stockpile`, `orders`, `supplements`, `medications`, `vendors`, `goals`. |

---
## Local-only (not in userData)



### Medication

Personal journal of common medications (brand/generic). Synced array `medications` / local key `tpprover_medications`.

- **name** (string) — Display name (often `Brand (generic)`).
- **brandName**, **genericName** (string, optional)
- **catalogId** (string|null) — Optional curated list id
- **dose**, **unit** (string)
- **schedule** (array) — e.g. `['AM','PM']`
- **days** (array) — Weekday abbreviations; empty = daily
- **notes** (string)
- **protocolIds** (array, optional) — Linked protocol ids for context only
- **id**, **updatedAt** — Required for sync
- **sourceSupplementId** (string, optional) — Parked supplement id after a move to Medication. On move-back, this id is restored as the supplement id and the medication id is parked instead.
- **sourceMedicationId** (string, optional) — Parked medication id on a supplement after a move from Medication. On move-back, this id is restored as the medication id.

### LabResult

Personal blood/lab value log. Synced array `labResults` / local key `tpprover_lab_results`. No clinical interpretation.

- **markerKey** (string) — Curated key or `custom`
- **markerName** (string)
- **value** (number)
- **unit** (string)
- **date** (string, YYYY-MM-DD)
- **notes** (string)
- **id**, **updatedAt** — Required for sync

These are not part of the synced `userData` blob. See USER_DATA_SAVE_PATTERN.md for the full list.

- **Dashboard layout** – `tpprover_dashboard_layout` (localStorage). Does not sync across devices.
- Other UI/preference keys under `tpprover_*` that are not listed in the "Synced" section of USER_DATA_SAVE_PATTERN.md.
