import { MAIN } from "../databases";
import crypto from "crypto";
import { uuid } from "./uuid";
import Role from "./roles";
import { NextFunction, Request, Response } from "express";
import { Status } from "./status";
import { validate } from 'deep-email-validator';
import { Email, EmailOptions, EmailType } from "./email";
import { config } from 'dotenv';
import Filter from 'bad-words';
import { Member, MemberInfo, MembershipProgress } from "./member";


config();


type AccountObject = {
    username: string;
    key: string;
    salt: string;
    info: string; // json string
    firstName: string;
    lastName: string;
    email: string;
    passwordChange?: string;
    discordLink?: string; // json string
    picture?: string;
    verified: number;
    verification?: string;
    emailChange?: string; // json string
}


type PermissionsObject = {
    permissions: string[];
    rank: number
}





export enum AccountStatus {
    success = 'success',
    invalidUsername = 'invalidUsername',
    invalidPassword = 'invalidPassword',
    invalidEmail = 'invalidEmail',
    invalidName = 'invalidName',
    usernameTaken = 'usernameTaken',
    emailTaken = 'emailTaken',
    notFound = 'notFound',
    created = 'created',
    removed = 'removed',
    checkEmail = 'checkEmail',
    emailChangeExpired = 'emailChangeExpired',

    // verification
    alreadyVerified = 'alreadyVerified',
    notVerified = 'notVerified', 
    verified = 'verified',
    invalidVerificationKey = 'invalidVerificationKey',

    // login
    incorrectPassword = 'incorrectPassword',
    incorrectUsername = 'incorrectUsername',
    incorrectEmail = 'incorrectEmail',



    // roles
    hasRole = 'hasRole',
    noRole = 'noRole',
    invalidRole = 'invalidRole',
    roleAdded = 'roleAdded',
    roleRemoved = 'roleRemoved',


    // skills
    hasSkill = 'hasRole',
    noSkill = 'noRole',
    invalidSkill = 'invalidRole',
    skillAdded = 'roleAdded',
    skillRemoved = 'roleRemoved',



    // password change
    passwordChangeSuccess = 'passwordChangeSuccess',  
    passwordChangeInvalid = 'passwordChangeInvalid',
    passwordChangeExpired = 'passwordChangeExpired',
    passwordChangeUsed = 'passwordChangeUsed',



    invalidBio = 'invalidBio',
    invalidTitle = 'invalidTitle',
}

export enum AccountDynamicProperty {
    firstName = 'firstName',
    lastName = 'lastName',
    picture = 'picture'
}


type AccountInfo = {};
type DiscordLink = {
    id: string;
    username: string;
    discriminator: string;
    avatar: string;
};


export default class Account {
    private static cachedAccounts: {
        [username: string]: Account
    } = {};

    static async fromUsername(username: string): Promise<Account|null> {
        if (Account.cachedAccounts[username]) return Account.cachedAccounts[username];

        let data = await MAIN.get('account-from-username', [username]);
        if (!data) return null;
        const a = new Account(data as AccountObject);
        Account.cachedAccounts[username] = a;
        return a;
    }

    static async fromEmail(email: string): Promise<Account|null> {
        // find in cache
        for (const username in Account.cachedAccounts) {
            const account = Account.cachedAccounts[username];
            if (account.email === email) return account;
        }


        let data = await MAIN.get('account-from-email', [email]);
        if (!data) return null;
        const a = new Account(data as AccountObject);
        Account.cachedAccounts[a.username] = a;
        return a;
    }

    static async fromVerificationKey(key: string): Promise<Account|null> {
        const cachedAccount = Object.values(Account.cachedAccounts).find((a) => a.verification === key);

        if (cachedAccount) return cachedAccount;

        const act = await MAIN.get('account-from-verification-key', [key]);
        if (!act) return null;

        const account = new Account(act as AccountObject);
        Account.cachedAccounts[account.username] = account;
        return account;
    }

