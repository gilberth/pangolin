import { internal } from "@app/lib/api";
import { authCookieHeader } from "@app/lib/api/cookies";
import { AxiosResponse } from "axios";
import { PaidFeaturesAlert } from "@app/components/PaidFeaturesAlert";
import SiteProvisioningKeysTable, {
    SiteProvisioningKeyRow
} from "@app/components/SiteProvisioningKeysTable";
import { ListSiteProvisioningKeysResponse } from "@server/routers/siteProvisioning/types";
import { getTranslations } from "next-intl/server";
import { TierFeature, tierMatrix } from "@server/lib/billing/tierMatrix";
import DismissableBanner from "@app/components/DismissableBanner";
import Link from "next/link";
import { Button } from "@app/components/ui/button";
import { ArrowRight, Plug } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Provisioning Keys"
};

type ProvisioningKeysPageProps = {
    params: Promise<{ orgId: string }>;
};

export const dynamic = "force-dynamic";

export default async function ProvisioningKeysPage(
    props: ProvisioningKeysPageProps
) {
    const params = await props.params;
    const t = await getTranslations();

    let siteProvisioningKeys: ListSiteProvisioningKeysResponse["siteProvisioningKeys"] =
        [];
    try {
        const res = await internal.get<
            AxiosResponse<ListSiteProvisioningKeysResponse>
        >(
            `/org/${params.orgId}/site-provisioning-keys`,
            await authCookieHeader()
        );
        siteProvisioningKeys = res.data.data.siteProvisioningKeys;
    } catch (e) {}

    const rows: SiteProvisioningKeyRow[] = siteProvisioningKeys.map((k) => ({
        name: k.name,
        id: k.siteProvisioningKeyId,
        key: `${k.siteProvisioningKeyId}••••••••••••••••••••${k.lastChars}`,
        createdAt: k.createdAt,
        lastUsed: k.lastUsed,
        maxBatchSize: k.maxBatchSize,
        numUsed: k.numUsed,
        validUntil: k.validUntil,
        approveNewSites: k.approveNewSites
    }));

    return (
        <>
            <DismissableBanner
                storageKey="sites-banner-dismissed"
                version={1}
                title={t("provisioningKeysBannerTitle")}
                titleIcon={<Plug className="w-5 h-5 text-primary" />}
                description={t("provisioningKeysBannerDescription")}
            >
                <Link
                    href="https://docs.pangolin.net/manage/sites/install-site"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    <Button
                        variant="outline"
                        size="sm"
                        className="gap-2 hover:bg-primary/10 hover:border-primary/50 transition-colors"
                    >
                        {t("provisioningKeysBannerButtonText")}
                        <ArrowRight className="w-4 h-4" />
                    </Button>
                </Link>
            </DismissableBanner>

            <PaidFeaturesAlert
                tiers={tierMatrix[TierFeature.SiteProvisioningKeys]}
            />

            <SiteProvisioningKeysTable keys={rows} orgId={params.orgId} />
        </>
    );
}
