"use client";

import { Badge } from "@app/components/ui/badge";
import IdpTypeIcon from "@app/components/IdpTypeIcon";

type IdpTypeBadgeProps = {
    type: string;
    variant?: string;
    name?: string;
};

export default function IdpTypeBadge({
    type,
    variant,
    name
}: IdpTypeBadgeProps) {
    const effectiveType = variant || type;
    const effectiveName = name || formatType(effectiveType);

    function formatType(type: string) {
        if (type === "google") return "Google";
        if (type === "azure") return "Azure";
        if (type === "oidc") return "OAuth2/OIDC";
        return type.charAt(0).toUpperCase() + type.slice(1);
    }

    return (
        <Badge
            variant="secondary"
            className="inline-flex items-center space-x-1 w-fit"
        >
            <IdpTypeIcon type={effectiveType} size={16} />
            <span>{effectiveName}</span>
        </Badge>
    );
}
