import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
    title: "Access"
};

type AccessPageProps = {
    params: Promise<{ orgId: string }>;
};

export default async function AccessPage(props: AccessPageProps) {
    const params = await props.params;
    redirect(`/${params.orgId}/settings/access/users`);

    return <></>;
}
