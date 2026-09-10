import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";
import { clientModule, observabilityModule, urlsModule } from "../modules";
import { createNextjsRuntimeEnv } from "../utils/runtime-env";
import { dbEnv } from "./db";

/**
 * Dashboard app environment preset
 */
export const dashboardEnv = createEnv({
	extends: [dbEnv],
	server: {
		SONARAEM_SPOTIFY_CLIENT_ID: z.string().min(1),
		VERCEL: z
			.string()
			.optional()
			.transform((val) => val === "1"),
		...observabilityModule.server,
	},
	client: {
		...clientModule.client,
		...urlsModule.client,
	},
	runtimeEnv: createNextjsRuntimeEnv(),
	emptyStringAsUndefined: true,
	skipValidation:
		process.env.SKIP_ENV_VALIDATION === "true" ||
		process.env.NODE_ENV === "test",
});
