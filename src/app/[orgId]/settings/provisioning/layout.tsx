import SettingsSectionTitle from "@app/components/SettingsSectionTitle";
import { HorizontalTabs } from "@app/components/HorizontalTabs";
import { getTranslations } from "next-intl/server";

interface ProvisioningLayoutProps {
    children: React.ReactNode;
    params: Promise<{ orgId: string }>;
}

export default async function ProvisioningLayout({
    children,
    params
}: ProvisioningLayoutProps) {
    const { orgId } = await params;
    const t = await getTranslations();

    const navItems = [
        {
            title: t("provisioningKeys"),
            href: `/${orgId}/settings/provisioning/keys`
        },
        {
            title: t("pendingSites"),
            href: `/${orgId}/settings/provisioning/pending`
        }
    ];

    return (
        <>
            <SettingsSectionTitle
                title={t("provisioningManage")}
                description={t("provisioningDescription")}
            />

            <HorizontalTabs items={navItems}>{children}</HorizontalTabs>
        </>
    );
}