    static async fromPasswordChangeKey(key: string): Promise<Account|null> {
        // find in cache
        for (const username in Account.cachedAccounts) {
            const account = Account.cachedAccounts[username];
            if (account.passwordChange === key) return account;
        }

        let data = await MAIN.get('account-from-password-change', [key]);
        if (!data) return null;
        const a = new Account(data as AccountObject);
        Account.cachedAccounts[a.username] = a;
        return a;
    }

    static allowPermissions(...permission: string[]): NextFunction {
        const fn = (req: Request, res: Response, next: NextFunction) => {
            const { session } = req;
            const { account } = session;

            if (!account) {
                const s = Status.from('account.notLoggedIn', req);
                return s.send(res);
            }

            // account.getPermissions()
            //     .then((permissions) => {
            //         if (permissions.permissions.every((p) => permission.includes(p))) {
            //             return next();
            //         } else {
            //             const s = Status.from('permissions.invalid', req);
            //             return s.send(res);
            //         }
            //     })
            //     .catch((err) => {
            //         const s = Status.from('permissions.error', req, err);
            //         return s.send(res);
            //     })
        }

        return fn as NextFunction;
    }

    static isSignedIn(req: Request, res: Response, next: NextFunction) {
        const { session: { account } } = req;

        if (!account) {
            return Status.from('account.serverError', req).send(res);
        }

        if (account.username === 'guest') {
            return Status.from('account.notLoggedIn', req).send(res);
        }

        next();
    }

    static notSignedIn(req: Request, res: Response, next: NextFunction) {
        const { session: { account } } = req;

        // if (!account) {
        //     return Status.from('account.serverError', req).send(res);
        // }

        if (!!account) {
            return Status.from('account.loggedIn', req).send(res);
        }

        next();
    }

    static async all(): Promise<Account[]> {
        const data = await MAIN.all('accounts');
        return data.map((a: AccountObject) => new Account(a));
    }


    // █▄ ▄█ ▄▀▄ █▄ █ ▄▀▄ ▄▀  █ █▄ █ ▄▀     ▄▀▄ ▄▀▀ ▄▀▀ ▄▀▄ █ █ █▄ █ ▀█▀ ▄▀▀ 
    // █ ▀ █ █▀█ █ ▀█ █▀█ ▀▄█ █ █ ▀█ ▀▄█    █▀█ ▀▄▄ ▀▄▄ ▀▄▀ ▀▄█ █ ▀█  █  ▄█▀ 

    static newHash(password: string): {salt: string, key: string} {
        const salt = crypto
            .randomBytes(32)
            .toString('hex');
        const key = Account.hash(password, salt);

        return { salt, key };
    }

    static hash(password: string, salt: string): string {
        return crypto
            .pbkdf2Sync(password, salt, 100000, 64, 'sha512')
            .toString('hex');
    }

    static valid(str: string, chars: string[] = []): boolean {
        const allowedCharacters = [
            'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l',
            'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x',
            'y', 'z', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
            '_', '-', '!', '@', '#', '$', '%', '^', '&', '*', '(', ')',
            '+', '=', '{', '}', '[', ']', ':', ';', '"', "'", '<', '>',
            '?', '/', '|', ',', '.', '~', '`'
        ];

        allowedCharacters.push(...chars);

        const invalidChars:string[] = [];

        let valid = str
            .toLowerCase()
            .split('')
            .every(char => {
                const validChar = allowedCharacters.includes(char);
                if (!validChar) invalidChars.push(char);
                return validChar;
            });

        if (!valid) console.log('Invalid characters:', invalidChars);
    

        // test for bad words
        const filtered = new Filter().clean(str);

        if (filtered !== str) {
            valid = false;
            invalidChars.push(...str.split(' ').filter((word, i) => word !== filtered.split(' ')[i]));
        }



        if (!valid) {
            console.log('Invalid characters/words:', invalidChars);
        }


        return valid;
    }

