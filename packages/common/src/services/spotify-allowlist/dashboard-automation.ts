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

// "Full Name" and "Email" are always-visible inline form fields, not a
// dialog that opens on click — "Add user" is just that form's submit button,
// and it never hides on success, so the new row rendering in the table is
// the only real confirmation signal.
// "Full Name" has no visible `required` attribute, but we fill it anyway to be safe — the local part of the email is a fine placeholder.
export async function addAllowlistUser(
	page: Page,
	email: string,
): Promise<void> {
	await page.locator("#name").fill(email.split("@")[0] ?? email);
	await page.locator("#email").fill(email);
	await page.locator(`form button[type="submit"]`).click();
	// The table can render empty mid-refetch right after — wait for the row itself.
	await page
		.locator(`${TABLE_SELECTOR} tbody tr`)
		.filter({ hasText: email })
		.first()
		.waitFor({ state: "visible", timeout: 15_000 });
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
