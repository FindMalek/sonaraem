import { createEnv } from "@t3-oss/env-core";
import { baseEnv } from "../base";
import {
	aiModule,
	authModule,
	emailsModule,
	observabilityModule,
	spotifyAllowlistModule,
	triggerModule,
	urlsModule,
} from "../modules";
import { createServerRuntimeEnv } from "../utils/runtime-env";
import { dbEnv } from "./db";

/**
 * API app environment preset
 */
export const apiEnv = createEnv({
	extends: [dbEnv, baseEnv],
	server: {
		...aiModule.server,
		...authModule.server,
		...emailsModule.server,
		...observabilityModule.server,
		...spotifyAllowlistModule.server,
		...triggerModule.server,
	},
	client: {
		...emailsModule.client,
		...urlsModule.client,
	},
	clientPrefix: "NEXT_PUBLIC_",
	runtimeEnv: createServerRuntimeEnv(),
	emptyStringAsUndefined: true,
	skipValidation:
		process.env.SKIP_ENV_VALIDATION === "true" ||
		process.env.NODE_ENV === "test",
});