    static async create(username: string, password: string, email: string, firstName: string, lastName: string): Promise<AccountStatus> {
        if (await Account.fromUsername(username)) return AccountStatus.usernameTaken;
        if (await Account.fromEmail(email)) return AccountStatus.emailTaken;

        const { valid } = Account;

        if (!valid(username)) return AccountStatus.invalidUsername;
        if (!valid(password)) return AccountStatus.invalidPassword;
        if (!valid(email)) return AccountStatus.invalidEmail;
        if (!valid(firstName)) return AccountStatus.invalidName;
        if (!valid(lastName)) return AccountStatus.invalidName;

        const emailValid = await validate({ email })
            .then((results) => !!results.valid)
            .catch(() => false);

        if (!emailValid) return AccountStatus.invalidEmail;

        const { salt, key } = Account.newHash(password);


        await MAIN.run('new-account', [
            username,
            key,
            salt,
            JSON.stringify({}),
            firstName,
            lastName,
            email,
            false
        ]);

        Account.fromUsername(username)
            .then((a) => {
                if (!a) return; // should never happen
                a.sendVerification();
            })
            .catch(console.error);

        return AccountStatus.created;
    }

    // static async reject(username: string): Promise<AccountStatus> {}

    static async delete(username: string): Promise<AccountStatus> {
        const account = await Account.fromUsername(username);
        if (!account) return AccountStatus.notFound;

        await MAIN.run('delete-account', [username]);

        return AccountStatus.removed;
    }


















    username: string;
    key: string;
    salt: string;
    info: AccountInfo;
    firstName: string;
    lastName: string;
    email: string;
    passwordChange?: string|null;
    discordLink?: DiscordLink;
    picture?: string;
    verified: number;
    verification?: string;
    emailChange?: {
        email: string;
        date: number;
    } | null;

    constructor(obj: AccountObject) {
        this.username = obj.username;
        this.key = obj.key;
        this.salt = obj.salt;
        this.info = JSON.parse(obj.info) as AccountInfo;
        this.firstName = obj.firstName;
        this.lastName = obj.lastName;
        this.email = obj.email;
        this.passwordChange = obj.passwordChange;
        this.discordLink = JSON.parse(obj.discordLink || '{}') as DiscordLink;
        this.picture = obj.picture;
        this.verified = obj.verified;
        this.verification = obj.verification;

        if (obj.emailChange) {
            this.emailChange = JSON.parse(obj.emailChange) as {
                email: string;
                date: number;
            };
        }
    }



    async verify() {
        if (this.emailChange) {
            const { email, date } = this.emailChange;
            const now = Date.now();

            // 30 minutes
            if (now - date > 1000 * 60 * 30) {
                return AccountStatus.emailChangeExpired;
            }

            await MAIN.run('change-email', [email, this.username]);
            this.email = email;
            delete this.emailChange;

            return AccountStatus.verified;
        }


        await MAIN.run('verify', [this.username]);
        this.verified = 1;
        delete this.verification;

        return AccountStatus.verified;
    }


    async sendVerification() {
        const key = uuid();

        await MAIN.run('set-verification', [key, this.username]);

        const email = new Email(this.email, 'Verify your account', EmailType.link, {
            constructor: {
                link: `${process.env.DOMAIN}/account/verify/${key}`,
                linkText: 'Click here to verify your account',
                title: 'Verify your account',
                message: 'Click the button below to verify your account'
            }
        });

        return email.send();
    }


    async safe(include?: {
        roles?: boolean;
        memberInfo?: boolean;
        permissions?: boolean;
        email?: boolean;
    }) {
        return {
            username: this.username,
            firstName: this.firstName,
            lastName: this.lastName,
            picture: this.picture,
            email: include?.email ? this.email : undefined,
            roles: include?.roles ? await this.getRoles() : [],
            memberInfo: include?.memberInfo ? await this.getMemberInfo() : undefined,
            permissions: include?.permissions ? await this.getPermissions() : []
        };
    }





