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

import { Certificate, certificates, db, domains } from "@server/db";
import logger from "@server/logger";
import { Transaction } from "@server/db";
import { eq, or, and, like } from "drizzle-orm";

/**
 * Checks if a certificate exists for the given domain.
 * If not, creates a new certificate in 'pending' state.
 * Wildcard certs cover subdomains.
 */
export async function createCertificate(
    domainId: string,
    domain: string,
    trx: Transaction | typeof db
) {
    const [domainRecord] = await trx
        .select()
        .from(domains)
        .where(eq(domains.domainId, domainId))
        .limit(1);

    if (!domainRecord) {
        throw new Error(`Domain with ID ${domainId} not found`);
    }

    let existing: Certificate[] = [];
    if (domainRecord.type == "ns" || domainRecord.type == "wildcard") {
        const domainLevelDown = domain.split(".").slice(1).join(".");
        const wildcardPrefixed = `*.${domainLevelDown}`;

        existing = await trx
            .select()
            .from(certificates)
            .where(
                and(
                    eq(certificates.domainId, domainId),
                    or(
                        eq(certificates.domain, domain),
                        and(
                            eq(certificates.wildcard, true),
                            or(
                                eq(certificates.domain, domainLevelDown),
                                eq(certificates.domain, wildcardPrefixed)
                            )
                        )
                    )
                )
            );
    } else {
        // For non-NS domains, we only match exact domain names
        existing = await trx
            .select()
            .from(certificates)
            .where(
                and(
                    eq(certificates.domainId, domainId),
                    eq(certificates.domain, domain) // exact match for non-NS domains
                )
            );
    }

    if (existing.length > 0) {
        logger.info(`Certificate already exists for domain ${domain}`);
        return;
    }

    let domainToWrite = domain;
    if (
        domainRecord.type == "wildcard" && // this is to fix the wildcard certs for traefik in self hosted NOT ON THE CLOUD
        domainRecord.preferWildcardCert &&
        !domain.startsWith("*.")
    ) {
        // in this case traefik is going to generate a domain one level down so we need to store it that way
        const parts = domain.split(".");
        if (parts.length > 2) {
            domainToWrite = parts.slice(1).join(".");
            domainToWrite = `*.${domainToWrite}`;
        }
    } else if (domainRecord.type == "ns") {
        if (domain == domainRecord.baseDomain) {
            domainToWrite = domainRecord.baseDomain;
        } else {
            const parts = domain.split(".");
            if (parts.length > 2) {
                domainToWrite = parts.slice(1).join(".");
            }
        }
    }

    // No cert found, create a new one in pending state
    await trx.insert(certificates).values({
        domain: domainToWrite,
        domainId,
        wildcard:
            domainRecord.type == "ns" ||
            (domainRecord.type == "wildcard" &&
                domainRecord.preferWildcardCert), // we can only create wildcard certs for NS domains
        status: "pending",
        updatedAt: Math.floor(Date.now() / 1000),
        createdAt: Math.floor(Date.now() / 1000)
    });
}
