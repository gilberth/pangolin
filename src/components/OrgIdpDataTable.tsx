"use client";

import { ColumnDef } from "@tanstack/react-table";
import {
    DataTable,
    type DataTableAddAction
} from "@app/components/ui/data-table";
import { useTranslations } from "next-intl";

interface DataTableProps<TData, TValue> {
    columns: ColumnDef<TData, TValue>[];
    data: TData[];
    onAdd?: () => void;
    addActions?: DataTableAddAction[];
    addButtonDisabled?: boolean;
}

export function IdpDataTable<TData, TValue>({
    columns,
    data,
    onAdd,
    addActions,
    addButtonDisabled
}: DataTableProps<TData, TValue>) {
    const t = useTranslations();

    return (
        <DataTable
            columns={columns}
            data={data}
            persistPageSize="idp-table"
            title={t("idp")}
            searchPlaceholder={t("idpSearch")}
            searchColumn="name"
            addButtonText={t("idpAdd")}
            onAdd={onAdd}
            addActions={addActions}
            addButtonDisabled={addButtonDisabled}
            enableColumnVisibility={true}
            stickyRightColumn="actions"
        />
    );
}
