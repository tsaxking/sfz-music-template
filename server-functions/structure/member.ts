import { NextFunction, Request, Response } from "express";
import { MAIN } from "../databases";
import Account from "./accounts";
import { EmailType } from "./email";
import { uuid } from "./uuid";
import { Session } from "./sessions";
import { Server } from "socket.io";
import { SocketWrapper } from "./socket";
import { Status } from "./status";



declare global {
    namespace Express {
        interface Request {
            session: Session;
            start: number;
            io: Server;
            file?: {
                id: string;
                name: string;
                size: number;
                type: string;
                ext: string;
                contentType: string;
                filename: string
            }
            socketIO?: SocketWrapper;
        }
    }
}


export type MemberInfo = {
    username: string;
    bio: string;
    title: string;
    resume: string;
    status: MembershipProgress;
}


export enum MembershipProgress {
    pending = 'pending',
    twicePending = 'twicePending',
    accepted = 'accepted',
    rejected = 'rejected',
    notAllowed = 'notAllowed',
    notMember = 'notMember'
}


// export enum MemberStatus {
//     pending = 'pending',
//     accepted = 'accepted',
//     rejected = 'rejected',
//     notMember = 'notMember'
// }

export class Member {
    public static members: {
        [username: string]: Member
    } = {};

    static async isMember(req: Request, res: Response, next: NextFunction) {
        const { account } = req.session;

        if (!account) {
            req.session.prevUrl = req.originalUrl;
            return Status.from('account.notLoggedIn', req).send(res);
        }

        const member = await Member.get(account.username);
        if (!member || member.status !== MembershipProgress.accepted) {
            return res.redirect('/member/become-member');
        }

        next();
    }


    static async new(account: Account): Promise<MembershipProgress> {
        // if the account was rejected, they can request again.

        const sendEmail = (message: string) => {
            account.sendEmail('sfzMusic Membership Request', EmailType.text, {
                constructor: {
                    message,
                    title: 'sfzMusic Membership Request'
                }
            });
        }

        const isMember = await Member.get(account.username);

        if (isMember) {
            if (isMember.status === MembershipProgress.rejected) {
                const query = `
                    UPDATE MemberInfo
                    SET status = ?
                    WHERE username = ?
                `;

                await MAIN.run(query, [MembershipProgress.twicePending, account.username]);

                sendEmail('You have re-requested to join sfzMusic. After this request, you cannot request again. You will receive another email when your request has been approved.');
                return MembershipProgress.pending;
            } else {
                return isMember.status;
            }
        }


        const { username } = account;

        const id = uuid();

        const query = `
            INSERT INTO MemberInfo (
                username,
                verification,
                status
            )
            VALUES (
                ?, ?, ?
            )
        `;

        await MAIN.run(query, [username, id, MembershipProgress.pending]);

        sendEmail('You have requested to join sfzMusic. You will receive another email when your request has been approved.');

        new Member({
            username,
            bio: '',
            title: '',
            resume: '',
            status: MembershipProgress.pending
        });

        return MembershipProgress.pending;
    }

    static async get(username: string): Promise<Member|null> {
        if (Member.members[username]) return Member.members[username];

        const query = `
            SELECT * FROM MemberInfo
            WHERE username = ?
        `;

        const memberInfo = await MAIN.get(query, [username]) as MemberInfo;

        if (!memberInfo) return null;

        switch (memberInfo.status) {
            case 'pending':
                memberInfo.status = MembershipProgress.pending;
                break;
            case 'accepted':
                memberInfo.status = MembershipProgress.accepted;
                break;
            case 'rejected':
                memberInfo.status = MembershipProgress.rejected;
                break;
        }

        return new Member(memberInfo);
    }

    static async getMembers(): Promise<Member[]> {
        if (Object.keys(Member.members).length) return Object.values(Member.members);

        const query = `
            SELECT * FROM MemberInfo
        `;

        const membersInfo = await MAIN.all(query) as MemberInfo[];

        return membersInfo.map(m => new Member(m));
    }

    public username: string;
    public bio: string;
    public title: string;
    public resume: string;
    public status: MembershipProgress;



    constructor(memberInfo: MemberInfo) {
        this.username = memberInfo.username;
        this.bio = memberInfo.bio;
        this.title = memberInfo.title;
        this.resume = memberInfo.resume;
        this.status = memberInfo.status;

        Member.members[this.username] = this;
    }

    async accept() {
        const query = `
            UPDATE MemberInfo
            SET status = ?
            WHERE username = ?
        `;

        await MAIN.run(query, [MembershipProgress.accepted, this.username]);

        this.status = MembershipProgress.accepted;
    }

    async reject() {
        if (this.status === MembershipProgress.twicePending) {
            const query = `
                UPDATE MemberInfo
                SET status = ?
                WHERE username = ?
            `;

            await MAIN.run(query, [MembershipProgress.notAllowed, this.username]);

            this.status = MembershipProgress.notAllowed;
            return;
        }

        const query = `
            UPDATE MemberInfo
            SET status = ?
            WHERE username = ?
        `;

        await MAIN.run(query, [MembershipProgress.rejected, this.username]);

        this.status = MembershipProgress.rejected;
    }

    async revoke() {
        const query = `
            DELETE FROM MemberInfo
            WHERE username = ?
        `;

        await MAIN.run(query, [this.username]);
        delete Member.members[this.username];
    }

    get safe() {
        return {
            username: this.username,
            bio: this.bio,
            title: this.title,
            resume: this.resume,
            status: this.status
        }
    }
}