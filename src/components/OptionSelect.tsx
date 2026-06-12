"use client";

import { Button } from "@app/components/ui/button";
import { cn } from "@app/lib/cn";
import type { ReactNode } from "react";

export type OptionSelectOption<TValue extends string> = {
    value: TValue;
    label: string;
    icon?: ReactNode;
};

type OptionSelectProps<TValue extends string> = {
    options: ReadonlyArray<OptionSelectOption<TValue>>;
    value: TValue;
    onChange: (value: TValue) => void;
    label?: string;
    /** Grid columns: 2, 3, 4, 5, etc. Default 5 on md+. */
    cols?: number;
    className?: string;
    disabled?: boolean;
};

export function OptionSelect<TValue extends string>({
    options,
    value,
    onChange,
    label,
    cols = 5,
    className,
    disabled = false
}: OptionSelectProps<TValue>) {
    return (
        <div className={className}>
            {label && <p className="font-semibold mb-3">{label}</p>}
            <div
                className={cn(
                    "grid gap-2",
                    cols === 2 && "grid-cols-2",
                    cols === 3 && "grid-cols-2 md:grid-cols-3",
                    cols === 4 && "grid-cols-2 md:grid-cols-4",
                    cols === 5 && "grid-cols-2 md:grid-cols-5",
                    cols === 6 && "grid-cols-2 md:grid-cols-3 lg:grid-cols-6"
                )}
            >
                {options.map((option) => {
                    const isSelected = value === option.value;
                    return (
                        <Button
                            key={option.value}
                            type="button"
                            variant={
                                isSelected
                                    ? "squareOutlinePrimary"
                                    : "squareOutline"
                            }
                            className={cn(
                                "flex-1 min-w-30 shadow-none",
                                isSelected && "bg-primary/10"
                            )}
                            onClick={() => onChange(option.value)}
                            disabled={disabled}
                        >
                            {option.icon}
                            {option.label}
                        </Button>
                    );
                })}
            </div>
        </div>
    );
}
