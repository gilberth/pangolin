"use client";

import { useState } from "react";
import Link from "next/link";
import {
    Card,
    CardHeader,
    CardTitle,
    CardContent,
    CardFooter
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
    Users,
    Globe,
    Database,
    Cog,
    Settings,
    Waypoints,
    Combine
} from "lucide-react";
import { useTranslations } from "next-intl";

interface OrgStat {
    label: string;
    value: number;
    icon: React.ReactNode;
}

type OrganizationLandingCardProps = {
    overview: {
        orgName: string;
        stats: {
            sites: number;
            resources: number;
            users: number;
        };
        userRole: string;
        isAdmin: boolean;
        isOwner: boolean;
        orgId: string;
    };
};

export default function OrganizationLandingCard(
    props: OrganizationLandingCardProps
) {
    const [orgData] = useState(props);

    const t = useTranslations();

    const orgStats: OrgStat[] = [
        {
            label: t("sites"),
            value: orgData.overview.stats.sites,
            icon: <Combine className="h-6 w-6" />
        },
        {
            label: t("resources"),
            value: orgData.overview.stats.resources,
            icon: <Waypoints className="h-6 w-6" />
        },
        {
            label: t("users"),
            value: orgData.overview.stats.users,
            icon: <Users className="h-6 w-6" />
        }
    ];

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center text-3xl font-semibold">
                    {orgData.overview.orgName}
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    {orgStats.map((stat, index) => (
                        <div
                            key={index}
                            className="flex flex-col items-center p-4 bg-secondary rounded-lg"
                        >
                            {stat.icon}
                            <span className="mt-2 text-2xl font-semibold">
                                {stat.value}
                            </span>
                            <span className="text-sm text-muted-foreground">
                                {stat.label}
                            </span>
                        </div>
                    ))}
                </div>
                <div className="text-center text-lg">
                    {t("accessRoleYour")}{" "}
                    <span className="font-semibold">
                        {orgData.overview.isOwner
                            ? t("accessRoleOwner")
                            : orgData.overview.userRole}
                    </span>
                </div>
            </CardContent>
            {orgData.overview.isAdmin && (
                <CardFooter className="flex justify-center">
                    <Link href={`/${orgData.overview.orgId}/settings`}>
                        <Button size="lg" className="w-full md:w-auto">
                            <Settings className="mr-2 h-4 w-4" />
                            {t("orgGeneralSettings")}
                        </Button>
                    </Link>
                </CardFooter>
            )}
        </Card>
    );
}
