"use client";

import { Button } from "@app/components/ui/button";
import {
    Card,
    CardContent,
    CardFooter,
    CardHeader,
    CardTitle
} from "@app/components/ui/card";
import Link from "next/link";
import { useTranslations } from "next-intl";

export default function ResourceAccessDenied() {
    const t = useTranslations();

    return (
        <Card className="w-full max-w-md">
            <CardHeader>
                <CardTitle className="text-center text-2xl font-semibold">
                    {t("accessDenied")}
                </CardTitle>
            </CardHeader>
            <CardContent>
                {t("accessDeniedDescription")}
                <div className="text-center mt-4">
                    <Button>
                        <Link href="/">{t("goHome")}</Link>
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
