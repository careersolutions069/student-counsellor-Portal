import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { STUDENT_COOKIE, verifyStudentSession } from "@/lib/session";
import { destinations, type Role } from "@/lib/auth";
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
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return login();
  const { data: staff } = await client
    .from("staff_profiles")
    .select("role,is_active")
    .eq("id", user.id)
    .eq("is_active", true)
    .single();
  if (!staff) return login();
  const destination = destinations[staff.role as Role];
  if (!destination) return login();
  if (!(path === destination || path.startsWith(destination + "/"))) {
    const result = NextResponse.redirect(new URL(destination, request.url));
    response.cookies.getAll().forEach((cookie) => result.cookies.set(cookie));
    return result;
  }
  return response;
}
export const config = {
  matcher: [
    "/owner/:path*",
    "/branch/:path*",
    "/counsellor/:path*",
    "/student/:path*",
  ],
};
