"use client";

import { Button } from "@app/components/ui/button";
import { useTranslations } from "next-intl";
import { RefreshCw } from "lucide-react";

type LauncherRefreshButtonProps = {
    onRefresh: () => void;
    isRefreshing: boolean;
};

export function LauncherRefreshButton({
    onRefresh,
    isRefreshing
}: LauncherRefreshButtonProps) {
    const t = useTranslations();

    return (
        <Button
            variant="outline"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="shrink-0"
        >
            <RefreshCw
                className={`mr-0 sm:mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
            />
            <span className="hidden sm:inline">{t("refresh")}</span>
        </Button>
    );
}
