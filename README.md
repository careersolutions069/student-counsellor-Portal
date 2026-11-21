# Career Solution

Next.js App Router, TypeScript, Tailwind CSS, shadcn/ui primitives and Supabase SSR. Four roles with branch isolation in PostgreSQL. Student authentication uses a signed, secure HTTP-only cookie, an expiring database session and a server-only public-field projection.

## Local setup

1. Install Node.js 22+, Docker and the Supabase CLI.
2. Run `npm install`, then `supabase start` and `supabase db reset` in this directory. Reset replaces the local project's data with the test fixtures.
3. Copy `.env.example` to `.env.local`. Use the local URL, publishable/anon key and service-role key from `supabase status`. Keep the service-role key server-only. Generate `STUDENT_SESSION_SECRET` with `openssl rand -hex 32`.
4. Run `npm run dev` and open http://localhost:3000. Student cookies always use `Secure`. Browsers support localhost as a secure development exception. Use HTTPS for any other hostname.

`TRUSTED_IP_HEADER` must name a header that your hosting proxy overwrites with a single client IP. Never trust an arbitrary forwarded header from the internet. Until configured, student requests share one IP throttle bucket. Registration-number throttling still applies independently. Set `NEXT_PUBLIC_PORTAL_URL` to your actual HTTPS origin before sharing logins.

## Local test accounts

All staff fixtures use password `CareerDemo!2026`.

| Role | Email |
| --- | --- |
| Owner | owner@career.test |
| Patna Centre Head | patna.head@career.test |
| Bangalore Centre Head | bangalore.head@career.test |
| Patna tele-counsellor | patna.caller@career.test |
| Bangalore tele-counsellor | bangalore.caller@career.test |

| Student | Registration | DOB |
| --- | --- | --- |
| Aditi Verma | CS-PAT-2026-0001 | 2007-05-12 |
| Ishita Nair | CS-BLR-2026-0001 | 2006-08-23 |

Each branch also has one incomplete, unassigned enquiry. These students cannot log in until their Centre Head completes the profile. College names in the seed are fictional fixtures.

## Verification

- `npm run typecheck`
- `npm test`
- `npm run build`
- After local reset, run `docker exec -i supabase_db_careerSolutions psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/isolation.sql` (use the container name reported by `supabase status` if different).

The SQL checks run in a rolled-back transaction. They test branch visibility and writes, assigned caller access, inactive accounts, anonymous denial, profile completion retries, student projection and sessions, registration/IP throttling, and consistent transfers.

Run `supabase/tests/staff_creation.sql` through the same local `psql` command to verify that Centre Heads can create only Tele-counsellors in their own branch, Centre Head and owner-role creation are denied, callers cannot create staff, and owners can create staff across branches.

Student lists show 25 records per page. Total students, completed profiles and per-branch totals use database counts independently of the displayed page.

## Access and operations

Staff use Supabase Auth and `getUser()` in both Next.js `proxy.ts` (the current middleware convention) and server authorization. Database helpers re-read active staff and branch membership for each request. Students have no database role or direct Data API access. Their server-only portal RPC selects explicit public fields and excludes internal notes and unshared shortlists.

Owner and Centre Head creation actions use the Auth admin API only after role verification. Staff profile insertion still uses the caller's RLS-protected connection. Failed profile creation deletes the newly created Auth user. A failed cleanup logs the account ID for administrator recovery. Staff deactivation revokes data access immediately through RLS, including existing sessions.

Owners can create Centre Heads and Tele-counsellors across branches. Centre Heads create, edit and activate/deactivate only Tele-counsellors within their own branch. Only owners create, edit or deactivate Centre Heads.

Registration generation serializes on the student row and retries unique-key collisions. New IDs have six random unambiguous uppercase letters/digits, with at least one of each. Existing numeric IDs remain valid; retries keep the same ID. The historical numeric counter table is retained and no longer allocates new IDs. Transfers atomically move child records, clear assignment, revoke student sessions, and retain the original registration number as a permanent identifier.

