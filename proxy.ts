import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { STUDENT_COOKIE, verifyStudentSession } from "@/lib/session";
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  response.headers.set("Cache-Control", "private, no-store");
  const login = () => {
    const result = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.getAll().forEach((cookie) => result.cookies.set(cookie));
    result.headers.set("Cache-Control", "private, no-store");
    return result;
  };
  const path = request.nextUrl.pathname;
  if (path.startsWith("/student")) {
    return (await verifyStudentSession(
      request.cookies.get(STUDENT_COOKIE)?.value,
    ))
      ? response
      : login();
  }
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  )
    return login();
  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(items) {
          items.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          response.headers.set("Cache-Control", "private, no-store");
          items.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );
  // Refresh the session here. Pages and actions check the current user and staff role.
  const { data } = await client.auth.getClaims();
  return data?.claims.sub ? response : login();
}
export const config = {
  matcher: [
    "/owner/:path*",
    "/branch/:path*",
    "/counsellor/:path*",
    "/student/:path*",
  ],
};
