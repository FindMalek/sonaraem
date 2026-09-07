import type { Page } from "playwright";

const TABLE_SELECTOR = 'table[data-encore-id="table"]';

export async function scrapeAllowlistEmails(page: Page): Promise<string[]> {
	const rows = page.locator(`${TABLE_SELECTOR} tbody tr`);
	const count = await rows.count();
	const emails: string[] = [];
	for (let i = 0; i < count; i++) {
		const email = await rows.nth(i).locator("td").nth(2).innerText();
		emails.push(email.trim().toLowerCase());
	}
	return emails;
}

// "Full Name" and "Email" are always-visible inline form fields (no dialog), so the table row is the only real confirmation signal.
export async function addAllowlistUser(
	page: Page,
	email: string,
): Promise<void> {
	await page.locator("#name").fill(email.split("@")[0] ?? email);
	await page.locator("#email").fill(email);
	await page.locator(`form button[type="submit"]`).click();

	// Poll the exact-match scrape (not a hasText filter, whose substring match lets "aa@x.com" satisfy a wait for "a@x.com") since the table can render empty mid-refetch right after submit.
	const target = email.toLowerCase();
	const deadline = Date.now() + 15_000;
	while (Date.now() < deadline) {
		if ((await scrapeAllowlistEmails(page)).includes(target)) return;
		await page.waitForTimeout(300);
	}
	throw new Error(
		`${email} never appeared in the allowlist table after adding`,
	);
}

export async function removeAllowlistUser(
	page: Page,
	email: string,
): Promise<void> {
	const rows = page.locator(`${TABLE_SELECTOR} tbody tr`);
	const count = await rows.count();
	const target = email.toLowerCase();

	for (let i = 0; i < count; i++) {
		const row = rows.nth(i);
		const rowEmail = (await row.locator("td").nth(2).innerText())
			.trim()
			.toLowerCase();
		if (rowEmail !== target) continue;

		await row.getByRole("button", { name: "User options" }).click();
		await page.getByRole("button", { name: "Remove user" }).click();
		await row.waitFor({ state: "detached", timeout: 15_000 });
		return;
	}

	throw new Error(`${email} not found in the allowlist table to remove`);
}
