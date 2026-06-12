import { orgQueries } from "@app/lib/queries";
import type { ListClientsResponse } from "@server/routers/client";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useDebounce } from "use-debounce";

import { useTranslations } from "next-intl";
import { MultiSelectTagInput } from "./multi-select/multi-select-tag-input";

export type SelectedMachine = Pick<
    ListClientsResponse["clients"][number],
    "name" | "clientId"
>;

export type MachineSelectorProps = {
    orgId: string;
    selectedMachines?: SelectedMachine[];
    onSelectMachines: (machine: SelectedMachine[]) => void;
};

export function MachinesSelector({
    orgId,
    selectedMachines = [],
    onSelectMachines
}: MachineSelectorProps) {
    const t = useTranslations();
    const [machineSearchQuery, setMachineSearchQuery] = useState("");

    const [debouncedValue] = useDebounce(machineSearchQuery, 150);

    const perPage = 7;

    const { data: machines = [] } = useQuery(
        orgQueries.machineClients({ orgId, perPage, query: debouncedValue })
    );

    // always include the selected machines in the list (if the user isn't searching)
    const machinesShown = useMemo(() => {
        const allMachines: Array<SelectedMachine> = [...machines];
        if (debouncedValue.trim().length === 0) {
            for (const machine of selectedMachines) {
                if (
                    !allMachines.find((mc) => mc.clientId === machine.clientId)
                ) {
                    allMachines.unshift(machine);
                }
            }
        }
        return allMachines;
    }, [machines, selectedMachines, debouncedValue]);

    return (
        <MultiSelectTagInput
            buttonText={t("accessClientSelect")}
            searchPlaceholder={t("search")}
            emptyPlaceholder={t("machineNotFound")}
            searchQuery={machineSearchQuery}
            onSearch={setMachineSearchQuery}
            options={machinesShown.map((mc) => ({
                id: mc.clientId.toString(),
                text: mc.name
            }))}
            value={selectedMachines.map((mc) => ({
                id: mc.clientId.toString(),
                text: mc.name
            }))}
            onChange={(newValues) => {
                onSelectMachines(
                    newValues.map((v) => ({
                        clientId: Number(v.id),
                        name: v.text
                    }))
                );
            }}
        />
    );
}
