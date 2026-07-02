"use client";

import {
    Credenza,
    CredenzaBody,
    CredenzaContent,
    CredenzaDescription,
    CredenzaFooter,
    CredenzaHeader,
    CredenzaTitle
} from "@app/components/Credenza";
import { Button } from "@app/components/ui/button";
import { CheckboxWithLabel } from "@app/components/ui/checkbox";
import { Input } from "@app/components/ui/input";
import { Label } from "@app/components/ui/label";
import { createApiClient, formatAxiosError } from "@app/lib/api";
import { useNavigationContext } from "@app/hooks/useNavigationContext";
import {
    readLauncherLastView,
    writeLauncherLastView,
    type LauncherActiveViewId
} from "@app/lib/launcherLocalStorage";
import {
    buildLauncherPath,
    getLauncherUrlBaseConfig,
    isLauncherConfigEqual,
    parseLauncherUrlState,
    serializeLauncherUrlState
} from "@app/lib/launcherUrlState";
import { useToast } from "@app/hooks/useToast";
import { useEnvContext } from "@app/hooks/useEnvContext";
import type {
    LauncherGroup,
    LauncherViewConfig,
    LauncherViewRecord
} from "@server/routers/launcher/types";
import { useMutation } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    useTransition
} from "react";
import { useDebouncedCallback } from "use-debounce";
import type { Selectedsite } from "@app/components/site-selector";
import type { SelectedLabel } from "@app/components/labels-selector";
import { useMediaQuery } from "@app/hooks/useMediaQuery";
import { cn } from "@app/lib/cn";
import { LauncherFilterPopover } from "./LauncherFilterPopover";
import { LauncherGroupList } from "./LauncherGroupList";
import { LauncherRefreshButton } from "./LauncherRefreshButton";
import { LauncherSettingsMenu } from "./LauncherSettingsMenu";
import { LauncherSortButton } from "./LauncherSortButton";
import { LauncherSaveViewMenu, LauncherViewTabs } from "./LauncherViewTabs";
import SettingsSectionTitle from "@app/components/SettingsSectionTitle";

type ResourceLauncherProps = {
    orgId: string;
    isAdmin: boolean;
    views: LauncherViewRecord[];
    activeViewId: LauncherActiveViewId;
    config: LauncherViewConfig;
    savedConfig: LauncherViewConfig;
    groups: LauncherGroup[];
    groupsPagination: {
        total: number;
        page: number;
        pageSize: number;
    };
};

