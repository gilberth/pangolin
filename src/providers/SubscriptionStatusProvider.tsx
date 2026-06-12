"use client";

import SubscriptionStatusContext from "@app/contexts/subscriptionStatusContext";
import { GetOrgSubscriptionResponse } from "@server/routers/billing/types";
import { useState } from "react";
import { build } from "@server/build";
import { Tier } from "@server/types/Tiers";

interface ProviderProps {
    children: React.ReactNode;
    subscriptionStatus: GetOrgSubscriptionResponse | null;
    env: string;
    sandbox_mode: boolean;
}

export function SubscriptionStatusProvider({
    children,
    subscriptionStatus,
    env,
    sandbox_mode
}: ProviderProps) {
    const [subscriptionStatusState, setSubscriptionStatusState] =
        useState<GetOrgSubscriptionResponse | null>(subscriptionStatus);

    const updateSubscriptionStatus = (
        updatedSubscriptionStatus: GetOrgSubscriptionResponse
    ) => {
        setSubscriptionStatusState((prev) => {
            return {
                ...updatedSubscriptionStatus
            };
        });
    };

    const getTier = (): {
        tier: Tier | null;
        active: boolean;
    } => {
        if (subscriptionStatus?.subscriptions) {
            // Iterate through all subscriptions
            for (const { subscription } of subscriptionStatus.subscriptions) {
                if (
                    subscription.type == "tier1" ||
                    subscription.type == "tier2" ||
                    subscription.type == "tier3" ||
                    subscription.type == "enterprise"
                ) {
                    return {
                        tier: subscription.type,
                        active: subscription.status === "active"
                    };
                }
            }
        }

        return {
            tier: null,
            active: false
        };
    };

    const isSubscribed = () => {
        const { tier, active } = getTier();
        return (
            (tier == "tier1" || tier == "tier2" || tier == "tier3" || tier == "enterprise") &&
            active
        );
    };

    const [subscribed, setSubscribed] = useState<boolean>(isSubscribed());

    const limitsExceeded = subscriptionStatusState?.limitsExceeded ?? false;

    const trialExpiresAt = (() => {
        if (subscriptionStatusState?.subscriptions) {
            for (const { subscription } of subscriptionStatusState.subscriptions) {
                if (subscription.expiresAt != null) {
                    return subscription.expiresAt * 1000; // convert seconds to ms
                }
            }
        }
        return null;
    })();

    const isTrial = subscriptionStatusState?.subscriptions?.some(({ subscription }) => subscription.trial) ?? false;

    return (
        <SubscriptionStatusContext.Provider
            value={{
                subscriptionStatus: subscriptionStatusState,
                updateSubscriptionStatus,
                getTier,
                isSubscribed,
                subscribed,
                limitsExceeded,
                trialExpiresAt,
                isTrial: isTrial
            }}
        >
            {children}
        </SubscriptionStatusContext.Provider>
    );
}

export default SubscriptionStatusProvider;
