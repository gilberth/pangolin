import { internal } from "@app/lib/api";
import { authCookieHeader } from "@app/lib/api/cookies";
import { AxiosResponse } from "axios";
import SettingsSectionTitle from "@app/components/SettingsSectionTitle";
import { ListRootApiKeysResponse } from "@server/routers/apiKeys";
import ApiKeysTable, { ApiKeyRow } from "@app/components/ApiKeysTable";
import { getTranslations } from "next-intl/server";

type ApiKeyPageProps = {};

export const dynamic = "force-dynamic";

export default async function ApiKeysPage(props: ApiKeyPageProps) {
    let apiKeys: ListRootApiKeysResponse["apiKeys"] = [];
    try {
        const res = await internal.get<AxiosResponse<ListRootApiKeysResponse>>(
            `/api-keys`,
            await authCookieHeader()
        );
        apiKeys = res.data.data.apiKeys;
    } catch (e) {}

    const rows: ApiKeyRow[] = apiKeys.map((key) => {
        return {
            name: key.name,
            id: key.apiKeyId,
            key: `${key.apiKeyId}••••••••••••••••••••${key.lastChars}`,
            createdAt: key.createdAt
        };
    });

    const t = await getTranslations();

    return (
        <>
            <SettingsSectionTitle
                title={t("apiKeysManage")}
                description={t("apiKeysDescription")}
            />

            <ApiKeysTable apiKeys={rows} />
        </>
    );
}
