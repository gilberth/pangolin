export async function getOrgTierData(
    orgId: string
): Promise<{ tier: string | null; active: boolean; isTrial: boolean }> {
    const tier = null;
    const active = false;
    const isTrial = false;

    return { tier, active, isTrial };
}
