"use client";

import {
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from "@app/components/ui/form";

import { toast } from "@app/hooks/useToast";
import { useTranslations } from "next-intl";

import { useRef } from "react";
import type { FieldValues, Path, UseFormReturn } from "react-hook-form";
import { RolesSelector, type SelectedRole } from "./roles-selector";

type OrgRolesTagFieldProps<TFieldValues extends FieldValues> = {
    form: Pick<
        UseFormReturn<TFieldValues>,
        "control" | "getValues" | "setValue"
    >;
    orgId: string;
    /** Field in the form that holds Tag[] (role tags). Default: `"roles"`. */
    name?: Path<TFieldValues>;
    label?: string;
    supportsMultipleRolesPerUser: boolean;
    showMultiRolePaywallMessage: boolean;
    paywallMessage: string;
    disabled?: boolean;
};

export default function OrgRolesTagField<TFieldValues extends FieldValues>({
    form,
    name = "roles" as Path<TFieldValues>,
    label,
    orgId,
    supportsMultipleRolesPerUser,
    showMultiRolePaywallMessage,
    paywallMessage,
    disabled
}: OrgRolesTagFieldProps<TFieldValues>) {
    const t = useTranslations();
    const isPopoverOpenRef = useRef(false);
    const lastValidRolesRef = useRef<SelectedRole[]>(
        (form.getValues(name) as SelectedRole[]) ?? []
    );

    function validateRolesSelection() {
        const current = form.getValues(name) as SelectedRole[];

        if (current.length === 0 && lastValidRolesRef.current.length > 0) {
            form.setValue(name, lastValidRolesRef.current as never, {
                shouldDirty: true
            });
            toast({
                variant: "destructive",
                title: t("accessRoleRequired"),
                description: t("accessRoleSelectPlease")
            });
            return false;
        }

        if (current.length > 0) {
            lastValidRolesRef.current = current;
        }

        return true;
    }

    function handlePopoverOpenChange(open: boolean) {
        isPopoverOpenRef.current = open;

        if (open) {
            const current = form.getValues(name) as SelectedRole[];
            if (current.length > 0) {
                lastValidRolesRef.current = current;
            }
            return;
        }

        validateRolesSelection();
    }

    function setRoleTags(nextValue: SelectedRole[]) {
        const prev = form.getValues(name) as SelectedRole[];
        const next = supportsMultipleRolesPerUser
            ? nextValue
            : nextValue.length > 1
              ? [nextValue[nextValue.length - 1]]
              : nextValue;

        if (
            !supportsMultipleRolesPerUser &&
            next.length === 0 &&
            prev.length > 0
        ) {
            form.setValue(name, [prev[prev.length - 1]] as never, {
                shouldDirty: true
            });
            return;
        }

        form.setValue(name, next as never, { shouldDirty: true });

        if (next.length > 0 && !isPopoverOpenRef.current) {
            lastValidRolesRef.current = next;
        } else if (!isPopoverOpenRef.current) {
            validateRolesSelection();
        }
    }

    return (
        <FormField
            control={form.control}
            name={name}
            render={({ field }) => {
                const selectedRoles = (field.value ?? []) as SelectedRole[];
                if (!isPopoverOpenRef.current && selectedRoles.length > 0) {
                    lastValidRolesRef.current = selectedRoles;
                }

                return (
                    <FormItem className="flex flex-col items-start">
                        <FormLabel>{label ?? t("roles")}</FormLabel>
                        <FormControl>
                            <RolesSelector
                                orgId={orgId}
                                selectedRoles={selectedRoles}
                                onSelectRoles={setRoleTags}
                                onPopoverOpenChange={handlePopoverOpenChange}
                                disabled={disabled}
                            />
                        </FormControl>
                        {showMultiRolePaywallMessage && (
                            <FormDescription>{paywallMessage}</FormDescription>
                        )}
                        <FormMessage />
                    </FormItem>
                );
            }}
        />
    );
}
