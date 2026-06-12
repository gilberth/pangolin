export enum LicenseId {
    SMALL_LICENSE = "small_license",
    BIG_LICENSE = "big_license"
}

export type LicensePriceSet = {
    [key in LicenseId]: string;
};

export const licensePriceSet: LicensePriceSet = {
    // Free license matches the freeLimitSet
    [LicenseId.SMALL_LICENSE]: "price_1TMJzmD3Ee2Ir7Wm05NlGImT",
    [LicenseId.BIG_LICENSE]: "price_1TMJzzD3Ee2Ir7WmzJw9TerS"
};

export const licensePriceSetSandbox: LicensePriceSet = {
    // Free license matches the freeLimitSet
    // when matching license the keys closer to 0 index are matched first so list the licenses in descending order of value
    [LicenseId.SMALL_LICENSE]: "price_1SxDwuDCpkOb237Bz0yTiOgN",
    [LicenseId.BIG_LICENSE]: "price_1SxDy0DCpkOb237BWJxrxYkl"
};

export function getLicensePriceSet(
    environment?: string,
    sandbox_mode?: boolean
): LicensePriceSet {
    if (
        (process.env.ENVIRONMENT == "prod" &&
            process.env.SANDBOX_MODE !== "true") ||
        (environment === "prod" && sandbox_mode !== true)
    ) {
        // THIS GETS LOADED CLIENT SIDE AND SERVER SIDE
        return licensePriceSet;
    } else {
        return licensePriceSetSandbox;
    }
}
