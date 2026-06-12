"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Alert, AlertDescription } from "@app/components/ui/alert";
import { Info } from "lucide-react";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { usePaidStatus } from "@app/hooks/usePaidStatus";
import { tierMatrix } from "@server/lib/billing/tierMatrix";
import { build } from "@server/build";
import type { Env } from "@app/lib/types/env";

export function isIdpGlobalModeBannerVisible(env: Env): boolean {
    if (build === "saas") {
        return false;
    }
    return env.app.identityProviderMode === undefined;
}

export function IdpGlobalModeBanner() {
    const t = useTranslations();
    const { env } = useEnvContext();
    const { isPaidUser, hasEnterpriseLicense } = usePaidStatus();

    const paidUserForOrgOidc = isPaidUser(tierMatrix.orgOidc);
    const enterpriseUnlicensed =
        build === "enterprise" && !hasEnterpriseLicense;

    if (!isIdpGlobalModeBannerVisible(env)) {
        return null;
    }

    const adminPanelLinkRenderer = (chunks: React.ReactNode) => (
        <Link href="/admin/idp" className="font-medium underline">
            {chunks}
        </Link>
    );

    return (
        <Alert className="mb-6">
            <Info className="h-4 w-4" />
            <AlertDescription>
                {paidUserForOrgOidc
                    ? t.rich("idpGlobalModeBanner", {
                          adminPanelLink: adminPanelLinkRenderer,
                          configDocsLink: (chunks) => (
                              <Link
                                  href="https://docs.pangolin.net/manage/identity-providers/add-an-idp#organization-identity-providers"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-medium underline"
                              >
                                  {chunks}
                              </Link>
                          )
                      })
                    : enterpriseUnlicensed
                      ? t.rich("idpGlobalModeBannerLicenseRequired", {
                            adminPanelLink: adminPanelLinkRenderer
                        })
                      : t.rich("idpGlobalModeBannerUpgradeRequired", {
                            adminPanelLink: adminPanelLinkRenderer
                        })}
            </AlertDescription>
        </Alert>
    );
}
