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

import * as orgIdp from "#private/routers/orgIdp";
import * as org from "#private/routers/org";
import * as logs from "#private/routers/auditLogs";
import * as alertEvents from "#private/routers/alertEvents";
import * as certificates from "#private/routers/certificates";

import {
    verifyApiKeyHasAction,
    verifyApiKeyIsRoot,
    verifyApiKeyOrgAccess,
    verifyApiKeyIdpAccess,
    verifyApiKeyRoleAccess,
    verifyApiKeyUserAccess,
    verifyLimits
} from "@server/middlewares";
import * as user from "#private/routers/user";
import {
    verifyValidSubscription,
    verifyValidLicense
} from "#private/middlewares";
import { ActionsEnum } from "@server/auth/actions";
import {
    unauthenticated as ua,
    authenticated as a
} from "@server/routers/integration";
import { logActionAudit } from "#private/middlewares";
import { tierMatrix } from "@server/lib/billing/tierMatrix";
import { build } from "@server/build";

export const unauthenticated = ua;
export const authenticated = a;

if (build == "saas") {
    authenticated.post(
        "/org/:orgId/site/:siteId/trigger-alert",
        verifyApiKeyIsRoot,
        alertEvents.triggerSiteAlert
    );

    authenticated.post(
        "/org/:orgId/resource/:resourceId/trigger-alert",
        verifyApiKeyIsRoot,
        alertEvents.triggerResourceAlert
    );

    authenticated.post(
        "/org/:orgId/health-check/:healthCheckId/trigger-alert",
        verifyApiKeyIsRoot,
        alertEvents.triggerHealthCheckAlert
    );

    authenticated.post(
        "/cert/sync-to-newts",
        verifyApiKeyIsRoot,
        certificates.syncCertToNewts
    );

    authenticated.post(
        `/org/:orgId/send-usage-notification`,
        verifyApiKeyIsRoot, // We are the only ones who can use root key so its fine
        org.sendUsageNotification
    );

    authenticated.post(
        `/org/:orgId/send-trial-notification`,
        verifyApiKeyIsRoot,
        org.sendTrialNotification
    );
}

authenticated.delete(
    "/idp/:idpId",
    verifyApiKeyIsRoot,
    verifyApiKeyHasAction(ActionsEnum.deleteIdp),
    logActionAudit(ActionsEnum.deleteIdp),
    orgIdp.deleteOrgIdp
);

authenticated.get(
    "/org/:orgId/logs/action",
    verifyValidLicense,
    verifyValidSubscription(tierMatrix.actionLogs),
    verifyApiKeyOrgAccess,
    verifyApiKeyHasAction(ActionsEnum.exportLogs),
    logs.queryActionAuditLogs
);

authenticated.get(
    "/org/:orgId/logs/action/export",
    verifyValidLicense,
    verifyValidSubscription(tierMatrix.logExport),
    verifyApiKeyOrgAccess,
    verifyApiKeyHasAction(ActionsEnum.exportLogs),
    logActionAudit(ActionsEnum.exportLogs),
    logs.exportActionAuditLogs
);

authenticated.get(
    "/org/:orgId/logs/access",
    verifyValidLicense,
    verifyValidSubscription(tierMatrix.accessLogs),
    verifyApiKeyOrgAccess,
    verifyApiKeyHasAction(ActionsEnum.exportLogs),
    logs.queryAccessAuditLogs
);

authenticated.get(
    "/org/:orgId/logs/access/export",
    verifyValidLicense,
    verifyValidSubscription(tierMatrix.logExport),
    verifyApiKeyOrgAccess,
    verifyApiKeyHasAction(ActionsEnum.exportLogs),
    logActionAudit(ActionsEnum.exportLogs),
    logs.exportAccessAuditLogs
);

authenticated.get(
    "/org/:orgId/logs/connection",
    verifyValidLicense,
    verifyValidSubscription(tierMatrix.connectionLogs),
    verifyApiKeyOrgAccess,
    verifyApiKeyHasAction(ActionsEnum.exportLogs),
    logs.queryConnectionAuditLogs
);

authenticated.get(
    "/org/:orgId/logs/connection/export",
    verifyValidLicense,
    verifyValidSubscription(tierMatrix.logExport),
    verifyApiKeyOrgAccess,
    verifyApiKeyHasAction(ActionsEnum.exportLogs),
    logActionAudit(ActionsEnum.exportLogs),
    logs.exportConnectionAuditLogs
);

authenticated.put(
    "/org/:orgId/idp/oidc",
    verifyValidLicense,
    verifyValidSubscription(tierMatrix.orgOidc),
    verifyApiKeyOrgAccess,
    verifyLimits,
    verifyApiKeyHasAction(ActionsEnum.createIdp),
    logActionAudit(ActionsEnum.createIdp),
    orgIdp.createOrgOidcIdp
);

authenticated.post(
    "/org/:orgId/idp/:idpId/oidc",
    verifyValidLicense,
    verifyValidSubscription(tierMatrix.orgOidc),
    verifyApiKeyOrgAccess,
    verifyApiKeyIdpAccess,
    verifyLimits,
    verifyApiKeyHasAction(ActionsEnum.updateIdp),
    logActionAudit(ActionsEnum.updateIdp),
    orgIdp.updateOrgOidcIdp
);

authenticated.delete(
    "/org/:orgId/idp/:idpId",
    verifyValidLicense,
    verifyApiKeyOrgAccess,
    verifyApiKeyIdpAccess,
    verifyApiKeyHasAction(ActionsEnum.deleteIdp),
    logActionAudit(ActionsEnum.deleteIdp),
    orgIdp.deleteOrgIdp
);

authenticated.get(
    "/org/:orgId/idp/:idpId",
    verifyValidLicense,
    verifyApiKeyOrgAccess,
    verifyApiKeyIdpAccess,
    verifyApiKeyHasAction(ActionsEnum.getIdp),
    orgIdp.getOrgIdp
);

authenticated.get(
    "/org/:orgId/idp",
    verifyValidLicense,
    verifyApiKeyOrgAccess,
    verifyApiKeyHasAction(ActionsEnum.listIdps),
    orgIdp.listOrgIdps
);

authenticated.post(
    "/user/:userId/add-role/:roleId",
    verifyApiKeyRoleAccess,
    verifyApiKeyUserAccess,
    verifyLimits,
    verifyApiKeyHasAction(ActionsEnum.addUserRole),
    logActionAudit(ActionsEnum.addUserRole),
    user.addUserRole
);

authenticated.delete(
    "/user/:userId/remove-role/:roleId",
    verifyApiKeyRoleAccess,
    verifyApiKeyUserAccess,
    verifyLimits,
    verifyApiKeyHasAction(ActionsEnum.removeUserRole),
    logActionAudit(ActionsEnum.removeUserRole),
    user.removeUserRole
);
