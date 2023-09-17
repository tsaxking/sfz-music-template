import { NextFunction, Response, Router } from 'express';
import { ColorCode, Status } from '../structure/status';
import Role from '../structure/roles';
import Account, { AccountDynamicProperty } from '../structure/accounts';
import { getTemplate } from '../files';
import { fileStream } from '../stream';
import { Session } from '../structure/sessions';
import { Server } from 'socket.io';
import { SocketWrapper } from '../structure/socket';
import { EmailType } from '../structure/email';
import { config } from 'dotenv';

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


const router = Router();

// gets the account from the session
router.post('/my-account', async(req, res) => {
    const { account } = req.session;

    if (account) res.json(await account.safe({
        email: true,
        roles: true,
        memberInfo: true
    }));
    else Status.from('account.notLoggedIn', req).send(res);
});


// gets all roles available
router.post('/get-roles', async(req, res) => {
    res.json(await Role.all());
});

router.get('/sign-in', async (req, res) => {
    res.send(await getTemplate('account/sign-in'));
});

router.get('/sign-up', async (req, res) => {
    res.send(await getTemplate('account/sign-up'));
});

router.post('/sign-in', Account.notSignedIn, async(req, res) => {
    const { 
        'Username or Email': username,
        'Password': password
    } = req.body;

    let a = await Account.fromUsername(username);

    // send the same error for both username and password to prevent username enumeration
    if (!a) { 
        a = await Account.fromEmail(username);
        if (!a) return Status.from('account.invalidUsernameOrPassword', req, { username: username }).send(res);
    }

    const account = a;

    if (!account.verified) {
        return Status.from('account.notVerified', req, { username: username }).send(res);
    }

    const hash = Account.hash(password, account.salt);
    if (hash !== account.key) 
        return Status
            .from('account.invalidUsernameOrPassword', req, { username: username })
            .send(res);

    req.session.signIn(account);

    console.log('redirecting to: ', req.session.prevUrl);

    // adaptable status
    const status = new Status(
        'Account',
        'Logged In',
        ColorCode.success,
        200,
        'You have been logged in, redirecting...',
        req.session.prevUrl || '/home',
        req,
        JSON.stringify({ username: username })
    );

    status.send(res);
});





router.post('/sign-up', Account.notSignedIn, async(req, res) => {
    const {
        'Username': username,
        'Password': password,
        'Confirm Password': confirmPassword,
        'First Name': firstName,
        'Last Name': lastName,
        '__email': email
    } = req.body;

    console.log({
        username,
        password,
        confirmPassword,
        firstName,
        lastName,
        email
    });

    if (password !== confirmPassword) return Status.from('account.passwordMismatch', req).send(res);

    const status = await Account.create(username, password, email, firstName, lastName);

    Status.from('account.' + status, req).send(res);


    req.io.emit('new-account', username);
});







// req.session.account is always available when Account.allowRoles/Permissions is used
// however, typescript doesn't know that, so we have to cast it





router.post('/reject-account', Account.allowPermissions('verify'), async(req, res) => {
    const { username } = req.body;

    if (username === req.session.account?.username) return Status.from('account.cannotEditSelf', req).send(res);

    const account = await Account.fromUsername(username);
    if (!account) return Status.from('account.notFound', req, { username }).send(res);


    const status = await Account.delete(username);
    Status.from('account.' + status, req, { username }).send(res);

    req.io.emit('remove-account', username);
});






router.post('/my-account', async(req, res) => {
    const { account } = req.session;
    if (!account) return Status.from('account.notLoggedIn', req).send(res);
    res.json(account.safe);
});



router.post('/all', Role.allowRoles('developer'), async (req, res) => {
    const accounts = await Account.all();
    res.json(await Promise.all(accounts.map(a => a.safe())));
});



router.post('/remove-account', Account.allowPermissions('editUsers'), async(req, res) => {
    const { username } = req.body;

    if (username === req.session.account?.username) return Status.from('account.cannotEditSelf', req).send(res);

    const status = await Account.delete(username);
    Status.from('account.' + status, req, { username }).send(res);

    req.io.emit('remove-account', username);
});









router.post('/add-role', Account.allowPermissions('editRoles'), async(req, res) => {
    const { username, role } = req.body;

    if (username === req.session.account?.username) return Status.from('account.cannotEditSelf', req).send(res);

    const account = await Account.fromUsername(username);
    if (!account) return Status.from('account.notFound', req, { username }).send(res);

    const [status] = await account.addRole(role);
    Status.from('role.' + status, req, { username, role }).send(res);

    req.io.emit('add-role', username, role);
});

router.post('/remove-role', Account.allowPermissions('editRoles'), async(req, res) => {
    const { username, role } = req.body;

    if (username === req.session.account?.username) return Status.from('account.cannotEditSelf', req).send(res);

    const account = await Account.fromUsername(username);
    if (!account) return Status.from('account.notFound', req, { username }).send(res);

    const [status] = await account.removeRole(role);
    Status.from('role.' + status, req, { username, role }).send(res);

    req.io.emit('remove-role', username, role);
});


// router.post('/add-skill', async(req, res) => {
//     const { username, skill, years } = req.body;

//     if (typeof skill !== 'string' || skill.length < 1) return Status.from('account.invalidSkill', req).send(res);
//     if (typeof years !== 'number' || years <= 0) return Status.from('account.invalidYears', req).send(res);

