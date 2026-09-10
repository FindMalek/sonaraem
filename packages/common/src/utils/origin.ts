// The shared root domain (last two labels, e.g. "sonaraem.com" from "api.sonaraem.com") two subdomains need to agree on to read each other's cookies — undefined for a bare host like "127.0.0.1" that has no real subdomain structure.
export function deriveRootDomain(url: string): string | undefined {
	try {
		const parts = new URL(url).hostname.split(".");
		return parts.length < 2 ? undefined : parts.slice(-2).join(".");
	} catch {
		return undefined;
	}
}

// Supports wildcard patterns (e.g. *.vercel.app) in addition to exact matches.
export function isOriginAllowed(
	origin: string | null,
	allowedOriginPattern: string | undefined,
): boolean {
	if (!origin || !allowedOriginPattern) return false;

	// Extract hostname from origin (remove protocol and port)
	let hostname: string = origin;
	try {
		const url = new URL(origin);
		hostname = url.hostname || origin;
	} catch {
		hostname = origin.replace(/^https?:\/\//, "").split(":")[0] || origin;
	}

	// Exact match
	if (hostname === allowedOriginPattern || origin === allowedOriginPattern) {
		return true;
	}

	// Wildcard pattern matching (e.g., *.vercel.app)
	if (allowedOriginPattern.includes("*")) {
		const safePatternRegex =
			/^\*?\.?[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
		if (!safePatternRegex.test(allowedOriginPattern)) {
			return false;
		}

		const regexPattern = allowedOriginPattern
			.replace(/\./g, "\\.")
			.replace(/\*/g, ".*");
		const regex = new RegExp(`^${regexPattern}$`);
		return regex.test(hostname);
	}

	return false;
}

export function isOriginAllowedForRequest(
	origin: string | null,
	baseOrigins: string[],
	allowedOriginPattern?: string,
): boolean {
	if (!origin) return false;

	if (baseOrigins.includes(origin)) {
		return true;
	}

	if (allowedOriginPattern) {
		return isOriginAllowed(origin, allowedOriginPattern);
	}

	return false;
}

export function buildTrustedOrigins(
	baseOrigins: string[],
	isVercel: boolean,
	allowedOriginPattern?: string,
): string[] | ((request?: Request) => string[] | Promise<string[]>) {
	if (isVercel && allowedOriginPattern) {
		return (request?: Request) => {
			if (!request) {
				return baseOrigins;
			}
			const origin = request.headers.get("origin");
			if (
				origin &&
				isOriginAllowedForRequest(origin, baseOrigins, allowedOriginPattern)
			) {
				return [...baseOrigins, origin];
			}
			return baseOrigins;
		};
	}

	return baseOrigins;
}
