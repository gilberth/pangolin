import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
    title: "Identity Provider"
};

export default async function IdpPage(props: {
    params: Promise<{ orgId: string; idpId: string }>;
}) {
    const params = await props.params;
    redirect(`/${params.orgId}/settings/idp/${params.idpId}/general`);
}
