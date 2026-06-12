"use client";

import { useState, useEffect } from "react";
import {
    Credenza,
    CredenzaBody,
    CredenzaClose,
    CredenzaContent,
    CredenzaDescription,
    CredenzaFooter,
    CredenzaHeader,
    CredenzaTitle
} from "@app/components/Credenza";
import { Button } from "@app/components/ui/button";
import { ContactSalesBanner } from "@app/components/ContactSalesBanner";
import { useTranslations } from "next-intl";

export interface DatadogDestinationCredenzaProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    editing: any;
    orgId: string;
    onSaved: () => void;
}

export function DatadogDestinationCredenza({
    open,
    onOpenChange,
    editing,
    orgId,
    onSaved,
}: DatadogDestinationCredenzaProps) {
    const t = useTranslations();

    return (
        <Credenza open={open} onOpenChange={onOpenChange}>
            <CredenzaContent className="sm:max-w-2xl">
                <CredenzaHeader>
                    <CredenzaTitle>
                        {editing
                            ? t("datadogDestEditTitle")
                            : t("datadogDestAddTitle")}
                    </CredenzaTitle>
                    <CredenzaDescription>
                        {editing
                            ? t("datadogDestEditDescription")
                            : t("datadogDestAddDescription")}
                    </CredenzaDescription>
                </CredenzaHeader>

                <CredenzaBody>
                    <ContactSalesBanner />
                </CredenzaBody>

                <CredenzaFooter>
                    <CredenzaClose asChild>
                        <Button variant="outline">{t("cancel")}</Button>
                    </CredenzaClose>
                </CredenzaFooter>
            </CredenzaContent>
        </Credenza>
    );
}