Before production, apply the migration with your normal Supabase deployment flow, disable public signups in the hosted Auth dashboard, configure HTTPS, trusted IP headers and secrets, and provision the initial owner through the Supabase admin tooling. Apply `seed.sql` only to local development. Restrict and rotate the published local fixture credentials if they are ever used elsewhere.

## Hosted Supabase setup

The hosted project is `qgthfsoiigfcbiwqdtdl` in `ap-northeast-1`. The portal schema, the shortlist trigger search-path fix, the Owner/Centre Head workflow migrations and the Tele-Counsellor, Student Portal/private-document and Visit Conversion/random-registration migrations have been applied there. Local migration filenames match the hosted migration history.

All twelve application and internal tables have RLS enabled. The three private tables have no client policies and deny client access. Supabase also flags the staff-facing security-definer functions for review. These functions intentionally implement role checks, profile completion and owner-only transfers, with an empty search path and explicit execution grants. The trigger search-path warning has been resolved.

Initial owner provisioning for `careersolutions069@gmail.com` and hosted Auth configuration remain pending. Local environment settings still point to the local development database.

## Owner and branch workflows

Owners have a global branch filter, branch and staff editors, a searchable student directory, and a Student Transfers section. Centre Heads have branch-locked Students & Enquiries, Branch Staff, F2F Appointments and Student Transfers sections. The Owner can search for a student and transfer them from Student Transfers; Centre Heads see transfer history and an Owner-only explanation. Staff editing covers name, role, branch and activation. Sign-in email is managed through Supabase Auth.

Academic fields include target course, stream, percentage or score, preferred locations, budget and drop reason. Contact values accept formatted Indian phone numbers and are stored as ten digits. Student phone numbers remain strictly unique across all branches. Parent numbers may be shared by siblings. A non-blocking warning checks whether another student uses the parent number within the same branch, without exposing that student’s identity.

KPI cards use database counts, independent of the displayed page. F2F Attended counts distinct students with attended or legacy completed appointments. Admissions Confirmed counts distinct students with an Admitted pipeline stage or a shortlist outcome of Confirmed, Admitted or Admission Confirmed. Today uses midnight-to-midnight Asia/Kolkata. Directory and history pages contain 25 records.

Triggers audit every domain create/update/delete in the same transaction. Clients can read authorized audit records and cannot insert, modify or delete logs. The portal does not display or fetch activity/audit history. Centre Heads see only transfers involving their branch; existing database audit policies and stored records remain intact. Student sessions and Tele-counsellors cannot read these histories. Local browser verification leaves an audit trail of QA operations after fixture values are restored.

Owner transfers require a reason, retain the registration number, clear caller assignment and invalidate student sessions. Existing two-argument transfer callers retain a default Branch transfer reason. Moving a caller to another branch or changing their role clears existing assignments. Random registration generation handles branch-code reuse while retaining existing IDs. New IDs do not use the former four-digit sequence limit.

Shortlist entries can be shared or internal. New entries default to shared. Shared edits and deletions are read by the Student portal on its next request. Every entry mutation is audited.

Run `supabase/tests/workflows.sql` with the local psql command above to verify audits, rollback consistency, branch isolation, contact conflicts, staff moves, attendance/admission counts, transfers and registration IDs after branch-code changes. The SQL transaction rolls back all fixtures.

