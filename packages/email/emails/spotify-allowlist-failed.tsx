import {
	Body,
	Container,
	Heading,
	Preview,
	Section,
	Text,
} from "@react-email/components";
import { Footer } from "../components/footer";
import { Logo } from "../components/logo";
import {
	Button,
	EmailThemeProvider,
	getEmailInlineStyles,
	getEmailThemeClasses,
} from "../components/theme";

export type SpotifyAllowlistFailedEmailProps = {
	triggerRunsUrl: string;
	targetEmail: string;
	action: "add" | "remove";
	errorMessage: string;
};

export function SpotifyAllowlistFailedEmail({
	triggerRunsUrl = "https://cloud.trigger.dev",
	targetEmail,
	action,
	errorMessage,
}: SpotifyAllowlistFailedEmailProps) {
	const themeClasses = getEmailThemeClasses();
	const lightStyles = getEmailInlineStyles("light");
	const preview = `Spotify allowlist ${action} failed for ${targetEmail}`;

	return (
		<EmailThemeProvider preview={<Preview>{preview}</Preview>}>
			<Body
				className={`mx-auto my-auto font-sans ${themeClasses.body}`}
				style={lightStyles.body}
			>
				<Container
					className={`mx-auto my-[40px] max-w-[600px] p-[20px] ${themeClasses.container}`}
					style={{
						borderStyle: "solid",
						borderWidth: 1,
						borderColor: lightStyles.container.borderColor,
					}}
				>
					<Logo />
					<Heading
						className={`mt-[24px] mb-[8px] text-center font-normal font-serif text-[21px] ${themeClasses.heading}`}
						style={{ color: lightStyles.text.color }}
					>
						Spotify allowlist automation failed
					</Heading>
					<Text
						className={`mb-[8px] text-center text-[14px] leading-[24px] ${themeClasses.mutedText}`}
						style={{ color: lightStyles.mutedText.color }}
					>
						Could not {action} <strong>{targetEmail}</strong> on the Spotify
						Developer Dashboard allowlist. This usually means the saved session
						expired — reseed it with the bootstrap script, or check the run logs
						if the dashboard's layout changed.
					</Text>
					<Text
						className={`mb-[24px] text-center text-[13px] leading-[20px] ${themeClasses.mutedText}`}
						style={{ color: lightStyles.mutedText.color }}
					>
						{errorMessage}
					</Text>

					<Section className="mt-[40px] mb-[40px] text-center">
						<Button href={triggerRunsUrl}>Open Trigger.dev runs</Button>
					</Section>

					<Footer complianceText="You are receiving this email because you are the Sonaraem admin." />
				</Container>
			</Body>
		</EmailThemeProvider>
	);
}

SpotifyAllowlistFailedEmail.PreviewProps = {
	triggerRunsUrl: "https://cloud.trigger.dev",
	targetEmail: "someone@example.com",
	action: "add",
	errorMessage:
		"Saved session didn't reach the Users table — it's likely expired",
} satisfies SpotifyAllowlistFailedEmailProps;

export default SpotifyAllowlistFailedEmail;
