import { FeatureId } from "./features";

export type LimitSet = Partial<{
    [key in FeatureId]: {
        value: number | null; // null indicates no limit
        description?: string;
    };
}>;

export const freeLimitSet: LimitSet = {
    [FeatureId.SITES]: { value: 5, description: "Basic limit" },
    [FeatureId.USERS]: { value: 5, description: "Basic limit" },
    [FeatureId.DOMAINS]: { value: 5, description: "Basic limit" },
    [FeatureId.REMOTE_EXIT_NODES]: { value: 1, description: "Basic limit" },
    [FeatureId.ORGINIZATIONS]: { value: 1, description: "Basic limit" },
};

export const tier1LimitSet: LimitSet = {
    [FeatureId.USERS]: { value: 7, description: "Home limit" },
    [FeatureId.SITES]: { value: 10, description: "Home limit" },
    [FeatureId.DOMAINS]: { value: 10, description: "Home limit" },
    [FeatureId.REMOTE_EXIT_NODES]: { value: 1, description: "Home limit" },
    [FeatureId.ORGINIZATIONS]: { value: 1, description: "Home limit" },
};

export const tier2LimitSet: LimitSet = {
    [FeatureId.USERS]: {
        value: 50,
        description: "Team limit"
    },
    [FeatureId.SITES]: {
        value: 50,
        description: "Team limit"
    },
    [FeatureId.DOMAINS]: {
        value: 50,
        description: "Team limit"
    },
    [FeatureId.REMOTE_EXIT_NODES]: {
        value: 3,
        description: "Team limit"
    },
    [FeatureId.ORGINIZATIONS]: {
        value: 1,
        description: "Team limit"
    }
};

export const tier3LimitSet: LimitSet = {
    [FeatureId.USERS]: {
        value: 250,
        description: "Business limit"
    },
    [FeatureId.SITES]: {
        value: 250,
        description: "Business limit"
    },
    [FeatureId.DOMAINS]: {
        value: 100,
        description: "Business limit"
    },
    [FeatureId.REMOTE_EXIT_NODES]: {
        value: 20,
        description: "Business limit"
    },
    [FeatureId.ORGINIZATIONS]: {
        value: 5,
        description: "Business limit"
    },
};
