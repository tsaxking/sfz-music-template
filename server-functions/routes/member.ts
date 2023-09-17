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
import { fileStream } from '../stream';

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

    Member.newMember(account);
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
    res.json(await Promise.all(members.map(m => m.safe())));
});


router.post('/change-bio', async (req, res) => {
    const { username, bio } = req.body;

    const m = await Member.get(username);
    if (!m) return Status.from('member.memberNotFound', req).send(res);

    await m.changeBio(bio);

    Status.from('member.changeBio', req, { username }).send(res);

    req.io.emit('change-bio', username, bio);
});

router.post('/change-title', async (req, res) => {
    const { username, title } = req.body;

    const m = await Member.get(username);
    if (!m) return Status.from('member.memberNotFound', req).send(res);

    await m.changeTitle(title);

    Status.from('member.changeTitle', req, { username }).send(res);
    req.io.emit('change-title', username, title);
});

router.post('/add-skill', async (req, res) => {
    const { username, skill } = req.body;

    const m = await Member.get(username);
    if (!m) return Status.from('member.memberNotFound', req).send(res);

    await m.addSkill(skill);

    Status.from('member.addSkill', req, { username }).send(res);
    req.io.emit('add-skill', username, skill);
});

router.post('/remove-skill', async (req, res) => {
    const { username, skill } = req.body;

    const m = await Member.get(username);
    if (!m) return Status.from('member.memberNotFound', req).send(res);

    await m.removeSkill(skill);

    Status.from('member.removeSkill', req, { username }).send(res);
    req.io.emit('remove-skill', username, skill);
});

router.post('/change-resume', fileStream({
    maxFileSize: 1000000,
    extensions: ['.pdf']
}), async (req, res) => {
    const { file } = req;
    const { username } = req.body;

    if (!file) {
        return Status.from('file.invalidFile', req).send(res);
    }

    const m = await Member.get(username);
    if (!m) return Status.from('member.memberNotFound', req).send(res);

    await m.changeResume(file.id);

    Status.from('member.changeResume', req, { username }).send(res);
    req.io.emit('change-resume', username, file.id);
});