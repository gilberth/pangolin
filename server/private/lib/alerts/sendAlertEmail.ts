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

import { sendEmail } from "@server/emails";
import AlertNotification from "@server/emails/templates/AlertNotification";
import config from "@server/lib/config";
import logger from "@server/logger";
import { AlertContext } from "@server/routers/alertRule/types";

/**
 * Sends an alert notification email to every address in `recipients`.
 *
 * Each recipient receives an individual email (no BCC list) so that delivery
 * failures for one address do not affect the others.  Failures per recipient
 * are logged and swallowed – the caller only sees an error if something goes
 * wrong before the send loop.
 */
export async function sendAlertEmail(
    recipients: string[],
    context: AlertContext
): Promise<void> {
    if (recipients.length === 0) {
        return;
    }

    const from = config.getNoReplyEmail();
    const subject = buildSubject(context);

    const baseUrl = config.getRawConfig().app.dashboard_url!.replace(/\/$/, "");
    const dashboardLink = `${baseUrl}/${context.orgId}/settings`;

    for (const to of recipients) {
        try {
            await sendEmail(
                AlertNotification({
                    eventType: context.eventType,
                    orgId: context.orgId,
                    data: context.data,
                    dashboardLink
                }),
                {
                    from,
                    to,
                    subject
                }
            );
            logger.debug(
                `Alert email sent to "${to}" for event "${context.eventType}"`
            );
        } catch (err) {
            logger.error(
                `sendAlertEmail: failed to send alert email to "${to}" for event "${context.eventType}"`,
                err
            );
        }
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildSubject(context: AlertContext): string {
    switch (context.eventType) {
        case "site_online":
            return "[Alert] Site Back Online";
        case "site_offline":
            return "[Alert] Site Offline";
        case "site_toggle":
            return "[Alert] Site Status Changed";
        case "health_check_healthy":
            return "[Alert] Health Check Recovered";
        case "health_check_unhealthy":
            return "[Alert] Health Check Failing";
        case "health_check_toggle":
            return "[Alert] Health Check Status Changed";
        case "resource_healthy":
            return "[Alert] Resource Healthy";
        case "resource_unhealthy":
            return "[Alert] Resource Unhealthy";
        case "resource_degraded":
            return "[Alert] Resource Degraded";
        case "resource_toggle":
            return "[Alert] Resource Status Changed";
        default: {
            // Exhaustiveness fallback – should never be reached with a
            // well-typed caller, but keeps runtime behaviour predictable.
            const _exhaustive: never = context.eventType;
            void _exhaustive;
            return "[Alert] Event Notification";
        }
    }
}
