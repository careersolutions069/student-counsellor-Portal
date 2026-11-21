# Tele-Counsellor workflow implementation plan

Goal — Deliver assigned-lead calling, invitations, callbacks, drops and branch handoff through the existing portal.
Architecture — A dedicated caller page uses the signed-in staff connection. An RLS-protected queue RPC computes current lead state from the latest appointment and call. A transactional call-outcome RPC validates assignment, saves education, records the call and updates appointments and student timing together. Existing audit triggers capture every domain write.

- [x] Add next_call_at, relax parent-number conflicts while retaining normalized unique student phones, and enforce explicit caller branch/assignment checks for student, call and appointment policies.
- [x] Add queue, parent-warning and transactional call-outcome RPCs. Synchronize student state when the Centre Head marks attendance. Preserve legacy appointment/stage data in queue classification without rewriting historical records.
- [x] Implement mobile cards, direct tel links and an accessible drawer for education, outcomes, required timing/drop reasons and internal history. Provide WhatsApp invitation links with branch details.
- [x] Extend branch appointments to include upcoming visits and education details. Keep one-click attendance and profile completion.
- [x] Verify sibling contacts, role isolation, queue transitions, atomic rollback, audit entries, session privacy, retries and concurrent invitation submission. Run TypeScript/build/unit/SQL and browser checks.
- [x] Apply the verified forward migration to hosted Supabase and verify policies and migration ordering.

Definitions — To Call contains new uncalled enquiries and callbacks due by the end of today in Asia/Kolkata. Future callbacks enter the queue on their scheduled day. Invited retains pending scheduled visits until attendance is recorded, including overdue visits. The latest appointment determines missed/re-invite state. Callback outcomes move a missed lead back to its callback timing. Parent-number warnings reveal only that another record exists within the actor’s branch. Future appointments are visible in the branch handoff view. Saving education alone creates a student audit entry without fabricating a call log.

Verification — Seven unit tests, TypeScript and production build; all six migrations + seed + four SQL suites replayed in a disposable database; concurrent invites/retries and login session regression passed. Browser checks covered mobile 390px (no horizontal overflow), sibling warning, consecutive education/outcome saves, invite sharing, missed/re-invite, required callback/drop, attendance, registration and student privacy. Hosted migration version 20261120051115 applied; RLS, grants and security advisor reviewed. No WhatsApp message or phone call was sent. Local QA students were removed, retaining audit history and issued sequence numbers.
