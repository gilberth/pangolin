import type { SelectedLabel } from "@app/components/labels-selector";
import { useEffect, useState } from "react";

export function useLocalLabels(
    serverLabels: SelectedLabel[] | undefined,
    entityId: number
) {
    const labels = serverLabels ?? [];
    const [localLabels, setLocalLabels] = useState(labels);

    const serverLabelIds = labels
        .map((label) => label.labelId)
        .sort((a, b) => a - b)
        .join(",");

    useEffect(() => {
        setLocalLabels(serverLabels ?? []);
    }, [entityId, serverLabelIds]);

    return [localLabels, setLocalLabels] as const;
}
