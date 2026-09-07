"use client";

import { ADMIN_NAV_ITEMS } from "@sonaraem/common/utils/routes";
import {
	Button,
	Icons,
	ModeToggle,
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarSeparator,
} from "@sonaraem/ui";
import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { authClient } from "@/shared/api/auth-client";

const NAV_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
	home: Icons.home,
	users: Icons.users,
	person: Icons.user,
	message: Icons.messageCircle,
	chart: Icons.chart,
	key: Icons.key,
};

// TS can't distribute Next's typed-route generic over a mapped union prop — one boundary cast here, not per-render.
const NAV_ITEMS = ADMIN_NAV_ITEMS as ReadonlyArray<
	(typeof ADMIN_NAV_ITEMS)[number] & { path: Route }
>;

export function AdminSidebar() {
	const pathname = usePathname();
	const router = useRouter();

	async function handleSignOut() {
		await authClient.signOut();
		router.push("/login");
	}

	return (
		<Sidebar collapsible="none" className="sticky top-0 h-svh">
			<SidebarHeader className="h-14 justify-center border-b">
				<div className="flex items-center gap-2.5 px-2">
					<div className="flex size-7 shrink-0 items-center justify-center bg-primary text-primary-foreground">
						<Icons.logo className="size-4" />
					</div>
					<div className="leading-none">
						<p className="font-semibold text-sm">Sonaraem</p>
						<p className="text-[10px] text-muted-foreground">Admin Panel</p>
					</div>
				</div>
			</SidebarHeader>

			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupLabel>Navigation</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							{NAV_ITEMS.map((item) => {
								const Icon = NAV_ICONS[item.icon] ?? Icons.home;
								const isActive =
									item.path === "/"
										? pathname === "/"
										: pathname.startsWith(item.path);
								return (
									<SidebarMenuItem key={item.key}>
										<SidebarMenuButton asChild isActive={isActive}>
											<Link href={item.path}>
												<Icon />
												<span>{item.label}</span>
											</Link>
										</SidebarMenuButton>
									</SidebarMenuItem>
								);
							})}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>

			<SidebarSeparator />

			<SidebarFooter>
				<div className="flex items-center justify-between px-2 py-1">
					<ModeToggle variant="immediate" />
					<Button
						type="button"
						variant="ghost"
						size="xs"
						onClick={handleSignOut}
						className="h-auto gap-1.5 p-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
					>
						<Icons.logout className="size-3.5" />
						Sign out
					</Button>
				</div>
			</SidebarFooter>
		</Sidebar>
	);
}
