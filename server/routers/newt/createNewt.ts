import { NextFunction, Request, Response } from "express";
import { db } from "@server/db";
import { hash } from "@node-rs/argon2";
import HttpCode from "@server/types/HttpCode";
import { z } from "zod";
import { newts } from "@server/db";
import createHttpError from "http-errors";
import response from "@server/lib/response";
import { SqliteError } from "better-sqlite3";
import moment from "moment";
import { generateSessionToken } from "@server/auth/sessions/app";
import { createNewtSession } from "@server/auth/sessions/newt";
import { fromError } from "zod-validation-error";
import { hashPassword } from "@server/auth/password";

export const createNewtBodySchema = z.object({});

export type CreateNewtBody = z.infer<typeof createNewtBodySchema>;

export type CreateNewtResponse = {
    token: string;
    newtId: string;
    secret: string;
};

const createNewtSchema = z.strictObject({
    newtId: z.string(),
    secret: z.string()
});

export async function createNewt(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedBody = createNewtSchema.safeParse(req.body);
        if (!parsedBody.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedBody.error).toString()
                )
            );
        }

        const { newtId, secret } = parsedBody.data;

        if (req.user && (!req.userOrgRoleIds || req.userOrgRoleIds.length === 0)) {
            return next(
                createHttpError(HttpCode.FORBIDDEN, "User does not have a role")
            );
        }

        const secretHash = await hashPassword(secret);

        await db.insert(newts).values({
            newtId: newtId,
            secretHash,
            dateCreated: moment().toISOString()
        });

        // give the newt their default permissions:
        // await db.insert(newtActions).values({
        //     newtId: newtId,
        //     actionId: ActionsEnum.createOrg,
        //     orgId: null,
        // });

        const token = generateSessionToken();
        await createNewtSession(token, newtId);

        return response<CreateNewtResponse>(res, {
            data: {
                newtId,
                secret,
                token
            },
            success: true,
            error: false,
            message: "Newt created successfully",
            status: HttpCode.OK
        });
    } catch (e) {
        if (e instanceof SqliteError && e.code === "SQLITE_CONSTRAINT_UNIQUE") {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    "A newt with that email address already exists"
                )
            );
        } else {
            console.error(e);

            return next(
                createHttpError(
                    HttpCode.INTERNAL_SERVER_ERROR,
                    "Failed to create newt"
                )
            );
        }
    }
}
