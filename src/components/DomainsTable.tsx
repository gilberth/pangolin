"use client";

import { ColumnDef } from "@tanstack/react-table";
import { ExtendedColumnDef } from "@app/components/ui/data-table";
import { DomainsDataTable } from "@app/components/DomainsDataTable";
import { Button } from "@app/components/ui/button";
import {
    ArrowRight,
    ArrowUpDown,
    MoreHorizontal,
    RefreshCw
} from "lucide-react";
import { useMemo, useState } from "react";
import ConfirmDeleteDialog from "@app/components/ConfirmDeleteDialog";
import { formatAxiosError } from "@app/lib/api";
import { createApiClient } from "@app/lib/api";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { Badge } from "@app/components/ui/badge";
import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import CreateDomainForm from "@app/components/CreateDomainForm";
import { useToast } from "@app/hooks/useToast";
import { useOrgContext } from "@app/hooks/useOrgContext";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "./ui/dropdown-menu";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger
} from "./ui/tooltip";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { orgQueries } from "@app/lib/queries";
import { toUnicode } from "punycode";
import { durationToMs } from "@app/lib/durationToMs";

export type DomainRow = {
    domainId: string;
    baseDomain: string;
    type: string;
    verified: boolean;
    failed: boolean;
    tries: number;
    configManaged: boolean;
    certResolver: string;
    preferWildcardCert: boolean;
    errorMessage?: string | null;
};

type Props = {
    domains: DomainRow[];
    orgId: string;
};

