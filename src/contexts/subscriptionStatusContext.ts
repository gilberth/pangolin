import { GetOrgSubscriptionResponse } from "@server/routers/billing/types";
import { Tier } from "@server/types/Tiers";
import { createContext } from "react";

type SubscriptionStatusContextType = {
    subscriptionStatus: GetOrgSubscriptionResponse | null;
    updateSubscriptionStatus: (updatedSite: GetOrgSubscriptionResponse) => void;
    getTier: () => { tier: Tier | null; active: boolean };
    isSubscribed: () => boolean;
    subscribed: boolean;
    /** True when org has exceeded plan limits (sites, users, etc.). Only set when build === saas. */
    limitsExceeded: boolean;
    /** Unix timestamp (ms) when the trial expires, or null if not in trial. */
    trialExpiresAt: number | null;
    /** True if the organization is currently in a trial period. */
    isTrial: boolean;
};

const SubscriptionStatusContext = createContext<
    SubscriptionStatusContextType | undefined
>(undefined);

export default SubscriptionStatusContext;
