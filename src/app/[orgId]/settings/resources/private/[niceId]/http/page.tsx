"use client";

import {
    SettingsContainer,
    SettingsFormCell,
    SettingsFormGrid,
    SettingsSection,
    SettingsSectionBody,
    SettingsSectionDescription,
    SettingsSectionFooter,
    SettingsSectionForm,
    SettingsSectionHeader,
    SettingsSectionTitle
} from "@app/components/Settings";
import { Button } from "@app/components/ui/button";
import { Form } from "@app/components/ui/form";
import { usePaidStatus } from "@app/hooks/usePaidStatus";
import { createHttpFormSchema } from "@app/lib/privateResourceForm";
import { zodResolver } from "@hookform/resolvers/zod";
import { tierMatrix } from "@server/lib/billing/tierMatrix";
import { useTranslations } from "next-intl";
import { useActionState, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { PrivateResourceSitesField } from "../../PrivateResourceSitesField";
import { PrivateResourceHttpFields } from "../../PrivateResourceHttpFields";
import { buildSelectedSitesForResource } from "../../privateResourceUtils";
import {
    asAnyControl,
    asAnySetValue,
    asAnyWatch
} from "../../formControlUtils";
import { useSaveSiteResource } from "../../useSaveSiteResource";

export default function PrivateResourceHttpPage() {
    const t = useTranslations();
    const { save, siteResource } = useSaveSiteResource();
    const { isPaidUser } = usePaidStatus();
    const httpSectionDisabled = !isPaidUser(
        tierMatrix.advancedPrivateResources
    );
    const [selectedSites, setSelectedSites] = useState(() =>
        buildSelectedSitesForResource(siteResource)
    );

    const formSchema = useMemo(() => createHttpFormSchema(t), [t]);
    type FormValues = z.infer<typeof formSchema>;

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            siteIds: siteResource.siteIds,
            mode: "http",
            destination: siteResource.destination ?? "",
            destinationPort: siteResource.destinationPort ?? null,
            scheme: siteResource.scheme ?? "http",
            ssl: siteResource.ssl ?? false,
            httpConfigSubdomain: siteResource.subdomain ?? null,
            httpConfigDomainId: siteResource.domainId ?? null,
            httpConfigFullDomain: siteResource.fullDomain ?? null
        }
    });

    const [, formAction, saveLoading] = useActionState(async () => {
        const isValid = await form.trigger();
        if (!isValid) return;

        const data = form.getValues();
        await save({
            siteIds: data.siteIds,
            mode: "http",
            destination: data.destination,
            destinationPort: data.destinationPort,
            scheme: data.scheme,
            ssl: data.ssl,
            httpConfigSubdomain: data.httpConfigSubdomain,
            httpConfigDomainId: data.httpConfigDomainId,
            httpConfigFullDomain: data.httpConfigFullDomain
        });
    }, null);

    return (
        <SettingsContainer>
            <SettingsSection>
                <SettingsSectionHeader>
                    <SettingsSectionTitle>
                        {t("httpSettings")}
                    </SettingsSectionTitle>
                    <SettingsSectionDescription>
                        {t(
                            "editInternalResourceDialogHttpConfigurationDescription"
                        )}
                    </SettingsSectionDescription>
                </SettingsSectionHeader>

                <SettingsSectionBody>
                    <SettingsSectionForm variant="half">
                        <Form {...form}>
                            <form
                                action={formAction}
                                id="private-resource-http-form"
                            >
                                <SettingsFormGrid>
                                    <SettingsFormCell span="half">
                                        <PrivateResourceSitesField
                                            control={form.control}
                                            orgId={siteResource.orgId}
                                            selectedSites={selectedSites}
                                            onSelectedSitesChange={
                                                setSelectedSites
                                            }
                                        />
                                    </SettingsFormCell>

                                    <SettingsFormCell span="full">
                                        <PrivateResourceHttpFields
                                            control={asAnyControl(form.control)}
                                            setValue={asAnySetValue(
                                                form.setValue
                                            )}
                                            orgId={siteResource.orgId}
                                            watch={asAnyWatch(form.watch)}
                                            disabled={httpSectionDisabled}
                                            siteResourceId={siteResource.id}
                                        />
                                    </SettingsFormCell>
                                </SettingsFormGrid>
                            </form>
                        </Form>
                    </SettingsSectionForm>
                </SettingsSectionBody>

                <SettingsSectionFooter>
                    <Button
                        type="submit"
                        form="private-resource-http-form"
                        loading={saveLoading}
                        disabled={httpSectionDisabled}
                    >
                        {t("saveSettings")}
                    </Button>
                </SettingsSectionFooter>
            </SettingsSection>
        </SettingsContainer>
    );
}
