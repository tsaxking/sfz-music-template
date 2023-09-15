import { NextFunction, Response, Router } from 'express';
import { ColorCode, Status } from '../structure/status';
import Role from '../structure/roles';
import Account, { AccountDynamicProperty } from '../structure/accounts';
import { getTemplate } from '../files';
import { Session } from '../structure/sessions';
import { Server } from 'socket.io';
import { SocketWrapper } from '../structure/socket';
import { EmailType } from '../structure/email';
import { config } from 'dotenv';
import { Member, MembershipProgress } from '../structure/member';

config(); // load .env variables


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



export const router = Router();


router.get('/become-member', async (req, res) => {
    res.send(await getTemplate('members/become-member', {
        username: req.session.account?.username
    }));
});


router.post('/status', async (req, res) => {
    const { account } = req.session;

    if (!account) {
        return Status.from('account.notLoggedIn', req).send(res);
    }

    const member = await Member.get(account.username);

    if (!member) return res.json({
        membershipStatus: MembershipProgress.notMember
    });

    res.json({
        membershipStatus: member.status
    });
});

router.post('/request', async (req, res) => {
    const { account } = req.session;

    if (!account) {
        return Status.from('account.notLoggedIn', req).send(res);
    }

    Member.new(account);
    Status.from('member.requested', req, { username: account.username }).send(res);
    req.io.emit('member-requested', account.username);
    req.io.emit('member-status', account.username, MembershipProgress.pending);
});


router.post('/accept', Account.allowPermissions('manageMembers'), async (req, res) => {
    const { username } = req.body;

    if (!username) {
        return Status.from('member.invalidRequest', req).send(res);
    }

    const member = await Member.get(username);
    if (!member) {
        return Status.from('member.memberNotFound', req).send(res);
    }

    if (member.status == MembershipProgress.pending || member.status == MembershipProgress.twicePending) {
        member.accept();
        Status.from('member.accepted', req, { username }).send(res);
        req.io.emit('member-accepted', username);
        return;
    }

    Status.from('member.membershipResponded', req).send(res);
});

router.post('/reject', Account.allowPermissions('manageMembers'), async (req, res) => {
    const { username } = req.body;

    if (!username) {
        return Status.from('member.invalidRequest', req).send(res);
    }

    const member = await Member.get(username);
    if (!member) {
        return Status.from('member.memberNotFound', req).send(res);
    }

    if (member.status == MembershipProgress.pending || member.status == MembershipProgress.twicePending) {
        member.reject();
        Status.from('member.rejected', req, { username }).send(res);
        req.io.emit('member-rejected', username);
        return;
    }

    Status.from('member.membershipResponded', req).send(res);
});

router.post('/revoke', Account.allowPermissions('manageMembers'), async (req, res) => {
    const { username } = req.body;

    if (!username) {
        return Status.from('member.invalidRequest', req).send(res);
    }   

    const member = await Member.get(username);
    if (!member) {
        return Status.from('member.memberNotFound', req).send(res);
    }

    member.revoke();
    Status.from('member.revoked', req, { username }).send(res);
    req.io.emit('member-revoked', username);
});

router.post('/get-members', async (req, res, next) => {
    const members = await Member.getMembers();
    res.json(members.map(m => m.safe));
});