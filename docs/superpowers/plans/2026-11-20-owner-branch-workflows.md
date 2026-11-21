# Owner and Centre Head workflow upgrade

Goal — Complete the existing dashboards with auditable, branch-isolated operations.
Architecture — Keep Supabase SSR and the existing action/form components. PostgreSQL triggers record domain changes atomically. Transactional RPCs handle staff reassignment and student transfers. All normal reads use the signed-in staff connection and RLS.

Confirmed permission change — Only owners create or deactivate Centre Heads. Centre Heads create and manage their own branch's Tele-counsellors.

- [x] Add academic fields, normalized contact deduplication, audit and transfer history, staff-edit and KPI functions, and the three-letter code constraint in one forward migration.
- [x] Extend validated server actions for branch/staff editing, academic profiles, attendance, shortlist deletion, and reasoned transfers.
- [x] Add Owner branch/search filters, accurate KPIs, branch/staff editors and directory navigation.
- [x] Add branch-scoped Students, Staff, Today’s F2F and History tabs. Reuse profile completion and WhatsApp sharing on attended appointments.
- [x] Add regression checks for audit immutability, rollback, branch reads/writes, contact collisions, staff moves, transfer history and profile ID retention. Run TypeScript, build, local SQL checks and available browser verification.
- [x] Apply the verified forward migration to the existing hosted project and verify its RLS and migration history.

Definitions — F2F Attended counts distinct students with attended or legacy completed appointments. Admissions Confirmed counts distinct students with an Admitted pipeline stage or a confirmed/admitted shortlist outcome. Today uses Asia/Kolkata. Duplicate contact checks compare both phone columns across student records and return a generic conflict without revealing another branch's record. Staff editing covers name, role, branch and activation. Sign-in email remains an Auth identity.

Verified with TypeScript, production build, four unit tests, all three local SQL suites, concurrency checks and browser workflows for branch filtering, academic updates, audit history, attendance, registration/WhatsApp, staff editing/activation, shared shortlist CRUD and student visibility, branch editing/activation, transfers and a 390px viewport. Hosted migration applied and RLS/privileges inspected. Hosted login remains dependent on initial owner/Auth configuration.

Final independent review found and verified fixes for a concurrent old-DOB login/session-revocation race and audit foreign keys blocking empty-branch deletion. A deterministic two-connection regression fails with the original login function and passes with the serialized version. All five migrations, seed and SQL suites replay on a clean disposable database in chronological order. The consistency migration is also applied to hosted Supabase.
