"use client";

import { waitlistSignupInput } from "@sonaraem/common/schemas";
import {
	Button,
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
			onSubmit: waitlistSignupInput.extend({ website: z.string() }),
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
									onChange={(e) => field.handleChange(e.target.value)}
									aria-invalid={isInvalid}
								/>
								{isInvalid && <FieldError errors={field.state.meta.errors} />}
							</Field>
						);
					}}
				/>

				<form.Field
					name="spotifyEmail"
					children={(field) => {
						const isInvalid =
							field.state.meta.isTouched && !field.state.meta.isValid;
						return (
							<Field data-invalid={isInvalid}>
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
									May differ from the email above — Spotify accounts via Google,
									Apple, or Facebook commonly use a different one.
								</FieldDescription>
								{isInvalid && <FieldError errors={field.state.meta.errors} />}
							</Field>
						);
					}}
				/>

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
