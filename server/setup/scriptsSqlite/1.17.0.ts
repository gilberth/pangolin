import { APP_PATH } from "@server/lib/consts";
import Database from "better-sqlite3";
import path from "path";

const version = "1.17.0";

export default async function migration() {
    console.log(`Running setup script ${version}...`);

    const location = path.join(APP_PATH, "db", "db.sqlite");
    const db = new Database(location);

    try {
        db.pragma("foreign_keys = OFF");

        // Query existing roleId data from userOrgs before the transaction destroys it
        const existingUserOrgRoles = db
            .prepare(
                `SELECT "userId", "orgId", "roleId" FROM 'userOrgs' WHERE "roleId" IS NOT NULL`
            )
            .all() as { userId: string; orgId: string; roleId: number }[];

        console.log(
            `Found ${existingUserOrgRoles.length} existing userOrgs role assignment(s) to migrate`
        );

        // Query existing roleId data from userInvites before the transaction destroys it
        const existingUserInviteRoles = db
            .prepare(
                `SELECT "inviteId", "roleId" FROM 'userInvites' WHERE "roleId" IS NOT NULL`
            )
            .all() as { inviteId: string; roleId: number }[];

        console.log(
            `Found ${existingUserInviteRoles.length} existing userInvites role assignment(s) to migrate`
        );

        db.transaction(() => {
            db.prepare(
                `
                CREATE TABLE 'bannedEmails' (
                   	'email' text PRIMARY KEY NOT NULL
                );
            `
            ).run();
            db.prepare(
                `
                CREATE TABLE 'bannedIps' (
                   	'ip' text PRIMARY KEY NOT NULL
                );
            `
            ).run();
            db.prepare(
                `
                CREATE TABLE 'connectionAuditLog' (
                   	'id' integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                   	'sessionId' text NOT NULL,
                   	'siteResourceId' integer,
                   	'orgId' text,
                   	'siteId' integer,
                   	'clientId' integer,
                   	'userId' text,
                   	'sourceAddr' text NOT NULL,
                   	'destAddr' text NOT NULL,
                   	'protocol' text NOT NULL,
                   	'startedAt' integer NOT NULL,
                   	'endedAt' integer,
                   	'bytesTx' integer,
                   	'bytesRx' integer,
                   	FOREIGN KEY ('siteResourceId') REFERENCES 'siteResources'('siteResourceId') ON UPDATE no action ON DELETE cascade,
                   	FOREIGN KEY ('orgId') REFERENCES 'orgs'('orgId') ON UPDATE no action ON DELETE cascade,
                   	FOREIGN KEY ('siteId') REFERENCES 'sites'('siteId') ON UPDATE no action ON DELETE cascade,
                   	FOREIGN KEY ('clientId') REFERENCES 'clients'('clientId') ON UPDATE no action ON DELETE cascade,
                   	FOREIGN KEY ('userId') REFERENCES 'user'('id') ON UPDATE no action ON DELETE cascade
                );
            `
            ).run();

            db.prepare(
                `CREATE INDEX 'idx_accessAuditLog_startedAt' ON 'connectionAuditLog' ('startedAt');`
            ).run();
            db.prepare(
                `CREATE INDEX 'idx_accessAuditLog_org_startedAt' ON 'connectionAuditLog' ('orgId','startedAt');`
            ).run();
            db.prepare(
                `CREATE INDEX 'idx_accessAuditLog_siteResourceId' ON 'connectionAuditLog' ('siteResourceId');`
            ).run();

            db.prepare(
                `
                CREATE TABLE 'siteProvisioningKeyOrg' (
                   	'siteProvisioningKeyId' text NOT NULL,
                   	'orgId' text NOT NULL,
                   	PRIMARY KEY('siteProvisioningKeyId', 'orgId'),
                   	FOREIGN KEY ('siteProvisioningKeyId') REFERENCES 'siteProvisioningKeys'('siteProvisioningKeyId') ON UPDATE no action ON DELETE cascade,
                   	FOREIGN KEY ('orgId') REFERENCES 'orgs'('orgId') ON UPDATE no action ON DELETE cascade
                );
            `
            ).run();
            db.prepare(
                `
                CREATE TABLE 'siteProvisioningKeys' (
                   	'siteProvisioningKeyId' text PRIMARY KEY NOT NULL,
                   	'name' text NOT NULL,
                   	'siteProvisioningKeyHash' text NOT NULL,
                   	'lastChars' text NOT NULL,
                   	'dateCreated' text NOT NULL,
                   	'lastUsed' text,
                   	'maxBatchSize' integer,
                   	'numUsed' integer DEFAULT 0 NOT NULL,
                   	'validUntil' text
                );
            `
            ).run();

            db.prepare(
                `
                CREATE TABLE 'userOrgRoles' (
                   	'userId' text NOT NULL,
                   	'orgId' text NOT NULL,
                   	'roleId' integer NOT NULL,
                   	FOREIGN KEY ('userId') REFERENCES 'user'('id') ON UPDATE no action ON DELETE cascade,
                   	FOREIGN KEY ('orgId') REFERENCES 'orgs'('orgId') ON UPDATE no action ON DELETE cascade,
                   	FOREIGN KEY ('roleId') REFERENCES 'roles'('roleId') ON UPDATE no action ON DELETE cascade
                );
            `
            ).run();

            db.prepare(
                `CREATE UNIQUE INDEX 'userOrgRoles_userId_orgId_roleId_unique' ON 'userOrgRoles' ('userId','orgId','roleId');`
            ).run();

            db.prepare(
                `
                CREATE TABLE '__new_userOrgs' (
                   	'userId' text NOT NULL,
                   	'orgId' text NOT NULL,
                   	'isOwner' integer DEFAULT false NOT NULL,
                   	'autoProvisioned' integer DEFAULT false,
                   	'pamUsername' text,
                   	FOREIGN KEY ('userId') REFERENCES 'user'('id') ON UPDATE no action ON DELETE cascade,
                   	FOREIGN KEY ('orgId') REFERENCES 'orgs'('orgId') ON UPDATE no action ON DELETE cascade
                );
            `
            ).run();

            db.prepare(
                `INSERT INTO '__new_userOrgs'("userId", "orgId", "isOwner", "autoProvisioned", "pamUsername") SELECT "userId", "orgId", "isOwner", "autoProvisioned", "pamUsername" FROM 'userOrgs' WHERE EXISTS (SELECT 1 FROM 'user' WHERE id = userOrgs.userId) AND EXISTS (SELECT 1 FROM 'orgs' WHERE orgId = userOrgs.orgId);`
            ).run();
            db.prepare(`DROP TABLE 'userOrgs';`).run();
            db.prepare(
                `ALTER TABLE '__new_userOrgs' RENAME TO 'userOrgs';`
            ).run();
            db.prepare(
                `
                CREATE TABLE 'userInviteRoles' (
                   	'inviteId' text NOT NULL,
                   	'roleId' integer NOT NULL,
                   	PRIMARY KEY('inviteId', 'roleId'),
                   	FOREIGN KEY ('inviteId') REFERENCES 'userInvites'('inviteId') ON UPDATE no action ON DELETE cascade,
                   	FOREIGN KEY ('roleId') REFERENCES 'roles'('roleId') ON UPDATE no action ON DELETE cascade
                );
            `
            ).run();
            db.prepare(
                `
                CREATE TABLE '__new_userInvites' (
                   	'inviteId' text PRIMARY KEY NOT NULL,
                   	'orgId' text NOT NULL,
                   	'email' text NOT NULL,
                   	'expiresAt' integer NOT NULL,
                   	'token' text NOT NULL,
                   	FOREIGN KEY ('orgId') REFERENCES 'orgs'('orgId') ON UPDATE no action ON DELETE cascade
                );
            `
            ).run();

            db.prepare(
                `
                CREATE TABLE 'eventStreamingCursors' (
                   	'cursorId' integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                   	'destinationId' integer NOT NULL,
                   	'logType' text NOT NULL,
                   	'lastSentId' integer DEFAULT 0 NOT NULL,
                   	'lastSentAt' integer,
                   	FOREIGN KEY ('destinationId') REFERENCES 'eventStreamingDestinations'('destinationId') ON UPDATE no action ON DELETE cascade
                );
            `
            ).run();
            db.prepare(
                `
                CREATE UNIQUE INDEX 'idx_eventStreamingCursors_dest_type' ON 'eventStreamingCursors' ('destinationId','logType');--> statement-breakpoint
            `
            ).run();
            db.prepare(
                `
                CREATE TABLE 'eventStreamingDestinations' (
                   	'destinationId' integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                   	'orgId' text NOT NULL,
                   	'sendConnectionLogs' integer DEFAULT false NOT NULL,
                   	'sendRequestLogs' integer DEFAULT false NOT NULL,
                   	'sendActionLogs' integer DEFAULT false NOT NULL,
                   	'sendAccessLogs' integer DEFAULT false NOT NULL,
                   	'type' text NOT NULL,
                   	'config' text NOT NULL,
                   	'enabled' integer DEFAULT true NOT NULL,
                   	'createdAt' integer NOT NULL,
                   	'updatedAt' integer NOT NULL,
                   	FOREIGN KEY ('orgId') REFERENCES 'orgs'('orgId') ON UPDATE no action ON DELETE cascade
                );
            `
            ).run();
            db.prepare(
                `INSERT INTO '__new_userInvites'("inviteId", "orgId", "email", "expiresAt", "token") SELECT "inviteId", "orgId", "email", "expiresAt", "token" FROM 'userInvites';`
            ).run();
            db.prepare(`DROP TABLE 'userInvites';`).run();
            db.prepare(
                `ALTER TABLE '__new_userInvites' RENAME TO 'userInvites';`
            ).run();

            db.prepare(
                `ALTER TABLE 'accessAuditLog' ADD 'siteResourceId' integer;`
            ).run();
            db.prepare(
                `ALTER TABLE 'clientSitesAssociationsCache' ADD 'isJitMode' integer DEFAULT false NOT NULL;`
            ).run();
            db.prepare(`ALTER TABLE 'domains' ADD 'errorMessage' text;`).run();
            db.prepare(
                `ALTER TABLE 'orgs' ADD 'settingsLogRetentionDaysConnection' integer DEFAULT 0 NOT NULL;`
            ).run();
            db.prepare(`ALTER TABLE 'sites' ADD 'lastPing' integer;`).run();
            db.prepare(
                `ALTER TABLE 'user' ADD 'marketingEmailConsent' integer DEFAULT false;`
            ).run();
            db.prepare(`ALTER TABLE 'user' ADD 'locale' text;`).run();
            db.prepare(
                `ALTER TABLE 'siteProvisioningKeys' ADD COLUMN 'approveNewSites' integer DEFAULT 1 NOT NULL;`
            ).run();
            db.prepare(
                `ALTER TABLE 'sites' ADD COLUMN 'status' text DEFAULT 'approved';`
            ).run();
        })();

        db.pragma("foreign_keys = ON");

        // Re-insert the preserved invite role assignments into the new userInviteRoles table
        if (existingUserInviteRoles.length > 0) {
            const insertUserInviteRole = db.prepare(
                `INSERT OR IGNORE INTO 'userInviteRoles' ("inviteId", "roleId")
                 SELECT ?, ?
                 WHERE EXISTS (SELECT 1 FROM 'userInvites' WHERE inviteId = ?)
                   AND EXISTS (SELECT 1 FROM 'roles' WHERE roleId = ?)`
            );

            const insertAll = db.transaction(() => {
                for (const row of existingUserInviteRoles) {
                    insertUserInviteRole.run(row.inviteId, row.roleId, row.inviteId, row.roleId);
                }
            });

            insertAll();

            console.log(
                `Migrated ${existingUserInviteRoles.length} role assignment(s) into userInviteRoles`
            );
        }

        // Re-insert the preserved role assignments into the new userOrgRoles table
        if (existingUserOrgRoles.length > 0) {
            const insertUserOrgRole = db.prepare(
                `INSERT OR IGNORE INTO 'userOrgRoles' ("userId", "orgId", "roleId")
                 SELECT ?, ?, ?
                 WHERE EXISTS (SELECT 1 FROM 'user' WHERE id = ?)
                   AND EXISTS (SELECT 1 FROM 'orgs' WHERE orgId = ?)
                   AND EXISTS (SELECT 1 FROM 'roles' WHERE roleId = ?)`
            );

            const insertAll = db.transaction(() => {
                for (const row of existingUserOrgRoles) {
                    insertUserOrgRole.run(row.userId, row.orgId, row.roleId, row.userId, row.orgId, row.roleId);
                }
            });

            insertAll();

            console.log(
                `Migrated ${existingUserOrgRoles.length} role assignment(s) into userOrgRoles`
            );
        }

        console.log(`Migrated database`);
    } catch (e) {
        console.log("Failed to migrate db:", e);
        throw e;
    }

    console.log(`${version} migration complete`);
}
