"use client";

import {
    SidePanel,
    SidePanelBody,
    SidePanelContent,
    SidePanelDescription,
    SidePanelFooter,
    SidePanelHeader,
    SidePanelTitle
} from "@app/components/SidePanel";
import { Button } from "@app/components/ui/button";
import { getLauncherResourceAdminHref } from "@app/lib/launcherResourceAdminHref";
import type { LauncherResource } from "@server/routers/launcher/types";
import { useTranslations } from "next-intl";
import Link from "next/link";

type LauncherResourcePanelProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    resource: LauncherResource | null;
    orgId: string;
    isAdmin: boolean;
};

export function LauncherResourcePanel({
    open,
    onOpenChange,
    resource,
    orgId,
    isAdmin
}: LauncherResourcePanelProps) {
    const t = useTranslations();

    return (
        <SidePanel open={open} onOpenChange={onOpenChange}>
            <SidePanelContent>
                <SidePanelHeader>
                    <SidePanelTitle>{resource?.name ?? ""}</SidePanelTitle>
                    <SidePanelDescription>
                        {t("resourceLauncherResourceDetailsDescription")}
                    </SidePanelDescription>
                </SidePanelHeader>
                <SidePanelBody />
                <SidePanelFooter>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                    >
                        {t("close")}
                    </Button>
                    {isAdmin && resource ? (
                        <Button variant="outline" asChild>
                            <Link
                                href={getLauncherResourceAdminHref(
                                    orgId,
                                    resource
                                )}
                            >
                                {t("resourceLauncherViewAsAdmin")}
                            </Link>
                        </Button>
                    ) : null}
                </SidePanelFooter>
            </SidePanelContent>
        </SidePanel>
    );
}
