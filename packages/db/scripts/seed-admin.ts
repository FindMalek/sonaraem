import { randomBytes, randomUUID, scrypt } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");

dotenv.config({ path: path.join(repoRoot, ".env") });

const { db } = await import("@sonaraem/db");
const { user, account } = await import("@sonaraem/db/schema/auth");
const { eq } = await import("drizzle-orm");

// Local dev seed only — see README's "Admin dashboard (local)" section.
const ADMIN_EMAIL = "admin@sonaraem.com";
const ADMIN_PASSWORD = "changeme123!";
const ADMIN_NAME = "Sonaraem Admin";

// Same algorithm as @better-auth/utils/password (node export condition)
async function hashPassword(password: string): Promise<string> {
	const salt = randomBytes(16).toString("hex");
	const key = await new Promise<Buffer>((resolve, reject) => {
		scrypt(
			password.normalize("NFKC"),
			salt,
			64,
			{ N: 16384, r: 16, p: 1, maxmem: 128 * 16384 * 16 * 2 },
			(err, derivedKey) => (err ? reject(err) : resolve(derivedKey)),
		);
	});
	return `${salt}:${key.toString("hex")}`;
}

async function main() {
	console.info(`Seeding admin user: ${ADMIN_EMAIL}`);

	const existing = await db
		.select({ id: user.id, role: user.role })
		.from(user)
		.where(eq(user.email, ADMIN_EMAIL))
		.limit(1);

	if (existing.length > 0 && existing[0]) {
		if (existing[0].role !== "admin") {
			await db
				.update(user)
				.set({ role: "admin" })
				.where(eq(user.email, ADMIN_EMAIL));
			console.info(`Updated ${ADMIN_EMAIL} → role: admin`);
		} else {
			console.info(`Admin user ${ADMIN_EMAIL} already exists — nothing to do`);
		}
		process.exit(0);
	}

	const userId = randomUUID();
	const hashedPassword = await hashPassword(ADMIN_PASSWORD);
	const now = new Date();

	await db.transaction(async (tx) => {
		await tx.insert(user).values({
			id: userId,
			name: ADMIN_NAME,
			email: ADMIN_EMAIL,
			emailVerified: true,
			hasCompletedOnboarding: false,
			isApproved: false,
			role: "admin",
			createdAt: now,
			updatedAt: now,
		});

		await tx.insert(account).values({
			id: randomUUID(),
			accountId: userId,
			providerId: "credential",
			// Required by better-auth 1.7's credential sign-in lookup (createLocalAccountIssuer("credential")) — without it, sign-in fails with "User not found" even with the correct password.
			issuer: "local:credential",
			userId,
			password: hashedPassword,
			createdAt: now,
			updatedAt: now,
		});
	});

	console.info(`Admin created: ${ADMIN_EMAIL} (id: ${userId})`);
	console.info("Login: http://127.0.0.1:3004/login");
}

await main().catch((err) => {
	console.error(err);
	process.exit(1);
});
