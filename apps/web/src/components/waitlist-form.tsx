"use client";

import { waitlistSignupInput } from "@sonaraem/common/schemas";
import {
	Button,
	Checkbox,
	Collapsible,
	CollapsibleContent,
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
	Icons,
	Input,
} from "@sonaraem/ui";
import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { orpc } from "@/utils/orpc";

export function WaitlistForm() {
	const [submitted, setSubmitted] = useState(false);
	// Checked by default — most people's Spotify account uses the same email
	// they'd sign up with. Same pattern as "billing address same as shipping":
	// unchecking reveals a second field instead of showing both up front.
	const [sameEmail, setSameEmail] = useState(true);

	const signup = useMutation(
		orpc.waitlist.signup.mutationOptions({
			onSuccess: () => setSubmitted(true),
			onError: () => {
				toast.error("Could not join the waitlist. Please try again.");
			},
		}),
	);

	const form = useForm({
		defaultValues: { email: "", spotifyEmail: "", website: "" },
		validators: {
			// spotifyEmail is optional on the shared API schema (the backend
			// defaults it to `email`), but this form always keeps a real value
			// in it (synced while "same as above" is checked) — re-require it
			// here so the field's own validity state stays meaningful.
			onSubmit: waitlistSignupInput.extend({
				spotifyEmail: z.string().trim().email(),
				website: z.string(),
			}),
		},
		onSubmit: async ({ value }) => {
			await signup.mutateAsync(value);
		},
	});

	if (submitted) {
		return (
			<p className="text-foreground text-sm">
				You're on the list — check your inbox for confirmation.
			</p>
		);
	}

	return (
		<form
			onSubmit={(e) => {
				e.preventDefault();
				form.handleSubmit();
			}}
		>
			<FieldGroup>
				<form.Field
					name="email"
					children={(field) => {
						const isInvalid =
							field.state.meta.isTouched && !field.state.meta.isValid;
						return (
							<Field data-invalid={isInvalid}>
								<FieldLabel htmlFor={field.name}>Email address</FieldLabel>
								<Input
									id={field.name}
									name={field.name}
									type="email"
									placeholder="you@example.com"
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => {
										field.handleChange(e.target.value);
										// Keep the hidden spotifyEmail field in sync so it's
										// still a valid submission while the second input is
										// collapsed — the checkbox is the single source of
										// truth for "are these the same".
										if (sameEmail) {
											form.setFieldValue("spotifyEmail", e.target.value);
										}
									}}
									aria-invalid={isInvalid}
								/>
								{isInvalid && <FieldError errors={field.state.meta.errors} />}
							</Field>
						);
					}}
				/>

				<div className="flex items-center gap-2">
					<Checkbox
						id="same-email"
						checked={sameEmail}
						onCheckedChange={(checked) => {
							const isSame = !!checked;
							setSameEmail(isSame);
							if (isSame) {
								form.setFieldValue("spotifyEmail", form.getFieldValue("email"));
							}
						}}
					/>
					<label htmlFor="same-email" className="text-muted-foreground text-sm">
						This is also my Spotify account email
					</label>
				</div>

				<Collapsible open={!sameEmail}>
					<CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
						<form.Field
							name="spotifyEmail"
							children={(field) => {
								const isInvalid =
									field.state.meta.isTouched && !field.state.meta.isValid;
								return (
									<Field data-invalid={isInvalid} className="pt-4">
										<FieldLabel htmlFor={field.name}>
											Spotify account email
										</FieldLabel>
										<Input
											id={field.name}
											name={field.name}
											type="email"
											placeholder="spotify@example.com"
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											aria-invalid={isInvalid}
										/>
										<FieldDescription>
											Spotify accounts via Google, Apple, or Facebook commonly
											use a different email than the one above.
										</FieldDescription>
										{isInvalid && (
											<FieldError errors={field.state.meta.errors} />
										)}
									</Field>
								);
							}}
						/>
					</CollapsibleContent>
				</Collapsible>

				<form.Field name="website">
					{(field) => (
						<div className="absolute h-0 w-0 overflow-hidden opacity-0">
							<FieldLabel htmlFor={field.name}>Website</FieldLabel>
							<Input
								id={field.name}
								name={field.name}
								type="text"
								tabIndex={-1}
								autoComplete="off"
								value={field.state.value}
								onChange={(e) => field.handleChange(e.target.value)}
								aria-hidden="true"
							/>
						</div>
					)}
				</form.Field>

				<form.Subscribe selector={(state) => state.isSubmitting}>
					{(isSubmitting) => (
						<Button
							type="submit"
							disabled={isSubmitting}
							isLoading={isSubmitting}
						>
							Join waitlist
							<Icons.arrowRight />
						</Button>
					)}
				</form.Subscribe>
			</FieldGroup>
		</form>
	);
}
