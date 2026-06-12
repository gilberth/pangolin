/*
 * This file is part of a proprietary work.
 *
 * Copyright (c) 2025-2026 Fossorial, Inc.
 * All rights reserved.
 *
 * This file is licensed under the Fossorial Commercial License.
 * You may not use this file except in compliance with the License.
 * Unauthorized use, copying, modification, or distribution is strictly prohibited.
 *
 * This file is not licensed under the AGPLv3.
 */

// ---------------------------------------------------------------------------
// Alert event types
// ---------------------------------------------------------------------------

export type AlertEventType =
    | "site_online"
    | "site_offline"
    | "health_check_healthy"
    | "health_check_not_healthy";

// ---------------------------------------------------------------------------
// Webhook authentication config (stored as encrypted JSON in the DB)
// ---------------------------------------------------------------------------

export type WebhookAuthType = "none" | "bearer" | "basic" | "custom";

/**
 * Stored as an encrypted JSON blob in `alertWebhookActions.config`.
 */
export interface WebhookAlertConfig {
    /** Authentication strategy for the webhook endpoint */
    authType: WebhookAuthType;
    /** Bearer token – used when authType === "bearer" */
    bearerToken?: string;
    /** Basic credentials – "username:password" – used when authType === "basic" */
    basicCredentials?: string;
    /** Custom header name – used when authType === "custom" */
    customHeaderName?: string;
    /** Custom header value – used when authType === "custom" */
    customHeaderValue?: string;
    /** Extra headers to send with every webhook request */
    headers?: Array<{ key: string; value: string }>;
    /** HTTP method (default POST) */
    method?: string;
    /** Whether to use a custom body template */
    useBodyTemplate?: boolean;
    /** Mustache-style body template with {{event}}, {{timestamp}}, {{status}}, {{data}} placeholders */
    bodyTemplate?: string;
}

// ---------------------------------------------------------------------------
// Internal alert event passed through the processing pipeline
// ---------------------------------------------------------------------------

export interface AlertContext {
    eventType: AlertEventType;
    orgId: string;
    /** Set for site_online / site_offline events */
    siteId?: number;
    /** Set for health_check_* events */
    healthCheckId?: number;
    /** Human-readable context data included in emails and webhook payloads */
    data: Record<string, unknown>;
}
