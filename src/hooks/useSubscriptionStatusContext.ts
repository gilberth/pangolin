import SubscriptionStatusContext from "@app/contexts/subscriptionStatusContext";
import { build } from "@server/build";
import { useContext } from "react";

export function useSubscriptionStatusContext() {
    if (build != "saas") {
        return null;
    }
    const context = useContext(SubscriptionStatusContext);
    if (context === undefined) {
        return null;
    }
    return context;
}
