import { NextFunction, Request, Response } from "express";
import { MAIN } from "../databases";
import Account from "./accounts";
import { EmailType } from "./email";
import { uuid } from "./uuid";
import { Session } from "./sessions";
import { Server } from "socket.io";
import { SocketWrapper } from "./socket";
import { Status } from "./status";
import { io } from "../structure/socket";
import { deleteUpload } from "../files";


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


export enum MemberStatus {
    invalidBio = 'invalidBio',
    invalidTitle = 'invalidTitle',
    invalidResume = 'invalidResume',
    success = 'success',
    hasSkill = 'hasSkill',
    noSkill = 'noSkill',
    skillAdded = 'skillAdded',
    skillRemoved = 'skillRemoved'

}

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


    static async newMember(account: Account): Promise<MembershipProgress> {
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
                await MAIN.run('update-member-status', [MembershipProgress.twicePending, account.username]);

                sendEmail('You have re-requested to join sfzMusic. After this request, you cannot request again. You will receive another email when your request has been approved.');
                return MembershipProgress.pending;
            } else {
                return isMember.status;
            }
        }


        const { username } = account;

        await MAIN.run('insert-member', [username, MembershipProgress.pending]);

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

        const memberInfo = await MAIN.get('member-from-username', [username]) as MemberInfo;

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

        const membersInfo = await MAIN.all('members') as MemberInfo[];

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
        await MAIN.run('update-member-status', [MembershipProgress.accepted, this.username]);

        this.status = MembershipProgress.accepted;

        io?.emit('member-accepted', this.username);

        const account = await Account.fromUsername(this.username);
        if (!account) return;

        account.sendEmail('sfzMusic Membership Request Accepted', EmailType.text, {
            constructor: {
                message: 'Your request to join sfzMusic has been accepted. You can now log in to your account and access the member portal.',
                title: 'sfzMusic Membership Request Accepted'
            }
        });
    }

    async reject() {
        if (this.status === MembershipProgress.twicePending) {

            await MAIN.run('update-member-status', [MembershipProgress.notAllowed, this.username]);

            this.status = MembershipProgress.notAllowed;
            return;
        }
        await MAIN.run('update-member-status', [MembershipProgress.rejected, this.username]);

        this.status = MembershipProgress.rejected;
    }

    async revoke() {
        await MAIN.run('delete-member', [this.username]);
        delete Member.members[this.username];

        io?.emit('member-revoked', this.username);

        const account = await Account.fromUsername(this.username);
        if (!account) return;
        account.sendEmail('sfzMusic Membership Revoked', EmailType.text, {
            constructor: {
                message: 'Your membership to sfzMusic has been revoked. You can no longer access the member portal.',
                title: 'sfzMusic Membership Revoked'
            }
        });
    }

    async safe() {
        return {
            username: this.username,
            bio: this.bio,
            title: this.title,
            resume: this.resume,
            status: this.status,
            skills: await this.getSkills()
        }
    }

    



    async changeBio(bio: string) {
        if (!Account.valid(bio, [' '])) return MemberStatus.invalidBio;

        await MAIN.run('update-bio', [bio, this.username]);

        this.bio = bio;

        return MemberStatus.success;
    }


    async changeTitle(title: string) {
        if (!Account.valid(title, [' '])) return MemberStatus.invalidTitle;

        await MAIN.run('update-title', [title, this.username]);

        this.title = title;

        return MemberStatus.success;
    }


    async addSkill(...skills: { skill: string, years: number }[]): Promise<MemberStatus[]> {
        return Promise.all(skills.map(async(skill) => {

            const exists = await MAIN.get('member-skill', [this.username, skill.skill]);
            if (exists) return MemberStatus.hasSkill;

            await MAIN.run('add-member-skill', [this.username, skill.skill, Math.round(skill.years * 10) / 10]);
            return MemberStatus.skillAdded;
        }));
    }

    async removeSkill(...skills: string[]): Promise<MemberStatus[]> {
        return Promise.all(skills.map(async(skill) => {
            const exists = await MAIN.get('member-skill', [this.username, skill]);
            if (!exists) return MemberStatus.noSkill;

            await MAIN.run('remove-member-skill', [this.username, skill]);
            return MemberStatus.skillRemoved;
        }));
    }

    async getSkills(): Promise<string[]> {
        const data = await MAIN.all('member-skills', [this.username]);
        return data.map((d: { skill: string }) => d.skill);
    }

    async changeResume(id: string) {
        const { resume } = this;
        if (resume) {
            deleteUpload(resume + '.pdf');
        }

        this.resume = resume;


        await MAIN.run('update-resume', [id, this.username]);
    }
}