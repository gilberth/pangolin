import { z } from "zod";

const STORAGE_PREFIX = "pangolin:alert-rules:";

export const webhookHeaderEntrySchema = z.object({
    key: z.string(),
    value: z.string()
});

export const alertActionSchema = z.discriminatedUnion("type", [
    z.object({
        type: z.literal("notify"),
        userIds: z.array(z.string()),
        roleIds: z.array(z.number()),
        emails: z.array(z.string())
    }),
    z.object({
        type: z.literal("webhook"),
        url: z.string().url(),
        method: z.string().min(1),
        headers: z.array(webhookHeaderEntrySchema),
        secret: z.string().optional()
    })
]);

export const alertSourceSchema = z.discriminatedUnion("type", [
    z.object({
        type: z.literal("site"),
        siteIds: z.array(z.number())
    }),
    z.object({
        type: z.literal("health_check"),
        targetIds: z.array(z.number())
    })
]);

export const alertTriggerSchema = z.enum([
    "site_online",
    "site_offline",
    "health_check_healthy",
    "health_check_unhealthy"
]);

export const alertRuleSchema = z.object({
    id: z.string().uuid(),
    name: z.string().min(1).max(255),
    enabled: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
    source: alertSourceSchema,
    trigger: alertTriggerSchema,
    actions: z.array(alertActionSchema).min(1)
});

export type AlertRule = z.infer<typeof alertRuleSchema>;
export type AlertAction = z.infer<typeof alertActionSchema>;
export type AlertTrigger = z.infer<typeof alertTriggerSchema>;

function storageKey(orgId: string) {
    return `${STORAGE_PREFIX}${orgId}`;
}

export function getRule(orgId: string, ruleId: string): AlertRule | undefined {
    return loadRules(orgId).find((r) => r.id === ruleId);
}

export function loadRules(orgId: string): AlertRule[] {
    if (typeof window === "undefined") {
        return [];
    }
    try {
        const raw = localStorage.getItem(storageKey(orgId));
        if (!raw) {
            return [];
        }
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) {
            return [];
        }
        const out: AlertRule[] = [];
        for (const item of parsed) {
            const r = alertRuleSchema.safeParse(item);
            if (r.success) {
                out.push(r.data);
            }
        }
        return out;
    } catch {
        return [];
    }
}

export function saveRules(orgId: string, rules: AlertRule[]) {
    if (typeof window === "undefined") {
        return;
    }
    localStorage.setItem(storageKey(orgId), JSON.stringify(rules));
}

export function upsertRule(orgId: string, rule: AlertRule) {
    const rules = loadRules(orgId);
    const i = rules.findIndex((r) => r.id === rule.id);
    if (i >= 0) {
        rules[i] = rule;
    } else {
        rules.push(rule);
    }
    saveRules(orgId, rules);
}

export function deleteRule(orgId: string, ruleId: string) {
    const rules = loadRules(orgId).filter((r) => r.id !== ruleId);
    saveRules(orgId, rules);
}

export function newRuleId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

export function isoNow() {
    return new Date().toISOString();
}
