import { CommandModule } from "yargs";
import { db, users } from "@server/db";
import { eq } from "drizzle-orm";

/**
 * Disable 2FA for a user by email address.
 */
type DisableUser2faArgs = {
    email: string;
};

export const disableUser2fa: CommandModule<{}, DisableUser2faArgs> = {
    command: "disable-user-2fa",
    describe: "Disable 2FA for a user (sets twoFactorEnabled=false, clears secret)",
    builder: (yargs) => {
        return yargs.option("email", {
            type: "string",
            demandOption: true,
            describe: "User email address"
        });
    },
    handler: async (argv: { email: string }) => {
        try {
            const { email } = argv;
            console.log(`Looking for user with email: ${email}`);

            // Find the user by email
            const [user] = await db
                .select()
                .from(users)
                .where(eq(users.email, email))
                .limit(1);

            if (!user) {
                console.error(`User with email '${email}' not found`);
                process.exit(1);
            }

            if (!user.twoFactorEnabled) {
                console.log(`2FA is already disabled for user '${email}'.`);
                process.exit(0);
            }

            // Update user: disable 2FA and clear secret
            await db.update(users)
                .set({
                    twoFactorEnabled: false,
                    twoFactorSecret: null,
                    twoFactorSetupRequested: false
                })
                .where(eq(users.userId, user.userId));

            console.log(`2FA disabled for user '${email}'.`);
            process.exit(0);
        } catch (error) {
            console.error("Error disabling 2FA:", error);
            process.exit(1);
        }
    }
};
