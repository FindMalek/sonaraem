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

export type OrganizeWeeklyDigestEmailProps = {
	dashboardPlaylistsUrl: string;
	recipientName?: string | null;
	createdCount: number;
	updatedCount: number;
	tracksOrganized: number;
	newPlaylists: Array<{
		name: string;
		trackCount?: number | null;
	}>;
};

export function OrganizeWeeklyDigestEmail({
	dashboardPlaylistsUrl = "http://127.0.0.1:3003/playlists",
	recipientName,
	createdCount,
	updatedCount,
	tracksOrganized,
	newPlaylists = [],
}: OrganizeWeeklyDigestEmailProps) {
	const themeClasses = getEmailThemeClasses();
	const lightStyles = getEmailInlineStyles("light");
	const safeName =
		typeof recipientName === "string" && recipientName.trim().length > 0
			? recipientName
			: "there";

	return (
		<EmailThemeProvider
			preview={<Preview>Your weekly playlist digest</Preview>}
		>
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
						Your weekly digest, {safeName}
					</Heading>
					<Text
						className={`mb-[24px] text-center text-[14px] leading-[24px] ${themeClasses.mutedText}`}
						style={{ color: lightStyles.mutedText.color }}
					>
						This week: {createdCount} new playlist
						{createdCount === 1 ? "" : "s"}, {updatedCount} playlist
						{updatedCount === 1 ? "" : "s"} updated, {tracksOrganized} tracks
						organized.
					</Text>

					{newPlaylists.map((playlist, index) => (
						<Section
							key={`${playlist.name}-${index}`}
							className={`border-t border-solid py-[10px] ${themeClasses.border}`}
							style={{ borderColor: lightStyles.container.borderColor }}
						>
							<Text
								className={`m-0 font-medium text-[14px] ${themeClasses.text}`}
								style={{ color: lightStyles.text.color }}
							>
								{index + 1}. {playlist.name}
							</Text>
							<Text
								className={`m-0 mt-[4px] text-[12px] ${themeClasses.mutedText}`}
								style={{ color: lightStyles.mutedText.color }}
							>
								{playlist.trackCount && playlist.trackCount > 0
									? `${playlist.trackCount} tracks`
									: "Ready to play"}
							</Text>
						</Section>
					))}

					<Section className="mt-[40px] mb-[40px] text-center">
						<Button href={dashboardPlaylistsUrl}>View your playlists</Button>
					</Section>

					<Footer complianceText="You are receiving this transactional email because your weekly organize run completed successfully." />
				</Container>
			</Body>
		</EmailThemeProvider>
	);
}

OrganizeWeeklyDigestEmail.PreviewProps = {
	dashboardPlaylistsUrl: "http://127.0.0.1:3003/playlists",
	recipientName: "Malek",
	createdCount: 2,
	updatedCount: 4,
	tracksOrganized: 156,
	newPlaylists: [
		{ name: "Neon Night Drive", trackCount: 24 },
		{ name: "Focused Flow", trackCount: 18 },
	],
} satisfies OrganizeWeeklyDigestEmailProps;

export default OrganizeWeeklyDigestEmail;
