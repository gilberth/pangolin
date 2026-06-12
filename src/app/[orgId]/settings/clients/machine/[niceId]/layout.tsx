import ClientInfoCard from "@app/components/ClientInfoCard";
import { HorizontalTabs } from "@app/components/HorizontalTabs";
import SettingsSectionTitle from "@app/components/SettingsSectionTitle";
import { internal } from "@app/lib/api";
import { authCookieHeader } from "@app/lib/api/cookies";
import ClientProvider from "@app/providers/ClientProvider";
import { GetClientResponse } from "@server/routers/client";
import { AxiosResponse } from "axios";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Machine Client"
};

type SettingsLayoutProps = {
    children: React.ReactNode;
    params: Promise<{ niceId: number | string; orgId: string }>;
};

export default async function SettingsLayout(props: SettingsLayoutProps) {
    const params = await props.params;

    const { children } = props;

    let client = null;
    try {
        console.log(
            "making request to ",
            `/org/${params.orgId}/client/${params.niceId}`
        );
        const res = await internal.get<AxiosResponse<GetClientResponse>>(
            `/org/${params.orgId}/client/${params.niceId}`,
            await authCookieHeader()
        );
        client = res.data.data;
    } catch (error) {
        console.error("Error fetching client data:", error);
        redirect(`/${params.orgId}/settings/clients`);
    }

    const t = await getTranslations();

    const navItems = [
        {
            title: t("general"),
            href: `/{orgId}/settings/clients/machine/{niceId}/general`
        },
        {
            title: t("credentials"),
            href: `/{orgId}/settings/clients/machine/{niceId}/credentials`
        }
    ];

    return (
        <>
            <SettingsSectionTitle
                title={`${client?.name} Settings`}
                description="Configure the settings on your site"
            />

            <ClientProvider client={client}>
                <div className="space-y-6">
                    <ClientInfoCard />
                    <HorizontalTabs items={navItems}>{children}</HorizontalTabs>
                </div>
            </ClientProvider>
        </>
    );
}
