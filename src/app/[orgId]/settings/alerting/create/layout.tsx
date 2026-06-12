import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Create Alert"
};

export default function CreateAlertRuleLayout({
    children
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}