    async getMemberInfo(): Promise<MemberInfo | undefined> {
        return Member.get(this.username)
            .then((member) => member?.safe());
    }

    async sendEmail(subject: string, type: EmailType, options: EmailOptions) {
        const email = new Email(this.email, subject, type, options);
        return email.send();
    }







    async getRoles(): Promise<Role[]> {
        const data = await MAIN.all('account-roles', [this.username]);

        return Promise.all(data.map(({ role }) => {
            return Role.fromName(role);
        }));
    }

    async addRole(...roles: string[]): Promise<AccountStatus[]> {
        return Promise.all(roles.map(async (role) => {
            const r = await Role.fromName(role);
            if (!r) return AccountStatus.noRole;

            if ((await this.getRoles()).find(_r => _r.name === r.name)) {
                return AccountStatus.hasRole;
            }

            await MAIN.run('add-account-role', [this.username, role]);

            return AccountStatus.roleAdded;
        }));
    }

    async removeRole(...role: string[]): Promise<AccountStatus[]> {
        return Promise.all(role.map(async(role) => {
            const r = await Role.fromName(role);
            if (!r) return AccountStatus.noRole;

            if (!(await this.getRoles()).find(_r => _r.name === r.name)) {
                return AccountStatus.noRole;
            }

            await MAIN.run('remove-account-role', [this.username, role]);

            return AccountStatus.roleRemoved;
        }));
    }










    async getPermissions(): Promise<any> {
        // const roles = await this.getRoles();

        // let perms = roles.reduce((acc, role) => {
        //     acc.permissions.push(...role.permissions);
        //     acc.rank = Math.min(acc.rank, role.rank);
        //     return acc;
        // }, {
        //     permissions: [],
        //     rank: Infinity
        // } as PermissionsObject);

        // perms.permissions = perms.permissions
        //     .filter((p, i) => perms.permissions.indexOf(p) === i); // Remove duplicates

        // return perms;
    }



    async change(property: AccountDynamicProperty, to: string): Promise<AccountStatus> {
        if (property !== AccountDynamicProperty.picture &&!Account.valid(to)) {
            return AccountStatus.invalidName;
        }

        const query = `
            UPDATE Accounts
            SET ${property} = ?
            WHERE username = ?        
        `;

        await MAIN.unsafe.run(query, [to, this.username]);

        this[property] = to;

        return AccountStatus.success;
    }


    async changeUsername(username: string): Promise<AccountStatus> {
        const a = await Account.fromUsername(username);
        if (a) return AccountStatus.usernameTaken;

        await MAIN.run('change-username', [username, this.username]);

        this.username = username;

        return AccountStatus.success;
    }


    


    
    testPassword(password: string): boolean {
        const hash = Account.hash(password, this.salt);
        return hash === this.key;
    }


    async changeEmail(email: string) {
        const exists = await Account.fromEmail(email);

        if (exists) return AccountStatus.emailTaken;

        this.emailChange = {
            email,
            date: Date.now()
        }

        MAIN.run('request-email-change', [
            JSON.stringify(this.emailChange),
            this.username
        ]);

        this.sendVerification();

        return AccountStatus.checkEmail;
    }

    async requestPasswordChange(): Promise<string> {
        const key = uuid();
        this.passwordChange = key;

        await MAIN.run('request-password-change', [key, this.username]);
        return key;
    }

    async changePassword(key: string, password: string): Promise<AccountStatus> {
        if (key !== this.passwordChange) return AccountStatus.passwordChangeInvalid;

        const { salt, key: newKey } = Account.newHash(password);
        await MAIN.run('change-password', [newKey, salt, null, this.username]);
        this.key = newKey;
        this.salt = salt;
        this.passwordChange = null;

        return AccountStatus.passwordChangeSuccess;
    }
};