The hosted security advisor also reports disabled leaked-password protection. Configure hosted Auth before production use. Supabase documents [password security](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), [intentional security-definer exposure](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), and [RLS tables without client policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

The consistency follow-up migration serializes successful student logins with profile changes and session invalidation. Run `node tests/login-concurrency.mjs` against the local seed database for a deterministic two-connection regression. It restores the fixture DOB afterward. Audit snapshots retain the identifiers of an otherwise empty deleted branch while its live branch reference becomes null. The workflow SQL suite also verifies this deletion path.

All migrations, the original seed and all eight SQL suites have been replayed successfully in a separate disposable local database. The main local database was preserved.

## Tele-Counsellor workflow

`/counsellor` contains only active staff members’ assigned students in their own active branch. To Call shows uncalled new enquiries and callbacks due today or overdue in Asia/Kolkata. Future callbacks appear on their scheduled day. Invited retains pending visits, including overdue visits; Missed / Re-Invite follows the latest appointment. Re-inviting creates a new appointment and cancels earlier pending invitations. Dropped leads leave these queues.

The mobile drawer saves education independently or records an invitation, callback, no-answer or drop outcome. Required dates and drop reasons are validated on the server and in PostgreSQL. A single transaction saves education, the call, appointment changes, queue timing and audit records. Duplicate request IDs do not create extra calls. Student locks serialize concurrent invitation requests. The branch view includes pending overdue visits and today/future appointments with education details. Centre Head attendance changes update the caller queue; repeated attendance submissions preserve callback timing.

Telephone links open the device dialler. WhatsApp links prefill student name, visit time in IST, branch, address and the configured Google Maps URL; the staff member sends the message. Call history is paginated and remains internal, outside the student portal’s explicit public-field projection. Branch and caller pages read fresh data on navigation or refresh; an already-open page does not receive live push updates.

Run `supabase/tests/counsellor.sql` through the same local psql command to test sibling contacts, exact assignment, transactional outcomes, queues, attendance protection, repeated missed submissions and audit entries. Run `node tests/counsellor-concurrency.mjs` against the local seeded database to verify concurrent invitations and idempotent retries; its fixture is removed afterward. `npm test` runs seventeen validation/session/time/sharing/upload/visit/counselling checks.

## Student portal, login slips and private documents

The Student portal displays a student/branch header with target course and Maps, current admission progress, the next scheduled meeting, shared college recommendations and My Documents. Profile, appointment and shortlist fields remain read-only. Its explicit database projection excludes call logs, budget/drop notes, staff upload attribution and raw Storage paths. The progress tracker refreshes every 30 seconds while visible and on focus, pausing while an upload file is selected.

Progress uses shared outcomes: Registered, Colleges Shortlisted, Documents Verified (a nonempty checklist with every item Verified), Applied, Admission Confirmed. Applied/confirmed evidence can advance the displayed stage. Empty checklists never imply verification.

Owner and Centre Head profiles include Share Student Login: WhatsApp, Copy with confirmation, Email and Download .txt. All use the same student name, registration, `/login` URL and Date of Birth instruction. No DOB value is included. Messages open in the staff member’s messaging/email app; nothing is sent automatically. Configure `NEXT_PUBLIC_PORTAL_URL` before sharing hosted login slips. Without it, browser sharing uses the current origin.

Only active Centre Heads in the student’s branch and Owner manage checklists, permission, uploads and statuses. Tele-counsellors cannot read documents or change upload permission. Student uploads default to off. A signed student cookie plus a valid, unexpired database session authorizes only that student’s documents; upload permission and non-Verified status are checked again at finalization under locks. Student uploads always become Uploaded, never Verified. Checklist and status mutations are audited; uploads also record the actual staff/student role and student ID in audit details.

The `student-documents` bucket is private (4 MiB bucket limit for all uploads) and has a restrictive policy denying browser/API access by anon/authenticated roles. Next Server Actions validate size (up to 4 MiB), filename extension, MIME and PDF/JPEG/PNG signatures. Server-generated immutable paths prevent overwriting another file. Viewing/downloading goes through `/documents/[id]`, revalidates the current actor/session and returns a 60-second signed Storage URL with no-store response headers. Existing signed URLs remain usable until their short expiry. Transfers cascade document branch scope while preserving file paths and invalidate student sessions.

Uploads are staged, then finalized with a document-version check. Definite database failures remove staged files; committed replacements remove the old object. Uncertain transport failures retain the candidate file to avoid deleting a possibly committed upload. Reconcile orphan objects during storage maintenance; logged cleanup failures also need review. Document deletions cascade metadata; long-term Storage retention/deletion is an operational policy outside this workflow.

Verification: run `supabase/tests/student_documents.sql` with the local psql command above. With the dev server and local Supabase Storage running, `node --import tsx tests/documents-api.mjs` verifies private access, cross-student denial, signed URL expiry, revoked sessions, real multipart Next actions, spoof rejection, a full 4 MiB staff upload and permitted student replacement. It uses local seeded accounts and removes its checklist/file fixtures. No hosted data is used by this script. All migration/SQL suites can be replayed in a disposable database; the isolation suite now expects fourteen RLS tables.

## Visit conversion and two-step registration

Owner and Centre Head records, including attended appointment profiles, now contain a Visit & Conversion Form followed by a separate Registration section. Visit capture requires student name, Amount > 0, F/N, normalized Phone / Mobile, City, State, Marks, Exact/Approximate type, one or more distinct MBBS/BDS/BAMS courses and Government/Private College type. City/state and education prepopulate from caller capture. Empty saved course arrays map recognized course names from target-course text.

Save Visit Details requires an uploaded PDF and sets visit_details_completed without generating an ID. The matching Government/Private PDF label changes with the selection. Existing same-type PDFs can be retained; changing type requires a new immutable upload. College PDFs are PDF-only, up to 4 MiB, and stored at branch_id/student_id/college-registration/random-uuid.pdf in the private bucket. All student checklist uploads share the same 4 MiB limit. Next Server Action and proxy body limits are 4.5mb, leaving room for multipart fields.

Generate Registration ID remains disabled until visit details are saved and DOB is filled. PostgreSQL independently enforces the new-visit gate. New IDs use CS-CODE-YYYY- plus six characters from ABCDEFGHJKMNPQRSTUVWXYZ23456789, including at least one letter and digit. Cryptographic random bytes create suffixes; unique indexes and exception retries resolve races. Same-student concurrent retries retain one ID. Existing completed profiles can update DOB while retaining their historical IDs without requiring a new visit. Transfers preserve any existing ID and college PDF path; current branch authorization controls file viewing, while replacements use the new branch’s path.

Authenticated clients have column-level restrictions on counselling_amount, college_pdf_path and college_pdf_name. Owner/Centre Head reads go through managed_students(), which rechecks role, activation and branch; caller queues use a safe security-invoker view under existing row policies. Visit-only fields cannot be changed through a direct PATCH. Audit snapshots redact fee and college file metadata so old-branch history does not expose them after transfer; a private_visit_details_changed flag retains the change event. The Student Portal projection never includes these private values. Viewing/downloading college PDFs uses the manager-only /college-registration/[student-id] route with 60-second URLs and no-store headers.

Login validates ^CS-[A-Z0-9]+-\d{4}-[A-Z0-9]{4,8}$, normalizing case. Both old CS-PAT-2026-0001 and new CS-PAT-2026-K8M4X9 styles are accepted. Four-channel login sharing uses the retained/new ID.

Verification: run supabase/tests/visit_conversion.sql with the local psql command. node tests/registration-concurrency.mjs checks eight unique mixed IDs across sixteen concurrent requests and retries. With the local dev server/Storage running, node --import tsx tests/visit-api.mjs checks actual visit actions, a full 4 MiB upload, required/type-change PDFs, same-type retention, raw API privacy, signed college viewing, separate generation and lowercase login. Its default run cleans its fixtures. The optional --keep-fixture is for local browser QA and records fictional fixture identifiers in /private/tmp/career-visit-browser-fixture.json for later cleanup. No hosted fixtures are created.

Hosted migration 20261120170901 applies this workflow. Hosted Auth/owner provisioning and Vercel remain pending. New uploads are limited to 4 MiB per file; API tests also verify complete multipart bodies stay below 4,500,000 bytes. Vercel deployment itself remains untested. Interrupted transfers between Storage and PostgreSQL may leave private orphan files; reconcile them rather than deleting an upload with uncertain commit status.

## Unified 4 MB uploads

Every new college PDF, staff document and student document is limited to 4 * 1024 * 1024 = 4,194,304 bytes. A shared client field validates on file selection, shows “File must be 4 MB or smaller” and blocks form submission while oversized. Server actions repeat the limit before reading/uploading file bytes. File type/signature checks and all role/session restrictions remain enforced. Helper labels show Max 4 MB; documents accept PDF/JPG/JPEG/PNG and college registration accepts PDF only.

A forward migration caps the private bucket and new college PDF metadata references at 4 MB. Existing files are not removed, and edits that retain an existing PDF do not upload it again. Local Storage configuration also sets 4MiB. The limit+1-byte SQL test rejects new oversized references while testing existing-file retention. Unit and actual Next action/API tests cover exactly 4 MB success and 4 MB + 1 byte rejection with the exact message, plus direct Storage rejection and total multipart request size below 4.5 MB. Historical migrations retain their original values; the latest forward migration sets the current policy.

Hosted migration 20261120172403 applies the unified 4 MB policy; bucket size and private access were verified after application. Run supabase/tests/upload_limits.sql for database boundary/retention checks.

### Counselling stages and shared allotment PDFs

Owner and Centre Head student records now include a lazy **Counselling Stage** panel. Choose up to five Indian states/union territories, manage the security deposit PDF, and work through six sequential phases. A Choice PDF is required before recording each phase outcome. Not Allotted unlocks the next phase; Phase 6 finishes without creating Phase 7. College Allotted fixes the allotted phase and enables the main allotment letter plus New College Choice and Upgrade College documents. Each post-allotment letter requires its matching choice PDF. States and unlocked document slots remain editable after completion.

Stage PDFs use one slot for Phases 1–3, one for 4–5, and one for 6. Phases 2, 3 and 5 inherit their group's file without a second upload. Security and stage files can be added independently. Earlier choice PDFs can be reused into a separate current-phase slot. Reuse preserves the original bytes even if the source phase is later replaced; storage cleanup removes an old object only when no counselling slot still references it.

All counselling uploads are PDF-only, max 4 MiB, and go through authenticated server actions into private immutable `<branch>/<student>/counselling/<uuid>.pdf` paths. Upload finalization rechecks the live manager role, branch, slot and document version. New uploads, replacements and reuses always start hidden. **Show to Student** shares only that document; **Hide from Student** denies new viewing requests immediately. Previously issued signed URLs expire within 60 seconds. The Student Portal includes only explicitly shared IDs, labels and filenames and hides the entire counselling card when none exist. Internal phase/state data and hidden PDFs never enter its projection.

The `student_counselling` and `counselling_documents` tables use RLS, guarded RPC mutations, audit triggers and cascading branch references. Tele-counsellors have no counselling access. Transfers move current access to the destination branch, preserve reused files and revoke student sessions. The isolation suite now expects fourteen RLS tables.

Verification: `npm test` runs 17 unit checks; `supabase/tests/counselling.sql` adds rollback-only state, phase, category, sharing, role/activation and transfer checks. With local seeded Supabase, Storage and the dev server running, `node --import tsx tests/counselling-api.mjs` checks real Next actions, 4 MiB boundaries, file signatures, concurrent outcomes, inherited slots, snapshot lifetime, cleanup, private sharing and signed viewing. Its fixtures are removed by default; `--keep-fixture` is only for local browser QA. All ten migrations and eight SQL suites replay successfully in a disposable database. Migration `20261120182839_counselling_stage.sql` is applied to the hosted project; no hosted student fixtures are created.

### Bulk CSV/Excel lead imports

The Students & Enquiries tab includes **Bulk Lead Import** for active Centre Heads and Owners. Centre Heads are locked to their branch; Owners must choose an active destination branch. Download the sample CSV, select a `.csv`, `.xlsx` or `.xls` file, review row validation, then choose Unassigned, one active branch Tele-Counsellor, or round-robin across a checked subset. The shared parser normalizes contact numbers, accepts case-insensitive header aliases and retains spreadsheet row numbers. It uses pinned SheetJS `xlsx` 0.20.3 from the [official distribution](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/).

Limits: max 4 MiB, first worksheet only, up to 5,000 lead rows and 64 columns. Excess rows/columns or expanded XLSX archives over 32 MiB are rejected rather than silently truncated. Missing/invalid names or student phones, invalid optional parent phones and overlong fields are skipped. File duplicates are shown in the client preview; existing global student numbers are skipped atomically at insertion and disclose no branch/name details. Duplicate parent numbers are allowed, with warnings for same-branch contacts and accepted siblings. Import results list every row and reason. Files are parsed again on the server and are not stored.

The database rechecks active manager/branch/counsellor access, serializes same-branch imports, and uses the global student_phone unique constraint for concurrent imports from any branch. Round-robin starts at the first selected counsellor per import and advances only on successful inserts. Assigned leads have `next_call_at` set immediately and appear in To Call. Existing per-student audits remain, with one additional `bulk_lead_import` summary audit identified by a batch UUID. If confirmation is lost, refresh the student list before retrying; unique phones prevent duplicate leads.

### Owner conversion and recorded revenue reports

The Owner-only **Conversion & Revenue Reports** tab and `/owner/reports` CSV export use the same guarded SQL aggregation and filters. Report date ranges select leads by their enquiry date (`students.created_at`) in IST; all related outcomes are the current lifetime outcomes for that lead cohort. All Time is unbounded; Last 7/30 Days include today plus the prior 6/29 days; This Month starts on the IST first of the month. Custom From/To dates are inclusive. Global branch filtering is preserved when applying dates, and dates are preserved when applying the branch filter.

Only active branches appear, including zero-lead rows. All-India Total sums the displayed branches. Invited counts distinct students with any appointment, including historical missed/cancelled visits; converted counts completed visit forms or attended/completed appointments once per student. Registered IDs and main allotments count students, and revenue sums each student's recorded `counselling_amount` once. INR formatting preserves aggregate paise exactly. This is recorded counselling revenue, not a transaction/payment reconciliation ledger.

Caller Assigned Leads uses current assignments. Calls use `logged_by`; invites and attended visits count distinct students per `created_by` and preserve historical actor credit after transfers in All-India reports. Selected branch filters apply to the lead cohort and the callers' current branches; inactive callers remain listed. Invite Rate can exceed 100% after reassignment. Six phase bars count main allotments; new/upgrade badges count students with corresponding choice/letter slots; In Counselling counts students with a counselling-state row and no main allotment. No report data or export is available to Centre Heads, callers or students. CSV cells are quoted and formula-leading text is neutralized.

Verification: `npm test` runs 23 unit checks. Run `supabase/tests/bulk_import_reports.sql` with the local psql command to test isolation, row outcomes, distribution, audits, exact revenue and cohort/phase/caller metrics. `node tests/import-reports-api.mjs` uses local seeded staff, real multipart CSV/XLSX/XLS imports, 4 MiB boundaries, concurrent duplicate handling, owner-only export and transfer attribution; it removes its fixtures by default. Optional `--keep-fixture` supports browser QA. A 5,000-row import completed within an 8-second local database timeout and rolled back. All eleven migrations and nine SQL suites replay successfully in a disposable database. Hosted migration `20261120190229_bulk_import_owner_reports.sql` adds guarded import/report functions and reporting indexes; the existing assigned_to index is reused. Vercel remains deferred.

Student transfer verification: with the local dev server and seeded Supabase running, `node tests/transfers-api.mjs` verifies the Owner transfer search/form, Centre Head read-only access and direct RPC denial, absence of activity history, required reason, registration preservation, cleared assignment, student-session revocation and cascading document/counselling branch updates. Its fictional student and transfer row are removed afterward; audit events are retained.

### Upload feedback and E2E cleanup

File forms immediately disable submission and show a spinner with `aria-busy` while their action runs. A shared guard prevents rapid duplicate submissions, captures fields/files before disabling controls, and unlocks after a response. Empty optional file inputs are omitted so an existing college PDF can be retained; server validation still rejects deliberately selected empty files. `npm test` now runs 25 checks. Local browser and upload API verification evidence is kept under `docs/verification/`, which is excluded from Git and deployment uploads.

The approved 21 November E2E inventory has been cleaned locally: eight test students and 25 Storage files removed, five test staff and two branches deactivated. Identities were retained to preserve audit references. The receipt, file manifest and exact-ID cleanup script remain local and are excluded from Git. Storage files require the separate reviewed manifest and Storage API; raw Storage metadata must not be deleted through SQL.
