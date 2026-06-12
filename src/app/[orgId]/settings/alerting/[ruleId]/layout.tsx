import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Edit Alert"
};

export default function EditAlertRuleLayout({
    children
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}
