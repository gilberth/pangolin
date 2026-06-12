"use client";

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
import { PaidFeaturesAlert } from "@app/components/PaidFeaturesAlert";
import {
    SettingsSection,
    SettingsSectionBody,
    SettingsSectionDescription,
    SettingsSectionHeader,
    SettingsSectionTitle
} from "@app/components/Settings";
import UptimeBar from "@app/components/UptimeBar";
import { TagInput, type Tag } from "@app/components/tags/tag-input";
import { Button } from "@app/components/ui/button";
import { Input } from "@app/components/ui/input";
import { Label } from "@app/components/ui/label";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { usePaidStatus } from "@app/hooks/usePaidStatus";
import { toast } from "@app/hooks/useToast";
import { createApiClient, formatAxiosError } from "@app/lib/api";
import { orgQueries } from "@app/lib/queries";
import { tierMatrix } from "@server/lib/billing/tierMatrix";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BellPlus, BellRing } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { RolesSelector } from "./roles-selector";
import { UsersSelector } from "./users-selector";

interface UptimeAlertSectionProps {
    orgId: string;
    siteId?: number;
    startingName?: string;
    resourceId?: number;
    days?: number;
}

export default function UptimeAlertSection({
    orgId,
    siteId,
    startingName,
    resourceId,
    days = 90
}: UptimeAlertSectionProps) {
    const t = useTranslations();
    const envContext = useEnvContext();
    const api = createApiClient(envContext);
    const queryClient = useQueryClient();
    const { isPaidUser } = usePaidStatus();
    const isPaid = isPaidUser(tierMatrix.alertingRules);
    const { env } = envContext;

    const [open, setOpen] = useState(false);
    const [name, setName] = useState(
        `${siteId ? t("site") : t("resource")} ${startingName} ${t("alertLabel")}`
    );
    const [userTags, setUserTags] = useState<Tag[]>([]);
    const [roleTags, setRoleTags] = useState<Tag[]>([]);
    const [emailTags, setEmailTags] = useState<Tag[]>([]);

    const [activeEmailTagIndex, setActiveEmailTagIndex] = useState<
        number | null
    >(null);
    const [loading, setLoading] = useState(false);

    const { data: alertRules, isLoading: alertRulesLoading } = useQuery({
        ...orgQueries.alertRulesForSource({ orgId, siteId, resourceId }),
        enabled: isPaid
    });

    const hasRules = (alertRules?.length ?? 0) > 0;

    async function handleSubmit() {
        if (
            userTags.length === 0 &&
            roleTags.length === 0 &&
            emailTags.length === 0
        ) {
            toast({
                variant: "destructive",
                title: t("uptimeAlertNoRecipients"),
                description: t("uptimeAlertNoRecipientsDescription")
            });
            return;
        }

        setLoading(true);
        try {
            await api.put(`/org/${orgId}/alert-rule`, {
                name,
                eventType: siteId ? "site_toggle" : "resource_toggle",
                enabled: true,
                cooldownSeconds: 0, // default to 0 here because we dont want the extra confusion
                siteIds: siteId ? [siteId] : [],
                healthCheckIds: [],
                resourceIds: resourceId ? [resourceId] : [],
                userIds: userTags.map((tag) => tag.id),
                roleIds: roleTags.map((tag) => Number(tag.id)),
                emails: emailTags.map((tag) => tag.text),
                webhookActions: []
            });

            toast({
                title: t("uptimeAlertCreated"),
                description: t("uptimeAlertCreatedDescription")
            });

            setOpen(false);
            setName(t("uptimeSectionTitle"));
            setUserTags([]);
            setRoleTags([]);
            setEmailTags([]);

            queryClient.invalidateQueries({
                queryKey: orgQueries.alertRulesForSource({
                    orgId,
                    siteId,
                    resourceId
                }).queryKey
            });
        } catch (e) {
            toast({
                variant: "destructive",
                title: t("uptimeAlertCreateFailed"),
                description: formatAxiosError(e, t("errorOccurred"))
            });
        }
        setLoading(false);
    }

    const rulesListSearch = new URLSearchParams();
    if (siteId != null) rulesListSearch.set("siteId", String(siteId));
    if (resourceId != null)
        rulesListSearch.set("resourceId", String(resourceId));
    const rulesListHref = `/${orgId}/settings/alerting/rules${
        rulesListSearch.toString() ? `?${rulesListSearch}` : ""
    }`;

    const alertButton = alertRulesLoading ? (
        <Button variant="outline" type="button" loading aria-busy="true">
            <BellPlus className="size-4 mr-2" />
            {t("uptimeAddAlert")}
        </Button>
    ) : hasRules ? (
        <Button variant="outline" asChild>
            <Link href={rulesListHref}>
                <BellRing className="size-4 mr-2" />
                {t("uptimeViewAlerts")}
            </Link>
        </Button>
    ) : (
        <Button variant="outline" onClick={() => setOpen(true)}>
            <BellPlus className="size-4 mr-2" />
            {t("uptimeAddAlert")}
        </Button>
    );

    return (
        <>
            <SettingsSection>
                <SettingsSectionHeader>
                    <div className="flex justify-between items-start">
                        <div>
                            <SettingsSectionTitle>
                                {t("uptimeSectionTitle")}
                            </SettingsSectionTitle>
                            <SettingsSectionDescription>
                                {t("uptimeSectionDescription", { days })}
                            </SettingsSectionDescription>
                        </div>
                        {!env.flags.disableEnterpriseFeatures
                            ? alertButton
                            : null}
                    </div>
                </SettingsSectionHeader>
                <SettingsSectionBody>
                    <UptimeBar
                        siteId={siteId}
                        resourceId={resourceId}
                        days={days}
                    />
                </SettingsSectionBody>
            </SettingsSection>

            <Credenza open={open} onOpenChange={setOpen}>
                <CredenzaContent>
                    <CredenzaHeader>
                        <CredenzaTitle>
                            {t("uptimeCreateEmailAlert")}
                        </CredenzaTitle>
                        <CredenzaDescription>
                            {siteId
                                ? t("uptimeAlertDescriptionSite")
                                : t("uptimeAlertDescriptionResource")}
                        </CredenzaDescription>
                    </CredenzaHeader>
                    <CredenzaBody>
                        <div className="space-y-4">
                            <PaidFeaturesAlert
                                tiers={tierMatrix.alertingRules}
                            />
                            <fieldset
                                disabled={!isPaid}
                                className={
                                    !isPaid
                                        ? "opacity-50 pointer-events-none"
                                        : ""
                                }
                            >
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="alert-name">
                                            {t("name")}
                                        </Label>
                                        <Input
                                            id="alert-name"
                                            value={name}
                                            onChange={(e) =>
                                                setName(e.target.value)
                                            }
                                            placeholder={t(
                                                "uptimeAlertNamePlaceholder"
                                            )}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>
                                            {t("alertingNotifyUsers")}
                                        </Label>
                                        <UsersSelector
                                            selectedUsers={userTags}
                                            orgId={orgId}
                                            onSelectUsers={setUserTags}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>
                                            {t("alertingNotifyRoles")}
                                        </Label>
                                        <RolesSelector
                                            selectedRoles={roleTags}
                                            restrictAdminRole
                                            orgId={orgId}
                                            onSelectRoles={setRoleTags}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>
                                            {t("uptimeAdditionalEmails")}
                                        </Label>
                                        <TagInput
                                            activeTagIndex={activeEmailTagIndex}
                                            setActiveTagIndex={
                                                setActiveEmailTagIndex
                                            }
                                            placeholder={t(
                                                "alertingEmailPlaceholder"
                                            )}
                                            size="sm"
                                            tags={emailTags}
                                            setTags={(newTags) => {
                                                const next =
                                                    typeof newTags ===
                                                    "function"
                                                        ? newTags(emailTags)
                                                        : newTags;
                                                setEmailTags(next as Tag[]);
                                            }}
                                            allowDuplicates={false}
                                            sortTags
                                            validateTag={(tag) =>
                                                /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
                                                    tag
                                                )
                                            }
                                            delimiterList={[",", "Enter"]}
                                        />
                                    </div>
                                </div>
                            </fieldset>
                        </div>
                    </CredenzaBody>
                    <CredenzaFooter>
                        <CredenzaClose asChild>
                            <Button variant="outline">{t("cancel")}</Button>
                        </CredenzaClose>
                        <Button
                            onClick={handleSubmit}
                            loading={loading}
                            disabled={loading || !isPaid}
                        >
                            {t("uptimeCreateAlert")}
                        </Button>
                    </CredenzaFooter>
                </CredenzaContent>
            </Credenza>
        </>
    );
}
