import { GraduationCap, CalendarDays, Check, ShieldCheck } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/fields";
import { staffLogin, studentLogin } from "@/app/actions";
import { configured } from "@/lib/supabase/server";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; error?: string }>;
}) {
  const params = await searchParams;
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="relative flex flex-col justify-between overflow-hidden bg-[#102f40] p-6 text-white lg:p-16">
        <div className="flex items-center gap-3">
          <GraduationCap size={34} className="text-teal-300" />
          <span className="text-xl font-bold">Career Solution</span>
        </div>
        <div className="relative z-10 my-24 hidden max-w-lg lg:block">
          <p className="mb-6 text-sm font-medium tracking-widest text-teal-300">
            YOUR NEXT CHAPTER
          </p>
          <h1 className="text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
            A clearer path to
            <br />
            the right college.
          </h1>
          <p className="mt-6 max-w-md leading-relaxed text-slate-300">
            Personal guidance. Meaningful choices. Keep your counselling and
            admission journey together, from your first meeting to your next
            beginning.
          </p>
          <div className="mt-10 flex flex-wrap gap-x-7 gap-y-3 text-sm text-slate-200">
            <span className="flex items-center gap-2">
              <Check size={17} className="text-teal-300" />
              College shortlists
            </span>
            <span className="flex items-center gap-2">
              <CalendarDays size={17} className="text-teal-300" />
              Counselling appointments
            </span>
          </div>
        </div>
        <p className="hidden text-sm text-slate-400 lg:block">
          Student counselling & admission management · India
        </p>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-52 -right-48 h-[550px] w-[550px] rounded-full border-[80px] border-white/[0.025]"
        />
      </section>
      <section className="flex items-center justify-center bg-white px-6 py-12 md:p-14">
        <div className="w-full max-w-md">
          <div className="mb-9">
            <h2 className="text-3xl font-bold tracking-tight">Welcome back</h2>
            <p className="mt-3 text-slate-500">
              Sign in to your Career Solution portal.
            </p>
          </div>
          {!configured() && (
            <div
              role="status"
              className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
            >
              Setup required. Add the Supabase settings from .env.example to
              .env.local and apply the database migration.
            </div>
          )}
          {params.error && (
            <p role="alert" className="mb-5 text-sm text-red-800">
              {params.error.slice(0, 200)}
            </p>
          )}
          <Tabs defaultValue={params.tab === "student" ? "student" : "staff"}>
            <TabsList>
              <TabsTrigger value="staff">Staff login</TabsTrigger>
              <TabsTrigger value="student">Student login</TabsTrigger>
            </TabsList>
            <TabsContent value="staff">
              <ActionForm
                action={staffLogin}
                submit="Sign in"
                className="[&>button]:w-full"
              >
                <Field
                  label="Email address"
                  name="email"
                  type="email"
                  placeholder="you@careersolution.in"
                  autoComplete="username"
                  required
                />
                <Field
                  label="Password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </ActionForm>
              <p className="mt-5 text-sm text-slate-500">
                Need access? Contact your Centre Head or owner.
              </p>
            </TabsContent>
            <TabsContent value="student">
              <ActionForm
                action={studentLogin}
                submit="View my portal"
                className="[&>button]:w-full"
              >
                <Field
                  label="Registration number"
                  name="registration_number"
                  placeholder="CS-PAT-2026-K8M4X9"
                  pattern="[Cc][Ss]-[A-Za-z0-9]+-[0-9]{4}-[A-Za-z0-9]{4,8}"
                  autoCapitalize="characters"
                  autoComplete="username"
                  maxLength={80}
                  required
                />
                <Field
                  label="Date of birth"
                  name="dob"
                  type="date"
                  autoComplete="bday"
                  required
                />
              </ActionForm>
              <p className="mt-5 text-sm text-slate-500">
                Your Centre Head will share your registration number after
                completing your profile.
              </p>
            </TabsContent>
          </Tabs>
          <div className="mt-10 flex items-center gap-2 border-t border-slate-100 pt-6 text-sm text-slate-500">
            <ShieldCheck size={17} />
            Secure access to your counselling records
          </div>
        </div>
      </section>
    </main>
  );
}
