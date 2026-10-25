import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import { decideAccess } from "@/server/auth/access";
import { forwardSessionCache } from "@/server/auth/forward-cookies";
import { getAuth } from "@/server/auth/instance";
import { isPublicPath } from "@/server/auth/paths";

// Owner check before rendering, so 401/404 are real status codes (pages stream behind Suspense).
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  // returnHeaders: a session read from the database comes back with a fresh
  // cookie cache, and pages can't set cookies, so this is where it's passed on.
  const result = getSessionCookie(request)
    ? await getAuth().api.getSession({
        headers: request.headers,
        returnHeaders: true,
      })
    : null;
  const session = result?.response ?? null;

  switch (decideAccess(pathname, session, process.env.OWNER_EMAIL)) {
    case "allow": {
      const res = NextResponse.next();
      if (result) forwardSessionCache(result.headers, res.headers);
      return res;
    }
    case "login": {
      const url = new URL("/login", request.url);
      url.searchParams.set("next", pathname + search);
      return NextResponse.redirect(url);
    }
    case "unauthorized":
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    case "not-found":
      return new NextResponse("Not found", { status: 404 });
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
