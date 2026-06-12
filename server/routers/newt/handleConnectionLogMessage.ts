import { MessageHandler } from "@server/routers/ws";

export async function flushConnectionLogToDb(): Promise<void> {
   return;
}

export async function cleanUpOldLogs(orgId: string, retentionDays: number) {
    return;
}

export const handleConnectionLogMessage: MessageHandler = async (context) => {
    return;
};
