"use client";

import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList
} from "@app/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger
} from "@app/components/ui/popover";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger
} from "@app/components/ui/tooltip";
import { Badge } from "@app/components/ui/badge";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { cn } from "@app/lib/cn";
import { ListUserOrgsResponse } from "@server/routers/org";
import { Check, ChevronsUpDown, Plus, Building2, Users } from "lucide-react";
import { Button } from "@app/components/ui/button";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useUserContext } from "@app/hooks/useUserContext";
import { useTranslations } from "next-intl";
import { build } from "@server/build";

interface OrgSelectorProps {
    orgId?: string;
    orgs?: ListUserOrgsResponse["orgs"];
    isCollapsed?: boolean;
}

export function OrgSelector({
    orgId,
    orgs,
    isCollapsed = false
}: OrgSelectorProps) {
    const { user } = useUserContext();
    const [open, setOpen] = useState(false);
    const router = useRouter();
    const pathname = usePathname();
    const { env } = useEnvContext();
    const t = useTranslations();

    const selectedOrg = orgs?.find((org) => org.orgId === orgId);

    let canCreateOrg = !env.flags.disableUserCreateOrg || user.serverAdmin;
    if (build === "saas" && user.type !== "internal") {
        canCreateOrg = false;
    }

    const sortedOrgs = useMemo(() => {
        if (!orgs?.length) return orgs ?? [];
        return [...orgs].sort((a, b) => {
            const aPrimary = Boolean(a.isPrimaryOrg);
            const bPrimary = Boolean(b.isPrimaryOrg);
            if (aPrimary && !bPrimary) return -1;
            if (!aPrimary && bPrimary) return 1;
            return 0;
        });
    }, [orgs]);

    const orgSelectorContent = (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <div
                    role="combobox"
                    aria-expanded={open}
                    className={cn(
                        "cursor-pointer transition-colors",
                        isCollapsed
                            ? "w-full h-16 flex items-center justify-center hover:bg-sidebar-accent dark:hover:bg-sidebar-accent/50"
                            : "w-full px-5 py-4 hover:bg-sidebar-accent dark:hover:bg-sidebar-accent/50"
                    )}
                >
                    {isCollapsed ? (
                        <Building2 className="h-4 w-4" />
                    ) : (
                        <div className="flex items-center justify-between w-full min-w-0">
                            <div className="flex items-center min-w-0 flex-1">
                                <div className="flex flex-col items-start min-w-0 flex-1 gap-1">
                                    <span className="font-semibold">
                                        {t("org")}
                                    </span>
                                    <span className="text-sm text-muted-foreground truncate w-full text-left">
                                        {selectedOrg?.name || t("noneSelected")}
                                    </span>
                                </div>
                            </div>
                            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50 ml-2" />
                        </div>
                    )}
                </div>
            </PopoverTrigger>
            <PopoverContent
                className="w-[320px] p-0 ml-4 flex flex-col relative overflow-visible"
                align="start"
                sideOffset={12}
            >
                <Command className="rounded-lg border-0 flex-1 min-h-0">
                    <CommandInput
                        placeholder={t("searchPlaceholder")}
                        className="border-0 focus:ring-0 h-9 rounded-b-none"
                    />
                    <CommandList className="max-h-[280px]">
                        <CommandEmpty className="py-4 text-center">
                            <div className="text-muted-foreground text-sm">
                                {t("orgNotFound2")}
                            </div>
                        </CommandEmpty>
                        <CommandGroup className="p-1" heading={t("orgs")}>
                            {sortedOrgs.map((org) => (
                                <CommandItem
                                    key={org.orgId}
                                    onSelect={() => {
                                        setOpen(false);
                                        const newPath = pathname.includes(
                                            "/settings/"
                                        )
                                            ? pathname.replace(
                                                  /^\/[^/]+/,
                                                  `/${org.orgId}`
                                              )
                                            : `/${org.orgId}`;
                                        router.push(newPath);
                                    }}
                                    className="mx-1 rounded-md py-1.5 h-auto min-h-0"
                                >
                                    <div className="flex items-center justify-center w-6 h-6 rounded-md bg-muted mr-2.5 flex-shrink-0">
                                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                                    </div>
                                    <div className="flex flex-col flex-1 min-w-0 gap-0.5">
                                        <span className="font-medium truncate text-sm">
                                            {org.name}
                                        </span>
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="text-xs text-muted-foreground font-mono truncate">
                                                {org.orgId}
                                            </span>
                                            {org.isPrimaryOrg && (
                                                <Badge
                                                    variant="outline"
                                                    className="shrink-0 text-[10px] px-1.5 py-0 font-medium ml-auto"
                                                >
                                                    {t("primary")}
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                    <Check
                                        className={cn(
                                            "h-4 w-4 text-primary flex-shrink-0",
                                            orgId === org.orgId
                                                ? "opacity-100"
                                                : "opacity-0"
                                        )}
                                    />
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
                {canCreateOrg && (
                    <div className="p-2 border-t border-border">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start h-8 font-normal text-muted-foreground"
                            onClick={() => {
                                setOpen(false);
                                router.push("/setup");
                            }}
                        >
                            <Plus className="h-3.5 w-3.5 mr-2" />
                            {t("setupNewOrg")}
                        </Button>
                    </div>
                )}
            </PopoverContent>
        </Popover>
    );

    if (isCollapsed) {
        return (
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        {orgSelectorContent}
                    </TooltipTrigger>
                    <TooltipContent side="right" sideOffset={8}>
                        <div className="text-center">
                            <p className="font-medium">
                                {selectedOrg?.name || t("noneSelected")}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                {t("org")}
                            </p>
                        </div>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        );
    }

    return orgSelectorContent;
}
