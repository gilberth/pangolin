"use client";

import { Button } from "@app/components/ui/button";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList
} from "@app/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger
} from "@app/components/ui/popover";
import { cn } from "@app/lib/cn";
import { dataTableFilterPopoverContentClassName } from "@app/lib/dataTableFilterPopover";
import { CheckIcon, Funnel } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { orgQueries } from "@app/lib/queries";
import { useQuery } from "@tanstack/react-query";
import { useDebounce } from "use-debounce";
import { LabelBadge } from "./label-badge";
import { LabelOverflowBadge } from "./label-overflow-badge";
import { LABEL_COLORS } from "./labels-selector";
import { Checkbox } from "./ui/checkbox";

function areSelectionsEqual(a: string[], b: string[]) {
    if (a.length !== b.length) {
        return false;
    }
    const setB = new Set(b);
    return a.every((value) => setB.has(value));
}

type LabelColumnFilterButtonProps = {
    selectedValues: string[];
    onSelectedValuesChange: (values: string[]) => void;
    className?: string;
    label: string;
    orgId: string;
};

export function LabelColumnFilterButton({
    selectedValues,
    onSelectedValuesChange,
    className,
    label,
    orgId
}: LabelColumnFilterButtonProps) {
    const [open, setOpen] = useState(false);
    const [draftValues, setDraftValues] = useState<string[]>(selectedValues);
    const t = useTranslations();

    const [labelSearchQuery, setlabelsSearchQuery] = useState("");
    const [debouncedQuery] = useDebounce(labelSearchQuery, 150);

    const { data: labels = [] } = useQuery(
        orgQueries.labels({
            orgId,
            query: debouncedQuery,
            perPage: 500
        })
    );

    const draftSet = useMemo(() => new Set(draftValues), [draftValues]);

    const selectedLabels = useMemo(
        () =>
            selectedValues.map((name) => {
                const foundLabel = labels.find((label) => label.name === name);
                return {
                    name,
                    color: foundLabel?.color ?? LABEL_COLORS.gray
                };
            }),
        [selectedValues, labels]
    );

    const summary = useMemo(() => {
        if (selectedLabels.length === 0) {
            return null;
        }

        if (selectedLabels.length === 1) {
            const label = selectedLabels[0];
            return (
                <LabelBadge
                    displayOnly
                    name={label.name}
                    color={label.color}
                    className="shrink-0"
                />
            );
        }

        return (
            <LabelOverflowBadge
                labels={selectedLabels}
                displayOnly
                className="shrink-0"
            />
        );
    }, [selectedLabels]);

    function toggle(value: string) {
        setDraftValues((current) =>
            current.includes(value)
                ? current.filter((v) => v !== value)
                : [...current, value]
        );
    }

    function handleOpenChange(nextOpen: boolean) {
        if (nextOpen) {
            setDraftValues(selectedValues);
            setOpen(true);
            return;
        }

        setOpen(false);
        if (!areSelectionsEqual(draftValues, selectedValues)) {
            onSelectedValuesChange(draftValues);
        }
    }

    return (
        <div className="flex items-center">
            <Popover open={open} onOpenChange={handleOpenChange}>
                <PopoverTrigger asChild>
                    <Button
                        variant="ghost"
                        role="combobox"
                        aria-expanded={open}
                        className={cn(
                            "justify-between text-sm h-8 px-2",
                            selectedValues.length === 0 &&
                                "text-muted-foreground",
                            className
                        )}
                    >
                        <div className="flex items-center gap-2 min-w-0">
                            <span className="shrink-0">{label}</span>
                            <Funnel className="size-4 flex-none shrink-0" />
                            {summary}
                        </div>
                    </Button>
                </PopoverTrigger>
                <PopoverContent
                    className={dataTableFilterPopoverContentClassName}
                    align="start"
                >
                    <Command shouldFilter={false}>
                        <CommandInput
                            placeholder={t("labelSearch")}
                            value={labelSearchQuery}
                            onValueChange={setlabelsSearchQuery}
                        />
                        <CommandList>
                            <CommandEmpty>{t("labelsNotFound")}</CommandEmpty>
                            <CommandGroup>
                                {draftValues.length > 0 && (
                                    <CommandItem
                                        onSelect={() => {
                                            setDraftValues([]);
                                        }}
                                        className="text-muted-foreground"
                                    >
                                        {t("accessFilterClear")}
                                    </CommandItem>
                                )}
                                {labels.map((label) => (
                                    <CommandItem
                                        key={label.name}
                                        value={label.name}
                                        onSelect={() => {
                                            toggle(label.name);
                                        }}
                                        className="flex items-center gap-2"
                                    >
                                        <Checkbox
                                            className="pointer-events-none shrink-0"
                                            checked={draftSet.has(label.name)}
                                            aria-hidden
                                            tabIndex={-1}
                                        />
                                        <div
                                            className="size-2 rounded-full bg-(--color) flex-none"
                                            style={{
                                                // @ts-expect-error css color
                                                "--color": label.color
                                            }}
                                        />
                                        {label.name}
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
        </div>
    );
}