export default function DomainsTable({ domains, orgId }: Props) {
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [selectedDomain, setSelectedDomain] = useState<DomainRow | null>(
        null
    );
    const [restartingDomains, setRestartingDomains] = useState<Set<string>>(
        new Set()
    );
    const env = useEnvContext();
    const api = createApiClient(env);
    const t = useTranslations();
    const { toast } = useToast();
    const { org } = useOrgContext();
    const queryClient = useQueryClient();

    const {
        data: rawDomains,
        isRefetching,
        refetch
    } = useQuery({
        ...orgQueries.domains({ orgId }),
        initialData: domains as any,
        refetchInterval: durationToMs(10, "seconds")
    });

    const tableData = useMemo(
        () =>
            (rawDomains ?? []).map(
                (d) =>
                    ({
                        ...d,
                        baseDomain: toUnicode(d.baseDomain),
                        type: d.type ?? "",
                        errorMessage: d.errorMessage ?? null
                    }) as DomainRow
            ),
        [rawDomains]
    );

    const deleteDomain = async (domainId: string) => {
        try {
            await api.delete(`/org/${org.org.orgId}/domain/${domainId}`);
            toast({
                title: t("success"),
                description: t("domainDeletedDescription")
            });
            setIsDeleteModalOpen(false);
            refetch();
        } catch (e) {
            toast({
                title: t("error"),
                description: formatAxiosError(e),
                variant: "destructive"
            });
        }
    };

    const restartDomain = async (domainId: string) => {
        setRestartingDomains((prev) => new Set(prev).add(domainId));
        try {
            await api.post(`/org/${org.org.orgId}/domain/${domainId}/restart`);
            toast({
                title: t("success"),
                description: t("domainRestartedDescription", {
                    fallback: "Domain verification restarted successfully"
                })
            });
            refetch();
        } catch (e) {
            toast({
                title: t("error"),
                description: formatAxiosError(e),
                variant: "destructive"
            });
        } finally {
            setRestartingDomains((prev) => {
                const newSet = new Set(prev);
                newSet.delete(domainId);
                return newSet;
            });
        }
    };

    const getTypeDisplay = (type: string) => {
        switch (type) {
            case "ns":
                return t("selectDomainTypeNsName");
            case "cname":
                return t("selectDomainTypeCnameName");
            case "wildcard":
                return t("selectDomainTypeWildcardName");
            default:
                return type;
        }
    };

    const typeColumn: ExtendedColumnDef<DomainRow> = {
        accessorKey: "type",
        friendlyName: t("type"),
        header: ({ column }) => {
            return (
                <Button
                    variant="ghost"
                    onClick={() =>
                        column.toggleSorting(column.getIsSorted() === "asc")
                    }
                >
                    {t("type")}
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
            );
        },
        cell: ({ row }) => {
            const type = row.original.type;
            return <Badge variant="secondary">{getTypeDisplay(type)}</Badge>;
        }
    };

    const statusColumn: ExtendedColumnDef<DomainRow> = {
        accessorKey: "verified",
        friendlyName: t("status"),
        header: ({ column }) => {
            return (
                <Button
                    variant="ghost"
                    onClick={() =>
                        column.toggleSorting(column.getIsSorted() === "asc")
                    }
                >
                    {t("status")}
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
            );
        },
        cell: ({ row }) => {
            const { verified, failed, type, errorMessage } = row.original;
            if (verified) {
                return type == "wildcard" ? (
                    <Badge variant="outlinePrimary">{t("manual")}</Badge>
                ) : (
                    <Badge variant="green">{t("verified")}</Badge>
                );
            } else if (failed) {
                if (errorMessage) {
                    return (
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Badge
                                        variant="red"
                                        className="cursor-help"
                                    >
                                        {t("failed", { fallback: "Failed" })}
                                    </Badge>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">
                                    <p className="break-words">
                                        {errorMessage}
                                    </p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    );
                }
                return (
                    <Badge variant="red">
                        {t("failed", { fallback: "Failed" })}
                    </Badge>
                );
            } else {
                if (errorMessage) {
                    return (
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Badge
                                        variant="yellow"
                                        className="cursor-help"
                                    >
                                        {t("pending")}
                                    </Badge>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">
                                    <p className="break-words">
                                        {errorMessage}
                                    </p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    );
                }
                return <Badge variant="yellow">{t("pending")}</Badge>;
            }
        }
    };

    const columns: ExtendedColumnDef<DomainRow>[] = [
        {
            accessorKey: "baseDomain",
            enableHiding: false,
            friendlyName: t("domain"),
            header: ({ column }) => {
                return (
                    <Button
                        variant="ghost"
                        onClick={() =>
                            column.toggleSorting(column.getIsSorted() === "asc")
                        }
                    >
                        {t("domain")}
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                );
            },
            cell: ({ row }) => {
                const domain = row.original;
                return (
                    <span className="flex items-center gap-2">
                        {domain.baseDomain}
                        {domain.configManaged && (
                            <Badge
                                variant="secondary"
                                className="flex items-center gap-1 text-xs font-normal"
                            >
                                <Lock className="h-3 w-3" />
                                {t("configManaged", {
                                    fallback: "Config Managed"
                                })}
                            </Badge>
                        )}
                    </span>
                );
            }
        },
        ...(env.env.flags.usePangolinDns ? [typeColumn] : []),
        ...(env.env.flags.usePangolinDns ? [statusColumn] : []),
        {
            id: "actions",
            enableHiding: false,
            header: () => <span className="p-3"></span>,
            cell: ({ row }) => {
                const domain = row.original;
                const isRestarting = restartingDomains.has(domain.domainId);

                return (
                    <div className="flex items-center gap-2 justify-end">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-8 w-8 p-0">
                                    <span className="sr-only">Open menu</span>
                                    <MoreHorizontal className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <Link
                                    className="block w-full"
                                    href={`/${orgId}/settings/domains/${domain.domainId}`}
                                >
                                    <DropdownMenuItem>
                                        {t("viewSettings")}
                                    </DropdownMenuItem>
                                </Link>
                                {!domain.configManaged && (
                                    <DropdownMenuItem
                                        onClick={() => {
                                            setSelectedDomain(domain);
                                            setIsDeleteModalOpen(true);
                                        }}
                                    >
                                        <span className="text-red-500">
                                            {t("delete")}
                                        </span>
                                    </DropdownMenuItem>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                        {domain.failed && (
                            <Button
                                variant="outline"
                                onClick={() => restartDomain(domain.domainId)}
                                disabled={isRestarting}
                            >
                                <RefreshCw
                                    className={`mr-2 h-4 w-4 ${isRestarting ? "animate-spin" : ""}`}
                                />
                                {isRestarting
                                    ? t("restarting", {
                                          fallback: "Restarting..."
                                      })
                                    : t("restart", { fallback: "Restart" })}
                            </Button>
                        )}
                        <Link
                            href={`/${orgId}/settings/domains/${domain.domainId}`}
                        >
                            <Button variant={"outline"}>
                                {domain.configManaged
                                    ? t("view", { fallback: "View" })
                                    : t("edit")}
                                <ArrowRight className="ml-2 w-4 h-4" />
                            </Button>
                        </Link>
                        {/* <Button
                            variant="secondary"
                            size="sm"
                            disabled={domain.configManaged}
                            onClick={() => {
                                setSelectedDomain(domain);
                                setIsDeleteModalOpen(true);
                            }}
                        >
                            {t("delete")}
                        </Button> */}
                    </div>
                );
            }
        }
    ];

    return (
        <>
            {selectedDomain && (
                <ConfirmDeleteDialog
                    open={isDeleteModalOpen}
                    setOpen={(val) => {
                        setIsDeleteModalOpen(val);
                        setSelectedDomain(null);
                    }}
                    dialog={
                        <div className="space-y-2">
                            <p>{t("domainQuestionRemove")}</p>
                            <p>{t("domainMessageRemove")}</p>
                        </div>
                    }
                    buttonText={t("domainConfirmDelete")}
                    onConfirm={async () =>
                        deleteDomain(selectedDomain.domainId)
                    }
                    string={selectedDomain.baseDomain}
                    title={t("domainDelete")}
                />
            )}

            <CreateDomainForm
                open={isCreateModalOpen}
                setOpen={setIsCreateModalOpen}
                onCreated={(domain) => {
                    refetch();
                }}
            />

            <DomainsDataTable
                columns={columns}
                data={tableData}
                onAdd={() => setIsCreateModalOpen(true)}
                onRefresh={refetch}
                isRefreshing={isRefetching}
            />
        </>
    );
}
