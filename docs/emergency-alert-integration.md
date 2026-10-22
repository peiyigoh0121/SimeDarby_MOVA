# Emergency alert integration contract (review proposal)

MOVA currently has **no emergency-alert API, table, or dispatch connection**. The frontend must not create or claim an alert until Person C provides an authorised integration.

## Required integration from Person C

Provide an authenticated alert adapter with these capabilities:

1. An intentional `createAlert` action that accepts `source`, `occurredAt`, optional coordinates plus accuracy, and an explicit user confirmation.
2. A read/subscribe capability returning persisted alerts with `id`, `status`, `createdAt`, `source`, optional location/accuracy, and acknowledgement/dispatch timestamps when they genuinely exist.
3. Clear status vocabulary such as `received`, `acknowledged`, `dispatched`, `closed`, and `failed`. Only the backend may mark an alert as dispatched.
4. Error handling that leaves the UI in `not sent`/`failed`; no optimistic dispatch claim.

Emergency alerts are operational safety events, not `public."MOVA"` accessibility issue reports. They require separate authorisation, auditing, retention, and privacy controls.

## Proposed database migration for review only

Do not apply this from the frontend. A reviewed backend migration could introduce an `emergency_alerts` table with: opaque alert ID, reporter/user reference, source, created timestamp, status, latitude, longitude, accuracy metres, acknowledgement timestamp, dispatcher reference, and immutable audit events. RLS should prevent broad public reads, restrict creation to authenticated confirmed actions, and restrict acknowledgement/dispatch changes to authorised responders or a server-side service role. Location retention and emergency-service integration require privacy, security, and operational review.