//     // if (username === req.session.account?.username) return Status.from('account.cannotEditSelf', req).send(res);

//     const account = await Account.fromUsername(username);
//     if (!account) return Status.from('account.notFound', req, { username }).send(res);

//     const [status] = await account.addSkill({ skill, years });
//     Status.from('skill.' + status, req, { username, skill, years }).send(res);

//     req.io.emit('add-skill', username, skill);
// });


// router.post('/remove-skill', async(req, res) => {
//     const { username, skill } = req.body;

//     // if (username === req.session.account?.username) return Status.from('account.cannotEditSelf', req).send(res);

//     const account = await Account.fromUsername(username);
//     if (!account) return Status.from('account.notFound', req, { username }).send(res);

//     const [status] = await account.removeSkill(skill);
//     Status.from('skill.' + status, req, { username, skill }).send(res);

//     req.io.emit('remove-skill', username, skill);
// });

router.get('/verify/:id', async (req, res, next) => {
    const { id } = req.params;

    const account = await Account.fromVerificationKey(id);
    if (!account) return Status.from('account.invalidVerificationKey', req).send(res);

    const status = await account.verify();

    Status.from('account.' + status, req, { username: account.username }).send(res);

    req.io.emit('verify-account', account.username);
});




router.post('/reset-password', async(req, res) => {
    const { username } = req.body;

    const account = await Account.fromUsername(username);
    if (!account) return Status.from('account.notFound', req, { username }).send(res);

    const key = await account.requestPasswordChange();
    account.sendEmail('Password Reset', EmailType.link, {
        constructor: {
            title: 'Password Reset',
            message: 'Click the button below to reset your password',
            link: process.env.DOMAIN + '/account/reset-password/' + key,
            linkText: 'Reset Password'
        }
    });

    Status.from('account.passwordReset', req, { username }).send(res);
});

router.get('/reset-password/:key', async(req, res) => {
    const { key } = req.params;
    const account = await Account.fromPasswordChangeKey(key);
    if (!account) return Status.from('account.invalidPasswordRequestKey', req).send(res);

    const template = await getTemplate('account/reset-password');
    res.send(template);
});

router.post('/reset-password/:key', async(req, res) => {
    const { key } = req.params;
    const { password, confirmPassword } = req.body;

    if (password !== confirmPassword) return Status.from('account.passwordMismatch', req).send(res);

    const account = await Account.fromPasswordChangeKey(key);
    if (!account) return Status.from('account.invalidPasswordRequestKey', req).send(res);

    const status = await account.changePassword(key, password);

    Status.from('account.' + status, req, {
        username: account.username
    }).send(res);
});






router.post('/change-username', Account.allowPermissions('editUsers'), async(req, res) => {
    const { username, newUsername } = req.body;

    const account = await Account.fromUsername(username);
    if (!account) return Status.from('account.notFound', req, { username }).send(res);

    const status = await account.changeUsername(newUsername);
    Status.from('account.' + status, req, { username, newUsername }).send(res);

    req.io.emit('change-username', username, newUsername);
});


router.post('/change-email', Account.allowPermissions('editUsers'), async(req, res) => {
    const { username, newEmail } = req.body;

    const account = await Account.fromUsername(username);
    if (!account) return Status.from('account.notFound', req, { username }).send(res);

    const status = await account.changeEmail(newEmail);

    Status.from('account.' + status, req, { username, newEmail }).send(res);

    req.io.emit('change-email', username, newEmail);
});


router.post('/change-first-name', Account.allowPermissions('editUsers'), async(req, res) => {
    const { username, newFirstName } = req.body;

    const account = await Account.fromUsername(username);
    if (!account) return Status.from('account.notFound', req, { username }).send(res);

    const status = await account.change(AccountDynamicProperty.firstName, newFirstName);

    Status.from('account.' + status, req, { username, newFirstName }).send(res);

    req.io.emit('change-first-name', username, newFirstName);
});

router.post('/change-last-name', Account.allowPermissions('editUsers'), async(req, res) => {
    const { username, newLastName } = req.body;

    const account = await Account.fromUsername(username);
    if (!account) return Status.from('account.notFound', req, { username }).send(res);

    const status = await account.change(AccountDynamicProperty.lastName, newLastName);

    Status.from('account.' + status, req, { username, newLastName }).send(res);

    req.io.emit('change-last-name', username, newLastName);
});

router.post('/change-picture', fileStream({
    extensions: [
        'png',
        'jpg',
        'jpeg'
    ]
}), async(req, res) => {
    const { body: { username }, file } = req;
    const id = file?.id;
    if (!id) return Status.from('account.invalidPicture', req).send(res);

    const account = await Account.fromUsername(username);
    if (!account) return Status.from('account.notFound', req, { username }).send(res);

    const status = await account.change(AccountDynamicProperty.picture, id);

    Status.from('account.' + status, req, { username, picture: id }).send(res);
});

// router.post('/change-bio', Account.allowPermissions('editUsers'), async(req, res) => {
//     const { username, bio } = req.body;

//     const account = await Account.fromUsername(username);
//     if (!account) return Status.from('account.notFound', req, { username }).send(res);

//     const status = await account.changeBio(bio);

//     Status.from('account.' + status, req, { username, bio }).send(res);

//     req.io.emit('change-bio', username, bio);
// });

export default router;