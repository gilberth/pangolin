"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { createApiClient, formatAxiosError } from "@app/lib/api";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { toast } from "@app/hooks/useToast";
import { usePaidStatus } from "@app/hooks/usePaidStatus";
import { PaidFeaturesAlert } from "@app/components/PaidFeaturesAlert";
import ConfirmDeleteDialog from "@app/components/ConfirmDeleteDialog";
import { tierMatrix, TierFeature } from "@server/lib/billing/tierMatrix";
import SettingsSectionTitle from "@app/components/SettingsSectionTitle";
import {
    Credenza,
    CredenzaBody,
    CredenzaClose,
    CredenzaContent,
    CredenzaDescription,
    CredenzaFooter,
    CredenzaHeader,
    CredenzaTitle
} from "@app/components/Credenza";
import { Button } from "@app/components/ui/button";
import { Switch } from "@app/components/ui/switch";
import {
    Globe,
    MoreHorizontal,
    Plus,
    AlertCircle,
    ChevronDown
} from "lucide-react";
import {
    Popover,
    PopoverContent,
    PopoverTrigger
} from "@app/components/ui/popover";
import { AxiosResponse } from "axios";
import { build } from "@server/build";
import Image from "next/image";
import { StrategySelect, StrategyOption } from "@app/components/StrategySelect";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "@app/components/ui/dropdown-menu";
import {
    Destination,
    HttpDestinationCredenza,
    parseHttpConfig
} from "@app/components/HttpDestinationCredenza";
import {
    S3DestinationCredenza,
    parseS3Config
} from "@app/components/S3DestinationCredenza";
import { DatadogDestinationCredenza } from "@app/components/DatadogDestinationCredenza";
import { useTranslations } from "next-intl";

// ── Re-export Destination so the rest of the file can use it ──────────────────

interface ListDestinationsResponse {
    destinations: Destination[];
    pagination: {
        total: number;
        limit: number;
        offset: number;
    };
}

// ── Destination card ───────────────────────────────────────────────────────────

interface DestinationCardProps {
    destination: Destination;
    onToggle: (id: number, enabled: boolean) => void;
    onEdit: (destination: Destination) => void;
    onDelete: (destination: Destination) => void;
    isToggling: boolean;
    disabled?: boolean;
}

function getDestinationDisplay(destination: Destination): {
    name: string;
    typeLabel: string;
    detail: string;
    icon: React.ReactNode;
} {
    if (destination.type === "s3") {
        const cfg = parseS3Config(destination.config);
        const detail = cfg.bucket
            ? `s3://${cfg.bucket}${cfg.prefix ? `/${cfg.prefix.replace(/^\/+/, "")}` : ""}`
            : "";
        return {
            name: cfg.name,
            typeLabel: "Amazon S3",
            detail,
            icon: (
                <Image
                    src="/third-party/s3.png"
                    alt="Amazon S3"
                    width={16}
                    height={16}
                    className="rounded-sm"
                />
            )
        };
    }
    // Default: HTTP
    const cfg = parseHttpConfig(destination.config);
    return {
        name: cfg.name,
        typeLabel: "HTTP",
        detail: cfg.url,
        icon: <Globe className="h-3.5 w-3.5 text-black" />
    };
}

function DestinationCard({
    destination,
    onToggle,
    onEdit,
    onDelete,
    isToggling,
    disabled = false
}: DestinationCardProps) {
    const t = useTranslations();
    const { name, typeLabel, detail, icon } =
        getDestinationDisplay(destination);

    return (
        <div className="relative flex flex-col rounded-lg border bg-card text-card-foreground p-5 gap-3">
            {/* Top row: icon + name/type + toggle */}
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="shrink-0 flex items-center justify-center w-10 h-10 rounded-2xl bg-muted">
                        <div className="flex items-center justify-center w-6 h-6 rounded-xl bg-white shadow-sm">
                            {icon}
                        </div>
                    </div>
                    <div className="min-w-0">
                        <p className="font-semibold text-sm leading-tight truncate">
                            {name || t("streamingUnnamedDestination")}
                        </p>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {typeLabel}
                        </p>
                    </div>
                </div>
                <Switch
                    checked={destination.enabled}
                    onCheckedChange={(v) =>
                        onToggle(destination.destinationId, v)
                    }
                    disabled={isToggling || disabled}
                    className="shrink-0 mt-0.5"
                />
            </div>

            {/* Detail preview (URL for HTTP, s3:// path for S3) */}
            <p className="text-xs text-muted-foreground truncate">
                {detail || (
                    <span className="italic">
                        {t("streamingNoUrlConfigured")}
                    </span>
                )}
            </p>

            {/* Error indicator */}
            {destination.lastError && (
                <Popover>
                    <PopoverTrigger asChild>
                        <button
                            type="button"
                            className="flex items-center gap-1.5 text-left cursor-pointer rounded px-0 hover:opacity-75 transition-opacity"
                        >
                            <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                            <p className="text-xs text-destructive">
                                {t("streamingLastSyncError")}
                            </p>
                            <ChevronDown className="h-3 w-3 text-destructive shrink-0 ml-auto" />
                        </button>
                    </PopoverTrigger>
                    <PopoverContent
                        side="bottom"
                        align="end"
                        className="w-80 text-xs break-words"
                    >
                        {destination.lastError}
                    </PopoverContent>
                </Popover>
            )}

            {/* Footer: edit button + three-dots menu */}
            <div className="mt-auto pt-5 flex gap-2">
                <Button
                    variant="outline"
                    onClick={() => onEdit(destination)}
                    disabled={disabled}
                    className="flex-1"
                >
                    {t("edit")}
                </Button>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 shrink-0"
                            disabled={disabled}
                        >
                            <MoreHorizontal className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => onDelete(destination)}
                        >
                            {t("delete")}
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
    );
}

