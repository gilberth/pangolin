"use client";

import React, { useState, useEffect, type ReactNode, useEffectEvent } from "react";
import { Card, CardContent } from "@app/components/ui/card";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEnvContext } from "@app/hooks/useEnvContext";

type DismissableBannerProps = {
    storageKey: string;
    version: number;
    title: string;
    titleIcon: ReactNode;
    description: string;
    children?: ReactNode;
    dismissable?: boolean;
};

export const DismissableBanner = ({
    storageKey,
    version,
    title,
    titleIcon,
    description,
    children,
    dismissable = true
}: DismissableBannerProps) => {
    const [isDismissed, setIsDismissed] = useState(true);
    const t = useTranslations();

    const { env } = useEnvContext();

    if (env.flags.disableProductHelpBanners) {
        return null;
    }

    useEffect(() => {
        const dismissedData = localStorage.getItem(storageKey);
        if (dismissedData) {
            try {
                const parsed = JSON.parse(dismissedData);
                // If version matches, use the dismissed state
                if (parsed.version === version) {
                    setIsDismissed(parsed.dismissed);
                } else {
                    // Version changed, show the banner again
                    setIsDismissed(false);
                }
            } catch {
                // If parsing fails, check for old format (just "true" string)
                if (dismissedData === "true") {
                    // Old format, show banner again for new version
                    setIsDismissed(false);
                } else {
                    setIsDismissed(true);
                }
            }
        } else {
            setIsDismissed(false);
        }
    }, [storageKey, version]);

    const handleDismiss = () => {
        setIsDismissed(true);
        localStorage.setItem(
            storageKey,
            JSON.stringify({ dismissed: true, version })
        );
    };

    if (dismissable && isDismissed) {
        return null;
    }

    return (
        <Card className="mb-6 relative border-primary/30 bg-linear-to-br from-primary/10 via-background to-background overflow-hidden">
            {dismissable && (
                <button
                    onClick={handleDismiss}
                    className="absolute top-3 right-3 z-10 p-1.5 rounded-md hover:bg-background/80 transition-colors cursor-pointer"
                    aria-label={t("dismiss")}
                >
                    <X className="w-4 h-4 text-muted-foreground" />
                </button>
            )}
            <CardContent className="p-6">
                <div className="flex flex-col lg:flex-row lg:items-center gap-6">
                    <div className="flex-1 space-y-2 min-w-0">
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                            {titleIcon}
                            {title}
                        </h3>
                        <p className="text-sm text-muted-foreground max-w-4xl">
                            {description}
                        </p>
                    </div>
                    {children && (
                        <div className="flex flex-wrap gap-3 lg:shrink-0 lg:justify-end">
                            {children}
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
};

export default DismissableBanner;
