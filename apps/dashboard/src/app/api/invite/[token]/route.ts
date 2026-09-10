import { deriveRootDomain } from "@sonaraem/common/utils/origin";
import { rateLimiters } from "@sonaraem/orpc/utils/rate-limiter";
import type { Route } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { env } from "@/lib/env";

const TOKEN_REGEX = /^[0-9a-f]{64}$/;
// 1 hour: just needs to survive the OAuth round-trip
const COOKIE_MAX_AGE = 60 * 60;

export async function GET(
	req: NextRequest,
	{ params }: { params: Promise<{ token: string }> },
) {
	const { success } = rateLimiters.veryStrict.check(
		rateLimiters.veryStrict.getIdentifier(req.headers),
	);
	if (!success) {
		redirect("/waiting?reason=invalid_invite" as Route);
	}

	const { token } = await params;

	if (!TOKEN_REGEX.test(token)) {
		redirect("/waiting?reason=invalid_invite" as Route);
	}

	// Without a domain, this cookie is host-only to wherever it's set (the dashboard app) and never reaches the API app's different subdomain, where the /sign-in/social allowlist gate actually reads it.
	const domain = env.VERCEL
		? deriveRootDomain(env.NEXT_PUBLIC_SONARAEM_API_URL)
		: undefined;

	const cookieStore = await cookies();
	cookieStore.set("sonaraem_invite", token, {
		httpOnly: true,
		secure: env.NEXT_PUBLIC_SONARAEM_NODE_ENV === "production",
		sameSite: "lax", // lax: cookie sent on top-level nav (final OAuth redirect back to dashboard)
		maxAge: COOKIE_MAX_AGE,
		path: "/",
		...(domain ? { domain } : {}),
	});

	redirect("/login");
}
