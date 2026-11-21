# Unified upload size limit

Goal — Every new file is at most 4,194,304 bytes and multipart action requests fit below the requested 4.5 MB ceiling.

- [x] Share one 4 MB constant and exact oversize message across both validators/server actions. Add one reusable client file field that shows the message and blocks native submission using custom validity.
- [x] Set Next Server Action and proxy body limits to 4.5mb; update helper labels and local Storage configuration.
- [x] Add a forward migration capping the existing private bucket at 4 MB and new college PDF references at 4 MB. Retain existing files when no upload is performed; do not alter historical migrations or delete files.
- [x] Verify exact limit and limit+1 byte in unit, SQL, Storage/API and actual multipart Next actions. Check serialized action payload below 4,500,000 bytes. Replay migrations, run TypeScript/build, independent review, apply hosted migration and verify bucket/function metadata. No Vercel deployment.

Verified — Fifteen unit tests, TypeScript and production build passed. Nine migrations plus seed and seven SQL suites replayed in a disposable database. Actual multipart Next action tests passed exactly 4 MiB staff/student checklist uploads and college PDFs, rejected 4 MiB + 1 byte with the exact message before mutation, checked complete encoded requests below 4,500,000 bytes, and verified direct Storage rejection. Independent targeted review found no blockers. Hosted migration 20261120172403 applied; bucket=4194304, private=true, college metadata check updated, anonymous visit RPC access=false. Security advisor findings unchanged. Local fixtures cleaned by test suites. No Vercel deployment or browser interaction test was performed for this targeted change.
