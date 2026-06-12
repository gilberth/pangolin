import { CommandModule } from "yargs";
import { db, certificates } from "@server/db";

type ClearCertificatesArgs = {};

export const clearCertificates: CommandModule<{}, ClearCertificatesArgs> = {
    command: "clear-certificates",
    describe: "Delete all entries from the certificates table",
    builder: (yargs) => {
        return yargs;
    },
    handler: async (argv: {}) => {
        try {
            console.log("Clearing all certificates from the database...");

            const deleted = await db.delete(certificates).returning();

            console.log(
                `Deleted ${deleted.length} certificate(s) from the database`
            );

            process.exit(0);
        } catch (error) {
            console.error("Error:", error);
            process.exit(1);
        }
    }
};
