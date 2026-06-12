import { internal } from "@app/lib/api";
import { AxiosResponse } from "axios";
import { redirect } from "next/navigation";
import { authCookieHeader } from "@app/lib/api/cookies";
import SettingsSectionTitle from "@app/components/SettingsSectionTitle";
import { GetApiKeyResponse } from "@server/routers/apiKeys";
import ApiKeyProvider from "@app/providers/ApiKeyProvider";
import { HorizontalTabs } from "@app/components/HorizontalTabs";
import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "API Key"
};

interface SettingsLayoutProps {
    children: React.ReactNode;
    params: Promise<{ apiKeyId: string; orgId: string }>;
}

export default async function SettingsLayout(props: SettingsLayoutProps) {
    const params = await props.params;
    const t = await getTranslations();

    const { children } = props;

    let apiKey = null;
    try {
        const res = await internal.get<AxiosResponse<GetApiKeyResponse>>(
            `/org/${params.orgId}/api-key/${params.apiKeyId}`,
            await authCookieHeader()
        );
        apiKey = res.data.data;
    } catch (e) {
        console.log(e);
        redirect(`/${params.orgId}/settings/api-keys`);
    }

    const navItems = [
        {
            title: t("apiKeysPermissionsTitle"),
            href: "/{orgId}/settings/api-keys/{apiKeyId}/permissions"
        }
    ];

    return (
        <>
            <SettingsSectionTitle
                title={t("apiKeysSettings", { apiKeyName: apiKey?.name })}
            />

            <ApiKeyProvider apiKey={apiKey}>
                <HorizontalTabs items={navItems}>{children}</HorizontalTabs>
            </ApiKeyProvider>
        </>
    );
}
