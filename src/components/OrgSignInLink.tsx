"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Alert, AlertDescription, AlertTitle } from "@app/components/ui/alert";
import { Button } from "@app/components/ui/button";
import { cn } from "@app/lib/cn";
import { Building2 } from "lucide-react";

type OrgSignInLinkProps = {
    href: string;
    linkText: string;
    descriptionText: string;
    primaryActionVariant?: "link" | "button";
    className?: string;
};

const STORAGE_KEY_CLICKED = "orgSignInLinkClicked";
const STORAGE_KEY_ACKNOWLEDGED = "orgSignInTipAcknowledged";

export default function OrgSignInLink({
    href,
    linkText,
    descriptionText,
    primaryActionVariant = "link",
    className
}: OrgSignInLinkProps) {
    const router = useRouter();
    const t = useTranslations();
    const [showTip, setShowTip] = useState(false);

    useEffect(() => {
        // Check if tip was previously acknowledged
        const acknowledged =
            localStorage.getItem(STORAGE_KEY_ACKNOWLEDGED) === "true";
        if (acknowledged) {
            // Clear the clicked flag if tip was acknowledged
            localStorage.removeItem(STORAGE_KEY_CLICKED);
        }
    }, []);

    const handleClick = (e: React.MouseEvent) => {
        e.preventDefault();

        const hasClickedBefore =
            localStorage.getItem(STORAGE_KEY_CLICKED) === "true";
        const isAcknowledged =
            localStorage.getItem(STORAGE_KEY_ACKNOWLEDGED) === "true";

        if (hasClickedBefore && !isAcknowledged) {
            // Second click (or later) - show tip
            setShowTip(true);
        } else {
            // First click - store flag and navigate
            localStorage.setItem(STORAGE_KEY_CLICKED, "true");
            router.push(href);
        }
    };

    const handleContinueAnyway = () => {
        setShowTip(false);
        router.push(href);
    };

    const handleDontShowAgain = () => {
        setShowTip(false);
        localStorage.setItem(STORAGE_KEY_ACKNOWLEDGED, "true");
        localStorage.removeItem(STORAGE_KEY_CLICKED);
    };

    return (
        <>
            {showTip && (
                <Alert className="mb-4 mt-8">
                    <AlertTitle>{t("orgSignInNotice")}</AlertTitle>
                    <AlertDescription className="space-y-3 mt-3">
                        <p>{t("orgSignInTip")}</p>
                        <div className="flex items-center gap-2">
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="w-full"
                                onClick={handleDontShowAgain}
                            >
                                {t("dontShowAgain")}
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="w-full"
                                onClick={handleContinueAnyway}
                            >
                                {t("continueAnyway")}
                            </Button>
                        </div>
                    </AlertDescription>
                </Alert>
            )}
            <div
                className={cn(
                    "",
                    primaryActionVariant === "button" && "gap-3",
                    className
                )}
            >
                {primaryActionVariant === "button" ? (
                    <Button
                        type="button"
                        variant="outline"
                        className="w-full inline-flex items-center gap-2"
                        onClick={handleClick}
                    >
                        <Building2 className="size-4 shrink-0" aria-hidden />
                        <span>{linkText}</span>
                    </Button>
                ) : (
                    <button
                        type="button"
                        onClick={handleClick}
                        className="underline text-inherit bg-transparent border-none p-0 cursor-pointer"
                    >
                        {linkText}
                    </button>
                )}
            </div>
        </>
    );
}
