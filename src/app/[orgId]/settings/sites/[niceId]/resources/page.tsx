import SiteResourcesOverview from "@app/components/SiteResourcesOverview";
import { internal } from "@app/lib/api";
import { authCookieHeader } from "@app/lib/api/cookies";
import type { ListResourcesResponse } from "@server/routers/resource";
import type { GetSiteResponse } from "@server/routers/site";
import type { ListAllSiteResourcesByOrgResponse } from "@server/routers/siteResource";
import type { AxiosResponse } from "axios";

type SiteResourcesPageProps = {
    params: Promise<{ orgId: string; niceId: string }>;
};

export default async function SiteResourcesPage(props: SiteResourcesPageProps) {
    const { orgId, niceId } = await props.params;

    const siteRes = await internal.get<AxiosResponse<GetSiteResponse>>(
        `/org/${orgId}/site/${niceId}`,
        await authCookieHeader()
    );
    const site = siteRes.data.data;

    const baseSearch = new URLSearchParams({
        page: "1",
        pageSize: "5",
        siteId: String(site.siteId)
    });

    let initialPublicData: ListResourcesResponse | null = null;
    let initialPrivateData: ListAllSiteResourcesByOrgResponse | null = null;
    let initialPublicForbidden = false;
    let initialPrivateForbidden = false;

    try {
        const res = await internal.get<AxiosResponse<ListResourcesResponse>>(
            `/org/${orgId}/resources?${baseSearch.toString()}`,
            await authCookieHeader()
        );
        initialPublicData = res.data.data;
    } catch (e: any) {
        initialPublicForbidden = e?.response?.status === 403;
    }

    try {
        const res = await internal.get<
            AxiosResponse<ListAllSiteResourcesByOrgResponse>
        >(
            `/org/${orgId}/site-resources?${baseSearch.toString()}`,
            await authCookieHeader()
        );
        initialPrivateData = res.data.data;
    } catch (e: any) {
        initialPrivateForbidden = e?.response?.status === 403;
    }

    return (
        <SiteResourcesOverview
            siteId={site.siteId}
            initialPublicData={initialPublicData}
            initialPrivateData={initialPrivateData}
            initialPublicForbidden={initialPublicForbidden}
            initialPrivateForbidden={initialPrivateForbidden}
        />
    );
}
