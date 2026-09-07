/** Admin app routes (internal tool) */
export const ADMIN_ROUTES = {
	overview: {
		path: "/",
		label: "Overview",
		icon: "home",
		isNav: true,
	},
	waitlist: {
		path: "/waitlist",
		label: "Waitlist",
		icon: "users",
		isNav: true,
	},
	users: {
		path: "/users",
		label: "Users",
		icon: "person",
		isNav: true,
	},
	feedback: {
		path: "/feedback",
		label: "Feedback",
		icon: "message",
		isNav: true,
	},
	spotifyLoginRelay: {
		path: "/spotify-login-relay",
		label: "Spotify Login",
		icon: "key",
		isNav: true,
	},
	spotifyAllowlistQueue: {
		path: "/spotify-allowlist-queue",
		label: "Allowlist Queue",
		icon: "activity",
		isNav: true,
	},
	costs: {
		path: "/costs",
		label: "Costs",
		icon: "chart",
		isNav: true,
	},
} as const;

export type AdminRoutes = typeof ADMIN_ROUTES;
export type AdminRouteKey = keyof AdminRoutes;

export const ADMIN_NAV_ITEMS = Object.entries(ADMIN_ROUTES)
	.filter(([, route]) => route.isNav)
	.map(([key, route]) => ({ key, ...route }));

/** Web app routes (marketing, landing, etc.) */
export const WEB_ROUTES = {
	home: {
		path: "/",
		label: "Waitlist",
	},
	privacy: {
		path: "/privacy",
		label: "Privacy Policy",
	},
	terms: {
		path: "/terms",
		label: "Terms of Service",
	},
} as const;

export type WebRoutes = typeof WEB_ROUTES;
export type WebRouteKey = keyof WebRoutes;

/** Dashboard app routes */
export const DASHBOARD_ROUTES = {
	overview: {
		path: "/",
		label: "Overview",
		icon: "home",
		isNav: true,
	},
	pipeline: {
		path: "/pipeline",
		label: "Pipeline",
		icon: "play",
		isNav: true,
	},
	tracks: {
		path: "/tracks",
		label: "Tracks",
		icon: "music",
		isNav: true,
		children: {
			detail: {
				path: "/tracks/:id",
				label: "Track Detail",
				hideBottomNav: true,
				makePath: (id: string) => `/tracks/${id}`,
			},
		},
	},
	clusters: {
		path: "/clusters",
		label: "Clusters",
		icon: "layers",
		isNav: true,
	},
	playlists: {
		path: "/playlists",
		label: "Playlists",
		icon: "disc",
		isNav: true,
		children: {
			detail: {
				path: "/playlists/:id",
				label: "Playlist Detail",
				hideBottomNav: true,
				makePath: (id: string) => `/playlists/${id}`,
			},
		},
	},
	insights: {
		path: "/insights",
		label: "Insights",
		icon: "chart",
		isNav: true,
	},
	settings: {
		path: "/settings",
		label: "Settings",
		icon: "settings",
		isNav: true,
		children: {
			notifications: {
				path: "/settings/notifications",
				label: "Notifications",
			},
		},
	},
	feedback: {
		path: "/feedback",
		label: "Feedback",
		isNav: false,
	},
	onboarding: {
		index: {
			path: "/welcome",
			label: "Onboarding",
		},
		introduction: {
			path: "/introduction",
			label: "Introduction",
		},
		sync: {
			path: "/sync",
			label: "Sync",
		},
		isNav: false,
	},
} as const;

export type DashboardRoutes = typeof DASHBOARD_ROUTES;
export type DashboardRouteKey = keyof DashboardRoutes;

/** Dashboard routes that appear in the main navigation */
export const DASHBOARD_NAV_ITEMS = Object.entries(DASHBOARD_ROUTES)
	.filter(([, route]) => route.isNav)
	.map(([key, route]) => ({ key, ...route }));

/** Dashboard routes that appear in the mobile bottom navigation (icon-only bar; use ariaLabel for SR / tooltips). */
export const DASHBOARD_MOBILE_NAV_ITEMS = [
	{
		...DASHBOARD_ROUTES.overview,
		key: "overview",
		label: "Dashboard",
		ariaLabel: "Home",
	},
	{
		...DASHBOARD_ROUTES.playlists,
		key: "playlists",
		ariaLabel: "Playlists",
	},
	{
		...DASHBOARD_ROUTES.insights,
		key: "insights",
		ariaLabel: "Insights",
	},
	{
		...DASHBOARD_ROUTES.settings,
		key: "settings",
		ariaLabel: "Settings",
	},
] as const;
