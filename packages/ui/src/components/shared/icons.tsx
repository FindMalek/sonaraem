/**
 * Unified Icons Component
 *
 * Centralizes all icon exports from @tabler/icons-react.
 * All apps and components should import icons from this file for consistency.
 *
 * Usage:
 *   import { Icons } from "@sonaraem/ui";
 *   <Icons.arrowLeft className="..." />
 *   <Icons.spinner className="animate-spin" />
 */

import {
	IconActivity,
	IconAlertCircle,
	IconAlertOctagon,
	IconAlertTriangle,
	IconArrowLeft,
	IconArrowRight,
	IconArrowsSort,
	IconArrowUpRight,
	IconBrain,
	IconBrandSpotifyFilled,
	IconChartBar,
	IconCheck,
	IconChevronDown,
	IconChevronLeft,
	IconChevronRight,
	IconChevronUp,
	IconCircleCheck,
	IconCopy,
	IconDisc,
	IconDots,
	IconExternalLink,
	IconFileText,
	IconHome,
	IconInfoCircle,
	IconKey,
	IconLayoutSidebar,
	IconLoader,
	IconLogout,
	IconMessageCircle,
	IconMinus,
	IconMoon,
	IconMusic,
	IconPlayerPlay,
	IconPlus,
	IconSearch,
	IconSelector,
	IconSettings,
	IconStack2,
	IconSun,
	IconTrash,
	IconUser,
	IconUsers,
	IconX,
} from "@tabler/icons-react";
import type * as React from "react";
import { Logo } from "./logo";

export type Icon = React.ComponentType<React.SVGProps<SVGSVGElement>>;

export const Icons = {
	// UI / actions
	check: IconCheck,
	x: IconX,
	minus: IconMinus,
	plus: IconPlus,
	arrowUpRight: IconArrowUpRight,
	sort: IconArrowsSort,
	search: IconSearch,
	selector: IconSelector,
	copy: IconCopy,
	trash: IconTrash,
	externalLink: IconExternalLink,
	arrowLeft: IconArrowLeft,
	arrowRight: IconArrowRight,

	// Chevrons
	chevronDown: IconChevronDown,
	chevronUp: IconChevronUp,
	chevronLeft: IconChevronLeft,
	chevronRight: IconChevronRight,

	// Status / feedback
	spinner: IconLoader,
	circleCheck: IconCircleCheck,
	infoCircle: IconInfoCircle,
	alertTriangle: IconAlertTriangle,
	alertOctagon: IconAlertOctagon,
	alertCircle: IconAlertCircle,
	activity: IconActivity,

	// Content / media
	music: IconMusic,
	disc: IconDisc,
	fileText: IconFileText,
	brain: IconBrain,
	layers: IconStack2,
	play: IconPlayerPlay,

	// Layout
	layoutSidebar: IconLayoutSidebar,
	dots: IconDots,

	// Theme
	moon: IconMoon,
	sun: IconSun,

	// Brand
	logo: Logo,
	spotify: IconBrandSpotifyFilled,

	// Navigation / App
	settings: IconSettings,
	chart: IconChartBar,
	home: IconHome,
	user: IconUser,
	users: IconUsers,
	logout: IconLogout,
	messageCircle: IconMessageCircle,
	key: IconKey,

	// Loading / pipeline states
	checkCircle: IconCircleCheck,
	circle: IconDisc, // using disc as circle for now
} as const;
