import type { Label } from "@server/db";
import type { PaginatedResponse } from "@server/types/Pagination";

export type ListOrgLabelsResponse = PaginatedResponse<{
    labels: Omit<Label, "orgId">[];
}>;

export type CreateOrEditLabelResponse = {
    label: Label;
};