export default function ResourceLauncher({
    orgId,
    isAdmin,
    views,
    activeViewId,
    config,
    savedConfig,
    groups,
    groupsPagination
}: ResourceLauncherProps) {
    const t = useTranslations();
    const { toast } = useToast();
    const { env } = useEnvContext();
    const api = createApiClient({ env });
    const router = useRouter();
    const { navigate, isNavigating, searchParams } = useNavigationContext();
    const [isRefreshing, startRefreshTransition] = useTransition();
    const hasRestoredLastView = useRef(false);

    const [searchInputResetKey, setSearchInputResetKey] = useState(0);
    const [saveDialogOpen, setSaveDialogOpen] = useState(false);
    const [newViewName, setNewViewName] = useState("");
    const [saveOrgWide, setSaveOrgWide] = useState(false);

    const isDesktop = useMediaQuery("(min-width: 768px)");

    const configRef = useRef(config);
    configRef.current = config;
    const searchInputRef = useRef(config.query);
    const activeViewIdRef = useRef(activeViewId);
    activeViewIdRef.current = activeViewId;

    useEffect(() => {
        if (hasRestoredLastView.current) {
            return;
        }
        hasRestoredLastView.current = true;

        const parsed = parseLauncherUrlState(searchParams);
        if (parsed.hasAnyLauncherParams) {
            return;
        }

        const lastView = readLauncherLastView(orgId);
        if (lastView === null || lastView === activeViewId) {
            return;
        }

        const isValid =
            lastView === "default" ||
            views.some((view) => view.viewId === lastView);
        if (!isValid) {
            return;
        }

        const baseConfig = getLauncherUrlBaseConfig(lastView, views);
        const params = serializeLauncherUrlState({
            viewId: lastView,
            config: baseConfig
        });
        navigate({ searchParams: params, replace: true });
    }, [activeViewId, navigate, orgId, searchParams, views]);

    const navigateToConfig = useCallback(
        (viewId: LauncherActiveViewId, nextConfig: LauncherViewConfig) => {
            const params = serializeLauncherUrlState({
                viewId,
                config: nextConfig
            });
            navigate({ searchParams: params });
        },
        [navigate]
    );

    const debouncedNavigateSearch = useDebouncedCallback(
        (viewId: LauncherActiveViewId, query: string) => {
            navigateToConfig(viewId, { ...configRef.current, query });
        },
        300
    );

    const selectView = useCallback(
        (viewId: LauncherActiveViewId) => {
            writeLauncherLastView(orgId, viewId);
            const baseConfig = getLauncherUrlBaseConfig(viewId, views);
            navigateToConfig(viewId, baseConfig);
        },
        [navigateToConfig, orgId, views]
    );

    const activeSavedView = useMemo(
        () =>
            activeViewId === "default"
                ? null
                : views.find((view) => view.viewId === activeViewId),
        [activeViewId, views]
    );

    const isDefaultView = activeViewId === "default";
    const isOrgWideView = Boolean(activeSavedView?.isOrgWide);
    const hasUnsavedChanges = !isLauncherConfigEqual(config, savedConfig);

    const selectedSites: Selectedsite[] = useMemo(
        () =>
            config.siteIds.map((siteId) => ({
                siteId,
                name: String(siteId),
                type: "newt"
            })),
        [config.siteIds]
    );

    const selectedLabels: SelectedLabel[] = useMemo(
        () =>
            config.labelIds.map((labelId) => ({
                labelId,
                name: String(labelId),
                color: "#a1a1aa"
            })),
        [config.labelIds]
    );

    const createViewMutation = useMutation({
        mutationFn: async (payload: {
            name: string;
            config: LauncherViewConfig;
            orgWide: boolean;
        }) => {
            const res = await api.post(`/org/${orgId}/launcher/views`, payload);
            return res.data.data as LauncherViewRecord;
        },
        onSuccess: (view) => {
            writeLauncherLastView(orgId, view.viewId);
            const params = serializeLauncherUrlState({
                viewId: view.viewId,
                config: view.config
            });
            navigate({ searchParams: params, replace: true });
            router.refresh();
            setSaveDialogOpen(false);
            setNewViewName("");
            toast({
                title: t("resourceLauncherViewSaved"),
                description: t("resourceLauncherViewSavedDescription")
            });
        },
        onError: (error) => {
            toast({
                variant: "destructive",
                title: t("resourceLauncherViewSaveFailed"),
                description: formatAxiosError(
                    error,
                    t("resourceLauncherViewSaveFailedDescription")
                )
            });
        }
    });

    const updateViewMutation = useMutation({
        mutationFn: async (payload: {
            viewId: number;
            name?: string;
            config?: LauncherViewConfig;
            orgWide?: boolean;
        }) => {
            const { viewId, ...body } = payload;
            const res = await api.put(
                `/org/${orgId}/launcher/views/${viewId}`,
                body
            );
            return res.data.data as LauncherViewRecord;
        },
        onSuccess: (view) => {
            const params = serializeLauncherUrlState({
                viewId: view.viewId,
                config: view.config
            });
            navigate({ searchParams: params, replace: true });
            router.refresh();
            toast({
                title: t("resourceLauncherViewSaved"),
                description: t("resourceLauncherViewSavedDescription")
            });
        },
        onError: (error) => {
            toast({
                variant: "destructive",
                title: t("resourceLauncherViewSaveFailed"),
                description: formatAxiosError(
                    error,
                    t("resourceLauncherViewSaveFailedDescription")
                )
            });
        }
    });

    const deleteViewMutation = useMutation({
        mutationFn: async (viewId: number) => {
            await api.delete(`/org/${orgId}/launcher/views/${viewId}`);
        },
        onSuccess: () => {
            writeLauncherLastView(orgId, "default");
            const params = serializeLauncherUrlState({
                viewId: "default",
                config: getLauncherUrlBaseConfig("default", views)
            });
            navigate({ searchParams: params, replace: true });
            router.refresh();
            toast({
                title: t("resourceLauncherViewDeleted"),
                description: t("resourceLauncherViewDeletedDescription")
            });
        },
        onError: (error) => {
            toast({
                variant: "destructive",
                title: t("resourceLauncherViewDeleteFailed"),
                description: formatAxiosError(
                    error,
                    t("resourceLauncherViewDeleteFailedDescription")
                )
            });
        }
    });

    const applyConfigPatch = useCallback(
        (patch: Partial<LauncherViewConfig>) => {
            const nextConfig = {
                ...configRef.current,
                ...patch,
                query: searchInputRef.current
            };
            navigateToConfig(activeViewIdRef.current, nextConfig);
        },
        [navigateToConfig]
    );

    const handleClearFilters = useCallback(() => {
        searchInputRef.current = "";
        setSearchInputResetKey((key) => key + 1);
        navigateToConfig(activeViewIdRef.current, {
            ...configRef.current,
            query: "",
            siteIds: [],
            labelIds: []
        });
    }, [navigateToConfig]);

    const handleResetView = useCallback(() => {
        searchInputRef.current = savedConfig.query;
        setSearchInputResetKey((key) => key + 1);
        navigateToConfig(activeViewIdRef.current, savedConfig);
    }, [navigateToConfig, savedConfig]);

    const refreshData = () => {
        startRefreshTransition(async () => {
            try {
                router.refresh();
            } catch {
                toast({
                    title: t("error"),
                    description: t("refreshError"),
                    variant: "destructive"
                });
            }
        });
    };

    const handleSaveToCurrent = () => {
        if (isDefaultView || (isOrgWideView && !isAdmin)) {
            return;
        }
        updateViewMutation.mutate({
            viewId: activeViewId,
            config
        });
    };

    const handleSaveAsNew = () => {
        setSaveOrgWide(false);
        setNewViewName("");
        setSaveDialogOpen(true);
    };

    const handleSaveForEveryone = () => {
        if (isDefaultView) {
            return;
        }
        updateViewMutation.mutate({
            viewId: activeViewId,
            orgWide: true
        });
    };

    const handleMakePersonal = () => {
        if (isDefaultView) {
            return;
        }
        updateViewMutation.mutate({
            viewId: activeViewId,
            orgWide: false
        });
    };

    const handleCreateView = () => {
        if (!newViewName.trim()) {
            return;
        }
        createViewMutation.mutate({
            name: newViewName.trim(),
            config,
            orgWide: saveOrgWide && isAdmin
        });
    };

    const savedViewTabs = views.map((view) => ({
        viewId: view.viewId,
        name: view.name
    }));

    const renderToolbarSearch = (searchClassName: string) => (
        <div className={cn("relative shrink-0", searchClassName)}>
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
                key={`${activeViewId}-${searchInputResetKey}`}
                defaultValue={config.query}
                onChange={(event) => {
                    const value = event.currentTarget.value;
                    searchInputRef.current = value;
                    debouncedNavigateSearch(activeViewIdRef.current, value);
                }}
                placeholder={t("resourceLauncherSearchPlaceholder")}
                className="pl-8"
                type="search"
            />
        </div>
    );

    const renderToolbarActions = () => (
        <>
            <LauncherSaveViewMenu
                isDefaultView={isDefaultView}
                isAdmin={isAdmin}
                isOrgWideView={isOrgWideView}
                hasUnsavedChanges={hasUnsavedChanges}
                onSaveToCurrent={handleSaveToCurrent}
                onSaveAsNew={handleSaveAsNew}
                onSaveForEveryone={handleSaveForEveryone}
                onMakePersonal={handleMakePersonal}
                onResetView={handleResetView}
            />
            <LauncherFilterPopover
                orgId={orgId}
                selectedSites={selectedSites}
                selectedLabels={selectedLabels}
                onSitesChange={(sites) =>
                    applyConfigPatch({
                        siteIds: sites.map((site) => site.siteId)
                    })
                }
                onLabelsChange={(labels) =>
                    applyConfigPatch({
                        labelIds: labels.map((label) => label.labelId)
                    })
                }
            />
            <LauncherSortButton
                order={config.order}
                onToggle={() =>
                    applyConfigPatch({
                        order: config.order === "asc" ? "desc" : "asc"
                    })
                }
            />
            <LauncherSettingsMenu
                config={config}
                isDefaultView={isDefaultView}
                onConfigChange={applyConfigPatch}
                onDeleteView={() => {
                    if (!isDefaultView) {
                        deleteViewMutation.mutate(activeViewId);
                    }
                }}
            />
            <LauncherRefreshButton
                onRefresh={refreshData}
                isRefreshing={isRefreshing || isNavigating}
            />
        </>
    );

    const renderToolbarViews = () => (
        <LauncherViewTabs
            activeViewId={activeViewId}
            savedViews={savedViewTabs}
            onSelectView={selectView}
        />
    );

    return (
        <div className="flex flex-col" aria-busy={isNavigating}>
            <SettingsSectionTitle
                title={t("resourceLauncherTitle")}
                description={t("resourceLauncherDescription")}
            />

            {isDesktop ? (
                <div className="mb-6 flex w-full min-w-0 items-center gap-3">
                    {renderToolbarSearch("w-64")}
                    <div className="min-w-0 flex-1 overflow-x-auto">
                        {renderToolbarViews()}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        {renderToolbarActions()}
                    </div>
                </div>
            ) : (
                <div className="mb-6 flex flex-col gap-3">
                    <div className="flex items-center gap-2 overflow-x-auto">
                        {renderToolbarActions()}
                    </div>
                    {renderToolbarSearch("w-full")}
                    <div className="overflow-x-auto">
                        {renderToolbarViews()}
                    </div>
                </div>
            )}

            <LauncherGroupList
                orgId={orgId}
                activeViewId={activeViewId}
                config={config}
                initialGroups={groups}
                groupsPagination={groupsPagination}
                onClearFilters={handleClearFilters}
            />

            <Credenza open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
                <CredenzaContent>
                    <CredenzaHeader>
                        <CredenzaTitle>
                            {t("resourceLauncherSaveAsNewView")}
                        </CredenzaTitle>
                        <CredenzaDescription>
                            {t("resourceLauncherSaveAsNewViewDescription")}
                        </CredenzaDescription>
                    </CredenzaHeader>
                    <CredenzaBody>
                        <div className="space-y-2">
                            <Label htmlFor="new-view-name">
                                {t("resourceLauncherViewNameLabel")}
                            </Label>
                            <Input
                                id="new-view-name"
                                value={newViewName}
                                onChange={(event) =>
                                    setNewViewName(event.target.value)
                                }
                            />
                        </div>
                        {isAdmin ? (
                            <div className="mt-4">
                                <CheckboxWithLabel
                                    id="save-org-wide"
                                    aria-describedby="save-org-wide-desc"
                                    label={t("resourceLauncherSaveForEveryone")}
                                    checked={saveOrgWide}
                                    onCheckedChange={(checked) =>
                                        setSaveOrgWide(checked === true)
                                    }
                                />
                                <p
                                    id="save-org-wide-desc"
                                    className="text-sm text-muted-foreground mt-2"
                                >
                                    {t(
                                        "resourceLauncherSaveForEveryoneDescription"
                                    )}
                                </p>
                            </div>
                        ) : null}
                    </CredenzaBody>
                    <CredenzaFooter>
                        <Button
                            variant="outline"
                            onClick={() => setSaveDialogOpen(false)}
                        >
                            {t("cancel")}
                        </Button>
                        <Button
                            onClick={handleCreateView}
                            loading={createViewMutation.isPending}
                        >
                            {t("save")}
                        </Button>
                    </CredenzaFooter>
                </CredenzaContent>
            </Credenza>
        </div>
    );
}
