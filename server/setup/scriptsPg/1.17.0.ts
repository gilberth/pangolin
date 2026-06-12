import { db } from "@server/db/pg/driver";
import { sql } from "drizzle-orm";

const version = "1.17.0";

export default async function migration() {
    console.log(`Running setup script ${version}...`);

    // Query existing roleId data from userOrgs before the transaction destroys it
    const existingRolesQuery = await db.execute(
        sql`SELECT "userId", "orgId", "roleId" FROM "userOrgs" WHERE "roleId" IS NOT NULL`
    );
    const existingUserOrgRoles = existingRolesQuery.rows as {
        userId: string;
        orgId: string;
        roleId: number;
    }[];

    console.log(
        `Found ${existingUserOrgRoles.length} existing userOrgs role assignment(s) to migrate`
    );

    // Query existing roleId data from userInvites before the transaction destroys it
    const existingInviteRolesQuery = await db.execute(
        sql`SELECT "inviteId", "roleId" FROM "userInvites" WHERE "roleId" IS NOT NULL`
    );
    const existingUserInviteRoles = existingInviteRolesQuery.rows as {
        inviteId: string;
        roleId: number;
    }[];

    console.log(
        `Found ${existingUserInviteRoles.length} existing userInvites role assignment(s) to migrate`
    );

    try {
        await db.execute(sql`BEGIN`);

        await db.execute(sql`
            CREATE TABLE "bannedEmails" (
               	"email" varchar(255) PRIMARY KEY NOT NULL
            );
        `);

        await db.execute(sql`
            CREATE TABLE "bannedIps" (
               	"ip" varchar(255) PRIMARY KEY NOT NULL
            );
        `);

        await db.execute(sql`
            CREATE TABLE "connectionAuditLog" (
               	"id" serial PRIMARY KEY NOT NULL,
               	"sessionId" text NOT NULL,
               	"siteResourceId" integer,
               	"orgId" text,
               	"siteId" integer,
               	"clientId" integer,
               	"userId" text,
               	"sourceAddr" text NOT NULL,
               	"destAddr" text NOT NULL,
               	"protocol" text NOT NULL,
               	"startedAt" integer NOT NULL,
               	"endedAt" integer,
               	"bytesTx" integer,
               	"bytesRx" integer
            );
        `);

        await db.execute(sql`
            CREATE TABLE "siteProvisioningKeyOrg" (
               	"siteProvisioningKeyId" varchar(255) NOT NULL,
               	"orgId" varchar(255) NOT NULL,
               	CONSTRAINT "siteProvisioningKeyOrg_siteProvisioningKeyId_orgId_pk" PRIMARY KEY("siteProvisioningKeyId","orgId")
            );
        `);
        await db.execute(sql`
            CREATE TABLE "siteProvisioningKeys" (
               	"siteProvisioningKeyId" varchar(255) PRIMARY KEY NOT NULL,
               	"name" varchar(255) NOT NULL,
               	"siteProvisioningKeyHash" text NOT NULL,
               	"lastChars" varchar(4) NOT NULL,
               	"dateCreated" varchar(255) NOT NULL,
               	"lastUsed" varchar(255),
               	"maxBatchSize" integer,
               	"numUsed" integer DEFAULT 0 NOT NULL,
               	"validUntil" varchar(255)
            );
        `);

        await db.execute(sql`
            CREATE TABLE "userInviteRoles" (
               	"inviteId" varchar NOT NULL,
               	"roleId" integer NOT NULL,
               	CONSTRAINT "userInviteRoles_inviteId_roleId_pk" PRIMARY KEY("inviteId","roleId")
            );
        `);

        await db.execute(sql`
            CREATE TABLE "userOrgRoles" (
               	"userId" varchar NOT NULL,
               	"orgId" varchar NOT NULL,
               	"roleId" integer NOT NULL,
               	CONSTRAINT "userOrgRoles_userId_orgId_roleId_unique" UNIQUE("userId","orgId","roleId")
            );
        `);

        await db.execute(sql`
            CREATE TABLE "eventStreamingCursors" (
               	"cursorId" serial PRIMARY KEY NOT NULL,
               	"destinationId" integer NOT NULL,
               	"logType" varchar(50) NOT NULL,
               	"lastSentId" bigint DEFAULT 0 NOT NULL,
               	"lastSentAt" bigint
            );
        `);

        await db.execute(sql`
            CREATE TABLE "eventStreamingDestinations" (
               	"destinationId" serial PRIMARY KEY NOT NULL,
               	"orgId" varchar(255) NOT NULL,
               	"sendConnectionLogs" boolean DEFAULT false NOT NULL,
               	"sendRequestLogs" boolean DEFAULT false NOT NULL,
               	"sendActionLogs" boolean DEFAULT false NOT NULL,
               	"sendAccessLogs" boolean DEFAULT false NOT NULL,
               	"type" varchar(50) NOT NULL,
               	"config" text NOT NULL,
               	"enabled" boolean DEFAULT true NOT NULL,
               	"createdAt" bigint NOT NULL,
               	"updatedAt" bigint NOT NULL
            );
        `);

        await db.execute(
            sql`ALTER TABLE "eventStreamingCursors" ADD CONSTRAINT "eventStreamingCursors_destinationId_eventStreamingDestinations_destinationId_fk" FOREIGN KEY ("destinationId") REFERENCES "public"."eventStreamingDestinations"("destinationId") ON DELETE cascade ON UPDATE no action;`
        );
        await db.execute(
            sql`ALTER TABLE "eventStreamingDestinations" ADD CONSTRAINT "eventStreamingDestinations_orgId_orgs_orgId_fk" FOREIGN KEY ("orgId") REFERENCES "public"."orgs"("orgId") ON DELETE cascade ON UPDATE no action;`
        );
        await db.execute(
            sql`CREATE UNIQUE INDEX "idx_eventStreamingCursors_dest_type" ON "eventStreamingCursors" USING btree ("destinationId","logType");`
        );
        await db.execute(
            sql`ALTER TABLE "userOrgs" DROP CONSTRAINT "userOrgs_roleId_roles_roleId_fk";`
        );
        await db.execute(
            sql`ALTER TABLE "userOrgRoles" ADD CONSTRAINT "userOrgRoles_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;`
        );
        await db.execute(
            sql`ALTER TABLE "userOrgRoles" ADD CONSTRAINT "userOrgRoles_orgId_orgs_orgId_fk" FOREIGN KEY ("orgId") REFERENCES "public"."orgs"("orgId") ON DELETE cascade ON UPDATE no action;`
        );
        await db.execute(
            sql`ALTER TABLE "userOrgRoles" ADD CONSTRAINT "userOrgRoles_roleId_roles_roleId_fk" FOREIGN KEY ("roleId") REFERENCES "public"."roles"("roleId") ON DELETE cascade ON UPDATE no action;`
        );
        await db.execute(sql`ALTER TABLE "userOrgs" DROP COLUMN "roleId";`);

        await db.execute(
            sql`ALTER TABLE "userInvites" DROP CONSTRAINT "userInvites_roleId_roles_roleId_fk";`
        );
        await db.execute(
            sql`ALTER TABLE "accessAuditLog" ADD COLUMN "siteResourceId" integer;`
        );
        await db.execute(
            sql`ALTER TABLE "clientSitesAssociationsCache" ADD COLUMN "isJitMode" boolean DEFAULT false NOT NULL;`
        );
        await db.execute(
            sql`ALTER TABLE "domains" ADD COLUMN "errorMessage" text;`
        );
        await db.execute(
            sql`ALTER TABLE "orgs" ADD COLUMN "settingsLogRetentionDaysConnection" integer DEFAULT 0 NOT NULL;`
        );
        await db.execute(
            sql`ALTER TABLE "sites" ADD COLUMN "lastPing" integer;`
        );
        await db.execute(
            sql`ALTER TABLE "user" ADD COLUMN "marketingEmailConsent" boolean DEFAULT false;`
        );
        await db.execute(sql`ALTER TABLE "user" ADD COLUMN "locale" varchar;`);
        await db.execute(
            sql`ALTER TABLE "connectionAuditLog" ADD CONSTRAINT "connectionAuditLog_siteResourceId_siteResources_siteResourceId_fk" FOREIGN KEY ("siteResourceId") REFERENCES "public"."siteResources"("siteResourceId") ON DELETE cascade ON UPDATE no action;`
        );
        await db.execute(
            sql`ALTER TABLE "connectionAuditLog" ADD CONSTRAINT "connectionAuditLog_orgId_orgs_orgId_fk" FOREIGN KEY ("orgId") REFERENCES "public"."orgs"("orgId") ON DELETE cascade ON UPDATE no action;`
        );
        await db.execute(
            sql`ALTER TABLE "connectionAuditLog" ADD CONSTRAINT "connectionAuditLog_siteId_sites_siteId_fk" FOREIGN KEY ("siteId") REFERENCES "public"."sites"("siteId") ON DELETE cascade ON UPDATE no action;`
        );
        await db.execute(
            sql`ALTER TABLE "connectionAuditLog" ADD CONSTRAINT "connectionAuditLog_clientId_clients_clientId_fk" FOREIGN KEY ("clientId") REFERENCES "public"."clients"("clientId") ON DELETE cascade ON UPDATE no action;`
        );
        await db.execute(
            sql`ALTER TABLE "connectionAuditLog" ADD CONSTRAINT "connectionAuditLog_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;`
        );
        await db.execute(
            sql`ALTER TABLE "siteProvisioningKeyOrg" ADD CONSTRAINT "siteProvisioningKeyOrg_siteProvisioningKeyId_siteProvisioningKeys_siteProvisioningKeyId_fk" FOREIGN KEY ("siteProvisioningKeyId") REFERENCES "public"."siteProvisioningKeys"("siteProvisioningKeyId") ON DELETE cascade ON UPDATE no action;`
        );
        await db.execute(
            sql`ALTER TABLE "siteProvisioningKeyOrg" ADD CONSTRAINT "siteProvisioningKeyOrg_orgId_orgs_orgId_fk" FOREIGN KEY ("orgId") REFERENCES "public"."orgs"("orgId") ON DELETE cascade ON UPDATE no action;`
        );
        await db.execute(
            sql`ALTER TABLE "userInviteRoles" ADD CONSTRAINT "userInviteRoles_inviteId_userInvites_inviteId_fk" FOREIGN KEY ("inviteId") REFERENCES "public"."userInvites"("inviteId") ON DELETE cascade ON UPDATE no action;`
        );
        await db.execute(
            sql`ALTER TABLE "userInviteRoles" ADD CONSTRAINT "userInviteRoles_roleId_roles_roleId_fk" FOREIGN KEY ("roleId") REFERENCES "public"."roles"("roleId") ON DELETE cascade ON UPDATE no action;`
        );
        await db.execute(
            sql`CREATE INDEX "idx_accessAuditLog_startedAt" ON "connectionAuditLog" USING btree ("startedAt");`
        );
        await db.execute(
            sql`CREATE INDEX "idx_accessAuditLog_org_startedAt" ON "connectionAuditLog" USING btree ("orgId","startedAt");`
        );
        await db.execute(
            sql`CREATE INDEX "idx_accessAuditLog_siteResourceId" ON "connectionAuditLog" USING btree ("siteResourceId");`
        );
        await db.execute(sql`ALTER TABLE "userInvites" DROP COLUMN "roleId";`);
        await db.execute(
            sql`ALTER TABLE "siteProvisioningKeys" ADD COLUMN "approveNewSites" boolean DEFAULT true NOT NULL;`
        );
        await db.execute(
            sql`ALTER TABLE "sites" ADD COLUMN "status" varchar DEFAULT 'approved';`
        );

        await db.execute(sql`COMMIT`);
        console.log("Migrated database");
    } catch (e) {
        await db.execute(sql`ROLLBACK`);
        console.log("Unable to migrate database");
        console.log(e);
        throw e;
    }

    // Re-insert the preserved invite role assignments into the new userInviteRoles table
    if (existingUserInviteRoles.length > 0) {
        try {
            for (const row of existingUserInviteRoles) {
                await db.execute(sql`
                    INSERT INTO "userInviteRoles" ("inviteId", "roleId")
                    SELECT ${row.inviteId}, ${row.roleId}
                    WHERE EXISTS (SELECT 1 FROM "userInvites" WHERE "inviteId" = ${row.inviteId})
                      AND EXISTS (SELECT 1 FROM "roles" WHERE "roleId" = ${row.roleId})
                    ON CONFLICT DO NOTHING
                `);
            }

            console.log(
                `Migrated ${existingUserInviteRoles.length} role assignment(s) into userInviteRoles`
            );
        } catch (e) {
            console.error(
                "Error while migrating role assignments into userInviteRoles:",
                e
            );
            throw e;
        }
    }

    // Re-insert the preserved role assignments into the new userOrgRoles table
    if (existingUserOrgRoles.length > 0) {
        try {
            for (const row of existingUserOrgRoles) {
                await db.execute(sql`
                    INSERT INTO "userOrgRoles" ("userId", "orgId", "roleId")
                    SELECT ${row.userId}, ${row.orgId}, ${row.roleId}
                    WHERE EXISTS (SELECT 1 FROM "user" WHERE "id" = ${row.userId})
                      AND EXISTS (SELECT 1 FROM "orgs" WHERE "orgId" = ${row.orgId})
                      AND EXISTS (SELECT 1 FROM "roles" WHERE "roleId" = ${row.roleId})
                    ON CONFLICT DO NOTHING
                `);
            }

            console.log(
                `Migrated ${existingUserOrgRoles.length} role assignment(s) into userOrgRoles`
            );
        } catch (e) {
            console.error(
                "Error while migrating role assignments into userOrgRoles:",
                e
            );
            throw e;
        }
    }

    console.log(`${version} migration complete`);
}
