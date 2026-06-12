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
    title: "User Device"
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
        const res = await internal.get<AxiosResponse<GetClientResponse>>(
            `/org/${params.orgId}/client/${params.niceId}`,
            await authCookieHeader()
        );
        client = res.data.data;
    } catch (error) {
        redirect(`/${params.orgId}/settings/clients/user`);
    }

    const t = await getTranslations();

    const navItems = [
        {
            title: t("general"),
            href: `/${params.orgId}/settings/clients/user/${params.niceId}/general`
        }
    ];

    return (
        <>
            <SettingsSectionTitle
                title={`${client?.name} Settings`}
                description={t("deviceSettingsDescription")}
            />

            <ClientProvider client={client}>
                <div className="space-y-4">
                    <ClientInfoCard />
                    <HorizontalTabs items={navItems}>{children}</HorizontalTabs>
                </div>
            </ClientProvider>
        </>
    );
}
