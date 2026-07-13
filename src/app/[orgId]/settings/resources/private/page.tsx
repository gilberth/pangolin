import PrivateResourcesBanner from "@app/components/PrivateResourcesBanner";
import type { InternalResourceRow } from "@app/components/PrivateResourcesTable";
import PrivateResourcesTable from "@app/components/PrivateResourcesTable";
import SettingsSectionTitle from "@app/components/SettingsSectionTitle";
import { internal } from "@app/lib/api";
import { authCookieHeader } from "@app/lib/api/cookies";
import { getCachedOrg } from "@app/lib/api/getCachedOrg";
import OrgProvider from "@app/providers/OrgProvider";
import type { ListAllSiteResourcesByOrgResponse } from "@server/routers/siteResource";
import type { AxiosResponse } from "axios";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
    title: "Private Resources"
};

export interface ClientResourcesPageProps {
    params: Promise<{ orgId: string }>;
    searchParams: Promise<Record<string, string>>;
}

export default async function ClientResourcesPage(
    props: ClientResourcesPageProps
) {
    const params = await props.params;
    const t = await getTranslations();
    const searchParams = new URLSearchParams(await props.searchParams);

    let siteResources: ListAllSiteResourcesByOrgResponse["siteResources"] = [];
    let pagination: ListAllSiteResourcesByOrgResponse["pagination"] = {
        total: 0,
        page: 1,
        pageSize: 20
    };
    try {
        const res = await internal.get<
            AxiosResponse<ListAllSiteResourcesByOrgResponse>
        >(
            `/org/${params.orgId}/site-resources?${searchParams.toString()}`,
            await authCookieHeader()
        );
        const responseData = res.data.data;
        siteResources = responseData.siteResources;
        pagination = responseData.pagination;
    } catch (e) {}

    let org = null;
    try {
        const res = await getCachedOrg(params.orgId);
        org = res.data.data;
    } catch {
        redirect(`/${params.orgId}/settings/resources`);
    }

    if (!org) {
        redirect(`/${params.orgId}/settings/resources`);
    }

    const internalResourceRows: InternalResourceRow[] = siteResources.map(
        (siteResource) => {
            return {
                id: siteResource.siteResourceId,
                name: siteResource.name,
                orgId: params.orgId,
                sites: siteResource.siteIds.map((siteId, idx) => ({
                    siteId,
                    siteName: siteResource.siteNames[idx],
                    siteNiceId: siteResource.siteNiceIds[idx],
                    online: siteResource.siteOnlines[idx]
                })),
                mode: siteResource.mode,
                scheme: siteResource.scheme,
                ssl: siteResource.ssl,
                siteNames: siteResource.siteNames,
                siteAddresses: siteResource.siteAddresses || null,
                // protocol: siteResource.protocol,
                // proxyPort: siteResource.proxyPort,
                siteIds: siteResource.siteIds,
                destination: siteResource.destination,
                destinationPort: siteResource.destinationPort ?? null,
                alias: siteResource.alias || null,
                aliasAddress: siteResource.aliasAddress || null,
                siteNiceIds: siteResource.siteNiceIds,
                niceId: siteResource.niceId,
                enabled: siteResource.enabled,
                tcpPortRangeString: siteResource.tcpPortRangeString || null,
                udpPortRangeString: siteResource.udpPortRangeString || null,
                disableIcmp: siteResource.disableIcmp || false,
                authDaemonMode: siteResource.authDaemonMode ?? null,
                authDaemonPort: siteResource.authDaemonPort ?? null,
                pamMode: siteResource.pamMode ?? null,
                subdomain: siteResource.subdomain ?? null,
                domainId: siteResource.domainId ?? null,
                fullDomain: siteResource.fullDomain ?? null,
                labels: siteResource.labels ?? []
            };
        }
    );
    return (
        <>
            <SettingsSectionTitle
                title={t("clientResourceTitle")}
                description={t("clientResourceDescription")}
            />

            <PrivateResourcesBanner orgId={params.orgId} />

            <OrgProvider org={org}>
                <PrivateResourcesTable
                    internalResources={internalResourceRows}
                    orgId={params.orgId}
                    rowCount={pagination.total}
                    pagination={{
                        pageIndex: pagination.page - 1,
                        pageSize: pagination.pageSize
                    }}
                />
            </OrgProvider>
        </>
    );
}
