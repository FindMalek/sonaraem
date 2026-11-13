import { z } from "zod";

export const billingModule = {
	server: {
		SONARAEM_POLAR_ACCESS_TOKEN: z.string().min(1).optional(),
		SONARAEM_POLAR_ORGANIZATION_ID: z.string().min(1).optional(),
		SONARAEM_POLAR_WEBHOOK_SECRET: z.string().min(1).optional(),
		SONARAEM_POLAR_PRO_CHECKOUT_URL: z.string().url().optional(),
		POLAR_ACCESS_TOKEN: z.string().min(1).optional(),
		POLAR_ORGANIZATION_ID: z.string().min(1).optional(),
		POLAR_WEBHOOK_SECRET: z.string().min(1).optional(),
	},
	client: {
		NEXT_PUBLIC_SONARAEM_POLAR_PRO_CHECKOUT_URL: z.string().url().optional(),
	},
} as const;
