import { internal } from "@app/lib/api";
import { authCookieHeader } from "@app/lib/api/cookies";
import { AxiosResponse } from "axios";
import SettingsSectionTitle from "@app/components/SettingsSectionTitle";
import OrgApiKeysTable, { OrgApiKeyRow } from "@app/components/OrgApiKeysTable";
import { ListOrgApiKeysResponse } from "@server/routers/apiKeys";
import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "API Keys"
};

type ApiKeyPageProps = {
    params: Promise<{ orgId: string }>;
};

export const dynamic = "force-dynamic";

export default async function ApiKeysPage(props: ApiKeyPageProps) {
    const params = await props.params;
    const t = await getTranslations();

    let apiKeys: ListOrgApiKeysResponse["apiKeys"] = [];
    try {
        const res = await internal.get<AxiosResponse<ListOrgApiKeysResponse>>(
            `/org/${params.orgId}/api-keys`,
            await authCookieHeader()
        );
        apiKeys = res.data.data.apiKeys;
    } catch (e) {}

    const rows: OrgApiKeyRow[] = apiKeys.map((key) => {
        return {
            name: key.name,
            id: key.apiKeyId,
            key: `${key.apiKeyId}••••••••••••••••••••${key.lastChars}`,
            createdAt: key.createdAt
        };
    });

    return (
        <>
            <SettingsSectionTitle
                title={t("apiKeysManage")}
                description={t("apiKeysDescription")}
            />

            <OrgApiKeysTable apiKeys={rows} orgId={params.orgId} />
        </>
    );
}
