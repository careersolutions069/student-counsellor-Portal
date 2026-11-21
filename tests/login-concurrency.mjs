// Local Supabase seed fixtures only. Restores the student's DOB after each run.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
const base = [
  "exec",
  "-i",
  "supabase_db_careerSolutions",
  "psql",
  "-U",
  "postgres",
  "-d",
  "postgres",
  "-v",
  "ON_ERROR_STOP=1",
  "-At",
];
function query(sql) {
  return execFileSync("docker", [...base, "-c", sql], { encoding: "utf8" });
}
function output(child) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr));
    });
  });
}
const updater = spawn("docker", base, { stdio: ["pipe", "pipe", "pipe"] });
const updateResult = output(updater);
const locked = new Promise((resolve, reject) => {
  let text = "";
  const timeout = setTimeout(
    () => reject(new Error("Student lock was not acquired")),
    10000,
  );
  updater.stdout.on("data", (chunk) => {
    text += chunk;
    if (text.includes("LOCKED")) {
      clearTimeout(timeout);
      resolve();
    }
  });
});
try {
  updater.stdin.write(
    "begin;set local role authenticated;select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);select id from public.students where id='30000000-0000-4000-8000-000000000001' for update;select 'LOCKED';\n",
  );
  await locked;
  const login = spawn(
    "docker",
    [
      ...base,
      "-c",
      "set application_name='career_login_concurrency_test';set role service_role;select public.student_login('CS-PAT-2026-0001','2007-05-12','review-dob-test','review-dob-session');",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  const loginResult = output(login);
  let blocked = false;
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline && !blocked) {
    blocked =
      query(
        "select exists(select 1 from pg_stat_activity where application_name='career_login_concurrency_test' and state='active' and wait_event_type='Lock');",
      ).trim() === "t";
    if (!blocked) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(blocked, "Login must overlap the locked student update");
  updater.stdin.end(
    "select public.complete_student_profile('30000000-0000-4000-8000-000000000001','Aditi Verma','9000000001','2008-01-01');commit;\n",
  );
  await updateResult;
  const result = JSON.parse(
    (await loginResult).split("\n").find((line) => line.startsWith("{")),
  );
  assert.ok(
    result.error,
    "Login using the old DOB survived a concurrent profile change",
  );
  assert.equal(
    query(
      "select count(*) from private.student_sessions where token_hash='review-dob-session';",
    ).trim(),
    "0",
  );
  console.log("PASS concurrent login waits and rejects the superseded DOB");
} finally {
  if (!updater.stdin.writableEnded) updater.stdin.end("rollback;\n");
  await updateResult;
  query(
    "delete from private.student_sessions where token_hash='review-dob-session';delete from private.login_attempts where key in ('ip:review-dob-test','reg:CS-PAT-2026-0001');update public.students set dob='2007-05-12' where id='30000000-0000-4000-8000-000000000001';",
  );
}
