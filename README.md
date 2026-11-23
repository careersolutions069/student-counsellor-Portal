# The Career Solutions

A counselling and admission portal for managing student enquiries, calls, branch visits, college recommendations and admissions across India.

Built with **Next.js, TypeScript, Tailwind CSS and Supabase** (Auth, PostgreSQL and private Storage).

## Roles

| Role | Route | Access |
| --- | --- | --- |
| Owner | `/owner` | All branches, staff, students, transfers and conversion/revenue reports |
| Centre Head | `/branch` | Own branch’s students, tele-counsellors, visits, documents and admissions |
| Tele-Counsellor | `/counsellor` | Assigned leads in their branch, call outcomes, callbacks and meeting invitations |
| Student | `/student` | Own progress, appointments, shared colleges and documents; uploads only when permitted |

Branch isolation is enforced in the database and server actions. Internal call notes and counselling fees are hidden from students. Changes are audit logged.

## How it works

1. Add enquiries manually or import CSV/Excel leads and assign tele-counsellors.
2. Record calls, schedule visits and share WhatsApp invitations.
3. Mark attendance, save visit details and a college PDF, then generate a Registration ID after entering DOB.
4. Share student login, manage documents and counselling phases, and track admission outcomes.

Students sign in at `/login` with their Registration ID and DOB. Files are private, limited to **4 MB**, and viewed through short-lived signed URLs.

## Run locally

Requires **Node.js 24**, Docker and the Supabase CLI.

```bash
npm ci
cp .env.example .env.local
supabase start
supabase db reset
```

`supabase db reset` replaces the local database with demo data. Use it only for local development.

Fill `.env.local` using `supabase status` and [`.env.example`](.env.example). Generate `STUDENT_SESSION_SECRET` with `openssl rand -hex 32`. Keep the service-role key server-only.

```bash
npm run dev
```

Open [localhost:3000](http://localhost:3000). Local staff password: `CareerDemo!2026`.

| Role | Demo login |
| --- | --- |
| Owner | `owner@career.test` |
| Centre Head | `patna.head@career.test` |
| Tele-Counsellor | `patna.caller@career.test` |
| Student | `CS-PAT-2026-0001` · DOB `2007-05-12` |

## Development

- `app/` — routes and server actions; `components/` — UI; `lib/` — shared logic.
- `supabase/migrations/` — schema, permissions and database workflows.
- `tests/` and `supabase/tests/` — unit, API and SQL checks. API tests require local Supabase and the dev server.

```bash
npm run typecheck
npm test
npm run build
```

## Deployment

Connect the repository to Vercel and configure the variables in [`.env.example`](.env.example) with hosted Supabase credentials, a fresh session secret and the HTTPS portal URL. Set `TRUSTED_IP_HEADER` only to a single-client-IP header overwritten by your trusted proxy; otherwise requests share one IP rate-limit bucket.

Apply the migrations, disable public Auth signups and provision the first Owner through Supabase admin tooling. Owners then create branches and staff through the portal. Demo seed data is for local use only. Verify all four roles on the hosted site before live use.
