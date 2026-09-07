// UI components

// Shared components
export type { HeaderLink } from "./components/header";
export { Header } from "./components/header";
export { Providers } from "./components/providers/providers";
export { ThemeProvider } from "./components/providers/theme-provider";
export type { Icon } from "./components/shared/icons";
export { Icons } from "./components/shared/icons";
export { Logo } from "./components/shared/logo";
export { ModeToggle } from "./components/shared/mode-toggle";
export { UserMenu } from "./components/shared/user-menu";
export {
	Alert,
	AlertAction,
	AlertDescription,
	AlertTitle,
} from "./components/ui/alert";
export {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogMedia,
	AlertDialogOverlay,
	AlertDialogPortal,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "./components/ui/alert-dialog";
export { Badge, badgeVariants } from "./components/ui/badge";
export {
	Breadcrumb,
	BreadcrumbEllipsis,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "./components/ui/breadcrumb";
export { Button, buttonVariants } from "./components/ui/button";
export {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "./components/ui/card";
export type { ChartConfig } from "./components/ui/chart";
export {
	ChartContainer,
	ChartLegend,
	ChartLegendContent,
	ChartStyle,
	ChartTooltip,
	ChartTooltipContent,
} from "./components/ui/chart";
export { Checkbox } from "./components/ui/checkbox";
export {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "./components/ui/collapsible";
export * from "./components/ui/drawer";
export {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuPortal,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "./components/ui/dropdown-menu";
export {
	Field,
	FieldContent,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
	FieldLegend,
	FieldSeparator,
	FieldSet,
	FieldTitle,
} from "./components/ui/field";
export { Input } from "./components/ui/input";
export {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
	InputGroupText,
	InputGroupTextarea,
} from "./components/ui/input-group";
export {
	InsightSectionCard,
	InsightStatCard,
} from "./components/ui/insight-stat-card";
export { Label } from "./components/ui/label";
export { Progress } from "./components/ui/progress";
export { ScrollArea, ScrollBar } from "./components/ui/scroll-area";
export {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectScrollDownButton,
	SelectScrollUpButton,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from "./components/ui/select";
export { Separator } from "./components/ui/separator";
export {
	Sheet,
	SheetClose,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "./components/ui/sheet";
export {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupAction,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarInset,
	SidebarMenu,
	SidebarMenuAction,
	SidebarMenuBadge,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSkeleton,
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
	SidebarProvider,
	SidebarRail,
	SidebarSeparator,
	SidebarTrigger,
	useSidebar,
} from "./components/ui/sidebar";
export { Skeleton } from "./components/ui/skeleton";
export { Toaster } from "./components/ui/sonner";
export { Spinner } from "./components/ui/spinner";
export { Switch } from "./components/ui/switch";
export {
	Table,
	TableBody,
	TableCaption,
	TableCell,
	TableFooter,
	TableHead,
	TableHeader,
	TableRow,
} from "./components/ui/table";
export {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
	tabsListVariants,
} from "./components/ui/tabs";
export { Textarea } from "./components/ui/textarea";
export {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "./components/ui/tooltip";

// Lib
export { cn } from "./lib/utils";

// Brand (dashboard / web chrome only — emails use @sonaraem/email)
export { brandTokens, SonaraemBrandHeader } from "./theme/brand";

// Types
export type { AuthClientForUI } from "./types/auth";