// ── Add destination card ───────────────────────────────────────────────────────

function AddDestinationCard({ onClick }: { onClick: () => void }) {
    const t = useTranslations();

    return (
        <button
            type="button"
            onClick={onClick}
            className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-transparent transition-colors p-5 min-h-35 w-full text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5 cursor-pointer"
        >
            <div className="flex flex-col items-center gap-2">
                <div className="flex items-center justify-center w-9 h-9 rounded-md border-2 border-dashed border-current">
                    <Plus className="h-4 w-4" />
                </div>
                <span className="text-sm font-medium">
                    {t("streamingAddDestination")}
                </span>
            </div>
        </button>
    );
}

// ── Destination type picker ────────────────────────────────────────────────────

type DestinationType = "http" | "s3" | "datadog";

interface DestinationTypePickerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSelect: (type: DestinationType) => void;
    isPaywalled?: boolean;
}

function DestinationTypePicker({
    open,
    onOpenChange,
    onSelect,
    isPaywalled = false
}: DestinationTypePickerProps) {
    const t = useTranslations();
    const [selected, setSelected] = useState<DestinationType>("http");

    const destinationTypeOptions: ReadonlyArray<
        StrategyOption<DestinationType>
    > = [
        {
            id: "http",
            title: t("streamingHttpWebhookTitle"),
            description: t("streamingHttpWebhookDescription"),
            icon: <Globe className="h-6 w-6" />
        },
        {
            id: "s3",
            title: t("streamingS3Title"),
            description: t("streamingS3Description"),
            icon: (
                <Image
                    src="/third-party/s3.png"
                    alt={t("streamingS3Title")}
                    width={24}
                    height={24}
                    className="rounded-sm"
                />
            )
        },
        {
            id: "datadog",
            title: t("streamingDatadogTitle"),
            description: t("streamingDatadogDescription"),
            icon: (
                <Image
                    src="/third-party/dd.png"
                    alt={t("streamingDatadogTitle")}
                    width={24}
                    height={24}
                    className="rounded-sm"
                />
            )
        }
    ];

    useEffect(() => {
        if (open) setSelected("http");
    }, [open]);

    return (
        <Credenza open={open} onOpenChange={onOpenChange}>
            <CredenzaContent className="sm:max-w-lg">
                <CredenzaHeader>
                    <CredenzaTitle>
                        {t("streamingAddDestination")}
                    </CredenzaTitle>
                    <CredenzaDescription>
                        {t("streamingTypePickerDescription")}
                    </CredenzaDescription>
                </CredenzaHeader>
                <CredenzaBody>
                    <div
                        className={
                            isPaywalled ? "pointer-events-none opacity-50" : ""
                        }
                    >
                        <StrategySelect
                            options={destinationTypeOptions}
                            value={selected}
                            onChange={(type) => setSelected(type)}
                            cols={1}
                        />
                    </div>
                </CredenzaBody>
                <CredenzaFooter>
                    <CredenzaClose asChild>
                        <Button variant="outline">{t("cancel")}</Button>
                    </CredenzaClose>
                    <Button
                        onClick={() => onSelect(selected)}
                        disabled={isPaywalled}
                    >
                        {t("continue")}
                    </Button>
                </CredenzaFooter>
            </CredenzaContent>
        </Credenza>
    );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function StreamingDestinationsPage() {
    const { orgId } = useParams() as { orgId: string };
    const api = createApiClient(useEnvContext());
    const { isPaidUser } = usePaidStatus();
    const isEnterprise = isPaidUser(tierMatrix[TierFeature.SIEM]);
    const t = useTranslations();

    const [destinations, setDestinations] = useState<Destination[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [typePickerOpen, setTypePickerOpen] = useState(false);
    const [editingDestination, setEditingDestination] =
        useState<Destination | null>(null);
    const [pickedType, setPickedType] = useState<DestinationType>("http");
    const [togglingIds, setTogglingIds] = useState<Set<number>>(new Set());

    // Delete state
    const [deleteTarget, setDeleteTarget] = useState<Destination | null>(null);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const loadDestinations = useCallback(async () => {
        if (build == "oss") {
            setDestinations([]);
            setLoading(false);
            return;
        }
        try {
            const res = await api.get<AxiosResponse<ListDestinationsResponse>>(
                `/org/${orgId}/event-streaming-destinations`
            );
            setDestinations(res.data.data.destinations ?? []);
        } catch (e) {
            toast({
                variant: "destructive",
                title: t("streamingFailedToLoad"),
                description: formatAxiosError(e, t("streamingUnexpectedError"))
            });
        } finally {
            setLoading(false);
        }
    }, [orgId]);

    useEffect(() => {
        loadDestinations();
    }, [loadDestinations]);

    const handleToggle = async (destinationId: number, enabled: boolean) => {
        // Optimistic update
        setDestinations((prev) =>
            prev.map((d) =>
                d.destinationId === destinationId ? { ...d, enabled } : d
            )
        );
        setTogglingIds((prev) => new Set(prev).add(destinationId));

        try {
            await api.post(
                `/org/${orgId}/event-streaming-destination/${destinationId}`,
                { enabled }
            );
        } catch (e) {
            // Revert on failure
            setDestinations((prev) =>
                prev.map((d) =>
                    d.destinationId === destinationId
                        ? { ...d, enabled: !enabled }
                        : d
                )
            );
            toast({
                variant: "destructive",
                title: t("streamingFailedToUpdate"),
                description: formatAxiosError(e, t("streamingUnexpectedError"))
            });
        } finally {
            setTogglingIds((prev) => {
                const next = new Set(prev);
                next.delete(destinationId);
                return next;
            });
        }
    };

    const handleDeleteCard = (destination: Destination) => {
        setDeleteTarget(destination);
        setDeleteDialogOpen(true);
    };

    const handleDeleteConfirm = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            await api.delete(
                `/org/${orgId}/event-streaming-destination/${deleteTarget.destinationId}`
            );
            toast({ title: t("streamingDeletedSuccess") });
            setDeleteDialogOpen(false);
            setDeleteTarget(null);
            loadDestinations();
        } catch (e) {
            toast({
                variant: "destructive",
                title: t("streamingFailedToDelete"),
                description: formatAxiosError(e, t("streamingUnexpectedError"))
            });
        } finally {
            setDeleting(false);
        }
    };

    const openCreate = () => {
        setTypePickerOpen(true);
    };

    const handleTypePicked = (type: DestinationType) => {
        setPickedType(type);
        setTypePickerOpen(false);
        setEditingDestination(null);
        setModalOpen(true);
    };

    const openEdit = (destination: Destination) => {
        setEditingDestination(destination);
        setPickedType((destination.type as DestinationType) ?? "http");
        setModalOpen(true);
    };

    return (
        <>
            <SettingsSectionTitle
                title={t("streamingTitle")}
                description={t("streamingDescription")}
            />

            <PaidFeaturesAlert tiers={tierMatrix[TierFeature.SIEM]} />

            {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div
                            key={i}
                            className="rounded-lg border bg-card p-5 min-h-36 animate-pulse"
                        />
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {destinations.map((dest) => (
                        <DestinationCard
                            key={dest.destinationId}
                            destination={dest}
                            onToggle={handleToggle}
                            onEdit={openEdit}
                            onDelete={handleDeleteCard}
                            isToggling={togglingIds.has(dest.destinationId)}
                            disabled={!isEnterprise}
                        />
                    ))}
                    {/* Add card is always clickable - paywall is enforced inside the picker */}
                    <AddDestinationCard onClick={openCreate} />
                </div>
            )}

            <DestinationTypePicker
                open={typePickerOpen}
                onOpenChange={setTypePickerOpen}
                onSelect={handleTypePicked}
                isPaywalled={!isEnterprise}
            />

            {pickedType === "http" && (
                <HttpDestinationCredenza
                    open={modalOpen}
                    onOpenChange={setModalOpen}
                    editing={editingDestination}
                    orgId={orgId}
                    onSaved={loadDestinations}
                />
            )}
            {pickedType === "s3" && (
                <S3DestinationCredenza
                    open={modalOpen}
                    onOpenChange={setModalOpen}
                    editing={editingDestination}
                    orgId={orgId}
                    onSaved={loadDestinations}
                />
            )}
            {pickedType === "datadog" && (
                <DatadogDestinationCredenza
                    open={modalOpen}
                    onOpenChange={setModalOpen}
                    editing={editingDestination}
                    orgId={orgId}
                    onSaved={loadDestinations}
                />
            )}

            {deleteTarget && (
                <ConfirmDeleteDialog
                    open={deleteDialogOpen}
                    setOpen={(v) => {
                        setDeleteDialogOpen(v);
                        if (!v) setDeleteTarget(null);
                    }}
                    string={
                        getDestinationDisplay(deleteTarget).name ||
                        t("streamingDeleteDialogThisDestination")
                    }
                    title={t("streamingDeleteTitle")}
                    dialog={
                        <p>
                            {t("streamingDeleteDialogAreYouSure")}{" "}
                            <span>
                                {getDestinationDisplay(deleteTarget).name ||
                                    t("streamingDeleteDialogThisDestination")}
                            </span>
                            {t("streamingDeleteDialogPermanentlyRemoved")}
                        </p>
                    }
                    buttonText={t("streamingDeleteButtonText")}
                    onConfirm={handleDeleteConfirm}
                />
            )}
        </>
    );
}
