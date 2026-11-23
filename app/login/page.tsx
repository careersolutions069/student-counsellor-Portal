import { AlertCircle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ActionForm } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { PasswordField } from "@/components/password-field";
import { BrandMark, CollegeIllustration } from "@/components/brand";
import { staffLogin, studentLogin } from "@/app/actions";
import { configured } from "@/lib/supabase/server";
function Hinted({
  id,
  label,
  hint,
  ...props
}: React.ComponentProps<typeof Input> & {
  id: string;
  label: string;
  hint: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-semibold text-ink">
        {label}
      </label>
      <Input id={id} aria-describedby={`${id}-hint`} {...props} />
      <p id={`${id}-hint`} className="text-[13px] text-muted">
        {hint}
      </p>
    </div>
  );
}
const submitClass = "[&>div>button]:h-[52px] [&>div>button]:w-full [&>div>button]:rounded-xl [&>div>button]:text-base";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; error?: string }>;
}) {
  const params = await searchParams;
  return (
    <div className="flex min-h-screen flex-col bg-ivory text-ink lg:flex-row">
      {/* Mobile: compact brand bar */}
      <header className="on-navy flex items-center gap-2.5 bg-navy px-5 py-4 text-white lg:hidden">
        <BrandMark size={32} />
        <div className="leading-tight">
          <span className="block text-[17px] font-bold tracking-[-0.01em]">The Career Solutions</span>
          <span className="text-xs text-[#B9D4D9]">Admissions portal</span>
        </div>
      </header>

      {/* Desktop: brand half */}
      <section
        aria-label="About The Career Solutions"
        className="hidden min-w-0 flex-1 flex-col gap-7 bg-navy px-14 py-12 text-white lg:flex"
      >
        <div className="flex items-center gap-3">
          <BrandMark size={40} />
          <div className="leading-tight">
            <span className="block text-[22px] font-bold tracking-[-0.015em]">The Career Solutions</span>
            <span className="text-sm text-[#B9D4D9]">Student counselling &amp; college admissions</span>
          </div>
        </div>
        <p className="max-w-[520px] text-[44px] font-bold leading-[1.08] tracking-[-0.035em]">
          Your admission journey, <span className="text-marigold-soft">one clear step</span> at a time.
        </p>
        <div className="flex max-w-[560px] justify-center rounded-3xl bg-ivory px-6 pt-7">
          <CollegeIllustration
            alt="Illustration of a college building with domes and arched windows"
            width={460}
            height={312}
            className="block h-auto w-full max-w-[460px]"
          />
        </div>
        <ul className="flex max-w-[520px] flex-col gap-2.5 text-base text-[#DCE9EC]">
          {[
            "See your next visit and where to go",
            "Check which stage your admission has reached",
            "Review the colleges your counsellor shortlisted",
          ].map((item) => (
            <li key={item} className="flex gap-2.5">
              <span aria-hidden="true" className="font-bold text-marigold-soft">—</span>
              {item}
            </li>
          ))}
        </ul>
      </section>

      <main className="flex min-w-0 flex-1 flex-col lg:items-center lg:justify-center lg:px-8 lg:py-12">
        <div className="mx-auto flex w-full max-w-[440px] flex-col gap-5 px-5 pt-6 lg:gap-6 lg:px-0 lg:pt-0">
          <div>
            <p className="mb-1.5 hidden text-sm font-semibold text-primary lg:block">Welcome back</p>
            <h1 className="text-[27px] font-bold leading-[1.15] tracking-[-0.025em] text-navy lg:text-[34px] lg:leading-[1.1] lg:tracking-[-0.03em]">
              <span className="lg:hidden">Sign in to follow your admission</span>
              <span className="hidden lg:inline">Sign in to The Career Solutions</span>
            </h1>
          </div>
          {!configured() && (
            <div role="status" className="rounded-xl border border-[#F1DDB0] bg-marigold-50 p-4 text-sm text-marigold-text">
              Setup required. Add the Supabase settings from .env.example to .env.local and apply the database migration.
            </div>
          )}
          {params.error && (
            <div role="alert" className="flex gap-2.5 rounded-xl border border-[#F4C7C1] bg-danger-bg px-3.5 py-3 text-sm leading-relaxed text-danger-text">
              <AlertCircle size={20} aria-hidden="true" className="mt-px shrink-0 text-danger" />
              <div>
                <strong className="block">We couldn’t sign you in</strong>
                {params.error.slice(0, 200)}
              </div>
            </div>
          )}
          <Tabs defaultValue={params.tab === "staff" ? "staff" : "student"}>
            <TabsList aria-label="Choose how you sign in">
              <TabsTrigger value="student">Student Login</TabsTrigger>
              <TabsTrigger value="staff">Staff Login</TabsTrigger>
            </TabsList>
            <TabsContent value="student">
              <p className="mb-4 text-sm leading-normal text-muted lg:text-[15px]">
                Your counsellor shares your registration number with you after you register at a branch of The Career Solutions.
              </p>
              <ActionForm action={studentLogin} submit="Sign in" className={submitClass}>
                <Hinted
                  id="registration_number"
                  label="Registration number"
                  name="registration_number"
                  placeholder="CS-PAT-2026-K8M4X9"
                  pattern="[Cc][Ss]-[A-Za-z0-9]+-[0-9]{4}-[A-Za-z0-9]{4,8}"
                  autoCapitalize="characters"
                  autoComplete="username"
                  spellCheck={false}
                  maxLength={80}
                  required
                  className="h-[52px] font-mono text-[17px] font-medium tracking-[0.02em] uppercase placeholder:normal-case"
                  hint={<>For example <span className="font-mono text-ink">CS-PAT-2026-K8M4X9</span></>}
                />
                <Hinted
                  id="dob"
                  label="Date of birth"
                  name="dob"
                  type="date"
                  autoComplete="bday"
                  required
                  className="h-[52px] font-mono text-[17px] font-medium"
                  hint="Day / month / year — e.g. 14/08/2008"
                />
              </ActionForm>
            </TabsContent>
            <TabsContent value="staff">
              <p className="mb-4 text-sm leading-normal text-muted lg:text-[15px]">
                For owners, centre heads and tele-counsellors. Use your work email.
              </p>
              <ActionForm action={staffLogin} submit="Sign in to workspace" className={submitClass}>
                <div className="space-y-1.5">
                  <label htmlFor="email" className="block text-sm font-semibold text-ink">Email</label>
                  <Input id="email" name="email" type="email" placeholder="you@careersolution.in" autoComplete="username" required className="h-[52px]" />
                </div>
                <PasswordField label="Password" name="password" />
              </ActionForm>
              <p className="mt-4 text-sm text-muted">Need access? Contact your Centre Head or owner.</p>
            </TabsContent>
          </Tabs>
        </div>
        <div aria-hidden="true" className="relative mt-auto h-[150px] overflow-hidden lg:hidden">
          <CollegeIllustration className="absolute bottom-[-6px] left-1/2 h-[190px] w-[280px] -translate-x-1/2 opacity-95" />
        </div>
      </main>
    </div>
  );
}
