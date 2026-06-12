"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { useClientContext } from "@app/hooks/useClientContext";
import {
    InfoSection,
    InfoSectionContent,
    InfoSections,
    InfoSectionTitle
} from "@app/components/InfoSection";
import IdpTypeBadge from "@app/components/IdpTypeBadge";
import { getUserDisplayName } from "@app/lib/getUserDisplayName";
import { useTranslations } from "next-intl";

type ClientInfoCardProps = {};

export default function SiteInfoCard({}: ClientInfoCardProps) {
    const { client, updateClient } = useClientContext();
    const t = useTranslations();

    const userDisplayName = getUserDisplayName({
        email: client.userEmail,
        name: client.userName,
        username: client.userUsername
    });

    return (
        <Alert>
            <AlertDescription>
                <InfoSections cols={userDisplayName ? 3 : 2}>
                    <InfoSection>
                        <InfoSectionTitle>{t("name")}</InfoSectionTitle>
                        <InfoSectionContent>{client.name}</InfoSectionContent>
                    </InfoSection>
                    {userDisplayName ? (
                        <InfoSection>
                            <InfoSectionTitle>{t("user")}</InfoSectionTitle>
                            <InfoSectionContent>
                                <div className="flex flex-wrap items-center gap-2">
                                    <span>{userDisplayName}</span>
                                    {(client.userType ?? "internal") !==
                                        "internal" && (
                                        <IdpTypeBadge
                                            type={client.userType ?? "oidc"}
                                            name={
                                                client.idpName?.trim()
                                                    ? client.idpName
                                                    : t("idpNameInternal")
                                            }
                                            variant={
                                                client.idpVariant ?? undefined
                                            }
                                        />
                                    )}
                                </div>
                            </InfoSectionContent>
                        </InfoSection>
                    ) : null}
                    <InfoSection>
                        <InfoSectionTitle>{t("status")}</InfoSectionTitle>
                        <InfoSectionContent>
                            {client.online ? (
                                <div className="flex items-center space-x-2">
                                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                    <span>{t("connected")}</span>
                                </div>
                            ) : (
                                <div className="flex items-center space-x-2">
                                    <div className="w-2 h-2 bg-neutral-500 rounded-full"></div>
                                    <span>{t("disconnected")}</span>
                                </div>
                            )}
                        </InfoSectionContent>
                    </InfoSection>
                </InfoSections>
            </AlertDescription>
        </Alert>
    );
}
