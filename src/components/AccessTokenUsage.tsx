"use client";

import { useState } from "react";
import { Check, Copy, Info, InfoIcon } from "lucide-react";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useEnvContext } from "@app/hooks/useEnvContext";
import CopyToClipboard from "@app/components/CopyToClipboard";
import CopyTextBox from "@app/components/CopyTextBox";
import { useTranslations } from "next-intl";

interface AccessTokenSectionProps {
    token: string;
    tokenId: string;
    resourceUrl: string;
}

export default function AccessTokenSection({
    token,
    tokenId,
    resourceUrl
}: AccessTokenSectionProps) {
    const { env } = useEnvContext();

    const [copied, setCopied] = useState<string | null>(null);

    const copyToClipboard = (text: string, type: string) => {
        navigator.clipboard.writeText(text);
        setCopied(type);
        setTimeout(() => setCopied(null), 2000);
    };

    const t = useTranslations();

    return (
        <>
            <div className="flex items-start space-x-2">
                <p className="text-sm text-muted-foreground">
                    {t("shareTokenDescription")}
                </p>
            </div>

            <Tabs defaultValue="token" className="w-full mt-4">
                <TabsList className="grid grid-cols-2">
                    <TabsTrigger value="token">{t("accessToken")}</TabsTrigger>
                    <TabsTrigger value="usage">
                        {t("usageExamples")}
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="token" className="space-y-4">
                    <div className="space-y-1">
                        <div className="font-semibold">{t("tokenId")}</div>
                        <CopyToClipboard text={tokenId} isLink={false} />
                    </div>

                    <div className="space-y-1">
                        <div className="font-semibold">{t("token")}</div>
                        <CopyToClipboard text={token} isLink={false} />
                    </div>
                </TabsContent>

                <TabsContent value="usage" className="space-y-4">
                    <div className="space-y-2">
                        <h3 className="text-sm font-medium">
                            {t("requestHeades")}
                        </h3>
                        <CopyTextBox
                            text={`${env.server.resourceAccessTokenHeadersId}: ${tokenId}
${env.server.resourceAccessTokenHeadersToken}: ${token}`}
                        />
                    </div>

                    <div className="space-y-2">
                        <h3 className="text-sm font-medium">
                            {t("queryParameter")}
                        </h3>
                        <CopyTextBox
                            text={`${resourceUrl}?${env.server.resourceAccessTokenParam}=${tokenId}.${token}`}
                        />
                    </div>

                    <Alert variant="neutral">
                        <InfoIcon className="h-4 w-4" />
                        <AlertTitle className="font-semibold">
                            {t("importantNote")}
                        </AlertTitle>
                        <AlertDescription>
                            {t("shareImportantDescription")}
                        </AlertDescription>
                    </Alert>
                </TabsContent>
            </Tabs>

            <div className="text-sm text-muted-foreground mt-4">
                {t("shareTokenSecurety")}
            </div>
        </>
    );
}
