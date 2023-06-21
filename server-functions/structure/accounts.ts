import { MAIN } from "../databases";
import crypto from "crypto";
import { uuid } from "./uuid";
import Role from "./roles";
import { NextFunction, Request, Response } from "express";
import { Status } from "./status";
import { validate } from 'deep-email-validator';
import { Email, EmailType } from "./email";
import { config } from 'dotenv';


config();


type AccountObject = {
    username: string;
    key: string;
    salt: string;
    info: string; // json string
    roles: string; // json string
    name: string;
    email: string;
    verified: number;
    passwordChange?: string;
    tatorBucks: number;
    discordLink?: string; // json string
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

    // verification
    alreadyVerified = 'alreadyVerified',
    notVerified = 'notVerified', 

    // login
    incorrectPassword = 'incorrectPassword',
    incorrectUsername = 'incorrectUsername',
    incorrectEmail = 'incorrectEmail',



    // roles
    hasRole = 'hasRole',
    noRole = 'noRole',




    // password change
    passwordChangeSuccess = 'passwordChangeSuccess',  
    passwordChangeInvalid = 'passwordChangeInvalid',
    passwordChangeExpired = 'passwordChangeExpired',
    passwordChangeUsed = 'passwordChangeUsed'
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

    static async fromRole(role: string): Promise<Account[]> {
        const query = `
            SELECT * FROM Accounts
            WHERE roles LIKE ?
        `;

        const data = await MAIN.all(query, [`%${role}%`]);
        return data.map((a: AccountObject) => new Account(a));
    }

    static async fromUsername(username: string): Promise<Account|null> {
        if (Account.cachedAccounts[username]) return Account.cachedAccounts[username];

        const query = `
            SELECT * FROM Accounts
            WHERE username = ?
        `;

        let data = await MAIN.get(query, [username]);
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

        // find in database
        const query = `
            SELECT * FROM Accounts
            WHERE email = ?
        `;

        let data = await MAIN.get(query, [email]);
        if (!data) return null;
        const a = new Account(data as AccountObject);
        Account.cachedAccounts[a.username] = a;
        return a;
    }

    static async fromPasswordChangeKey(key: string): Promise<Account|null> {
        // find in cache
        for (const username in Account.cachedAccounts) {
            const account = Account.cachedAccounts[username];
            if (account.passwordChange === key) return account;
        }


        const query = `
            SELECT * FROM Accounts
            WHERE passwordChange = ?
        `;

        let data = await MAIN.get(query, [key]);
        if (!data) return null;
        const a = new Account(data as AccountObject);
        Account.cachedAccounts[a.username] = a;
        return a;
    }

    static async verifiedAccounts(): Promise<Account[]> {
        const query = `
            SELECT * FROM Accounts
            WHERE verified = 1
        `;

        const data = await MAIN.all(query);
        return data.map((a: AccountObject) => new Account(a));
    }

    static async unverifiedAccounts(): Promise<Account[]> {
        const query = `
            SELECT * FROM Accounts
            WHERE verified = 0
        `;

        const data = await MAIN.all(query);
        return data.map((a: AccountObject) => new Account(a));
    }

    static allowPermissions(...permission: string[]): NextFunction {
        const fn = (req: Request, res: Response, next: NextFunction) => {
            const { session } = req;
            const { account } = session;

            if (!account) {
                const s = Status.from('account.notLoggedIn', req);
                return s.send(res);
            }

            account.getPermissions()
                .then((permissions) => {
                    if (permissions.permissions.every((p) => permission.includes(p))) {
                        return next();
                    } else {
                        const s = Status.from('permissions.invalid', req);
                        return s.send(res);
                    }
                })
                .catch((err) => {
                    const s = Status.from('permissions.error', req, err);
                    return s.send(res);
                })
        }

        return fn as NextFunction;
    }

    static allowRoles(...role: string[]): NextFunction {
        const fn = (req: Request, res: Response, next: NextFunction) => {
            const { session } = req;
            const { account } = session;

            if (!account) {
                return Status.from('account.notLoggedIn', req).send(res);
            }

            const { roles } = account;

            if (role.every(r => roles.includes(r))) {
                return next();
            } else {
                const s = Status.from('roles.invalid', req);
                return s.send(res);
            }
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

        if (!account) {
            return Status.from('account.serverError', req).send(res);
        }

        if (account.username !== 'guest') {
            return Status.from('account.loggedIn', req).send(res);
        }

        next();
    }

    static async all(): Promise<Account[]> {
        const query = `
            SELECT * FROM Accounts
        `;

        const data = await MAIN.all(query);
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

    static valid(str: string): boolean {
        const allowedCharacters = [
            'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l',
            'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x',
            'y', 'z', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
            '_', '-', '!', '@', '#', '$', '%', '^', '&', '*', '(', ')',
            '+', '=', '{', '}', '[', ']', ':', ';', '"', "'", '<', '>',
            '?', '/', '|', ',', '.', '~', '`'
        ];

        return str
            .toLowerCase()
            .split('')
            .every(char => allowedCharacters.includes(char));
    }

    static async create(username: string, password: string, email: string, name: string): Promise<AccountStatus> {
        if (await Account.fromUsername(username)) return AccountStatus.usernameTaken;
        if (await Account.fromEmail(email)) return AccountStatus.emailTaken;

        const { valid } = Account;

        if (!valid(username)) return AccountStatus.invalidUsername;
        if (!valid(password)) return AccountStatus.invalidPassword;
        if (!valid(email)) return AccountStatus.invalidEmail;
        if (!valid(name)) return AccountStatus.invalidName;

        const emailValid = await validate({ email })
            .then((results) => !!results.valid)
            .catch(() => false);

        if (!emailValid) return AccountStatus.invalidEmail;

        const { salt, key } = Account.newHash(password);

        const query = `
            INSERT INTO Accounts (
                username,
                key,
                salt,
                info,
                roles,
                name,
                email,
                verified
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?
            )
        `;

        await MAIN.run(query, [
            username,
            key,
            salt,
            JSON.stringify({}),
            JSON.stringify([]),
            name,
            email,
            0
        ]);

        return AccountStatus.created;
    }

    static async verify(username: string): Promise<AccountStatus> {
        const account = await Account.fromUsername(username);
        if (!account) return AccountStatus.notFound;

        return account.verify();
    }

    static async unVerify(username: string): Promise<AccountStatus> {
        const account = await Account.fromUsername(username);
        if (!account) return AccountStatus.notFound;
        return account.unVerify();
    }

    // static async reject(username: string): Promise<AccountStatus> {}

    static async delete(username: string): Promise<AccountStatus> {
        const account = await Account.fromUsername(username);
        if (!account) return AccountStatus.notFound;

        const query = `
            DELETE FROM Accounts
            WHERE username = ?
        `;

        await MAIN.run(query, [username]);

        return AccountStatus.success;
    }

    static async addRole(username: string, ...role: string[]): Promise<AccountStatus> {
        const account = await Account.fromUsername(username);
        if (!account) return AccountStatus.invalidUsername;
        return account.addRole(...role);
    }

    static async removeRole(username: string, ...role: string[]): Promise<AccountStatus> {
        const account = await Account.fromUsername(username);
        if (!account) return AccountStatus.invalidUsername;
        return account.removeRole(...role);
    }





















    username: string;
    key: string;
    salt: string;
    info: AccountInfo;
    roles: string[];
    name: string;
    email: string;
    verified: boolean;
    passwordChange?: string|null;
    tatorBucks: number;
    discordLink?: DiscordLink;

    constructor(obj: AccountObject) {
        this.username = obj.username;
        this.key = obj.key;
        this.salt = obj.salt;
        this.info = JSON.parse(obj.info) as AccountInfo;
        this.roles = JSON.parse(obj.roles) as string[];
        this.name = obj.name;
        this.email = obj.email;
        this.verified = !!obj.verified;
        this.passwordChange = obj.passwordChange;
        this.tatorBucks = obj.tatorBucks;
        this.discordLink = JSON.parse(obj.discordLink || '{}') as DiscordLink;
    }

    get safe() {
        return {
            username: this.username,
            name: this.name,
            email: this.email,
            verified: this.verified,
            tatorBucks: this.tatorBucks,
            discordLink: this.discordLink
        };
    }

    async addRole(...role: string[]): Promise<AccountStatus> {
        const query = `
            UPDATE Accounts
            SET roles = ?
            WHERE username = ?
        `;

        this.roles.push(...role);
        this.roles = this.roles.filter((r, i) => this.roles.indexOf(r) === i); // Remove duplicates
        await MAIN.run(query, [JSON.stringify(this.roles), this.username]);

        return AccountStatus.success;
    }

    async removeRole(...role: string[]): Promise<AccountStatus> {
        const query = `
            UPDATE Accounts
            SET roles = ?
            WHERE username = ?
        `;

        this.roles = this.roles.filter(r => !role.includes(r));
        await MAIN.run(query, [JSON.stringify(this.roles), this.username]);

        return AccountStatus.success;
    }

    async verify(): Promise<AccountStatus> {
        if (this.verified) return AccountStatus.alreadyVerified;

        const query = `
            UPDATE Accounts
            SET verified = ?
            WHERE username = ?
        `;

        await MAIN.run(query, [1, this.username]);

        const e = new Email(this.email, 'Account Verified', EmailType.link, {
            constructor: {
                title: 'Account Verified',
                message: 'Please click the link below to go to the login page',
                link: `${process.env.DOMAIN}/account/sign-in`,
                linkText: 'Sign In'
            }
        });

        this.verified = true;
        return AccountStatus.success;
    }

    async unVerify(): Promise<AccountStatus> {
        if (!this.verified) return AccountStatus.notVerified;

        const query = `
            UPDATE Accounts
            SET verified = ?
            WHERE username = ?
        `;

        await MAIN.run(query, [0, this.username]);

        this.verified = false;
        return AccountStatus.success;
    }

    testPassword(password: string): boolean {
        const hash = Account.hash(password, this.salt);
        return hash === this.key;
    }

    async requestPasswordChange(): Promise<string> {
        const key = uuid();
        this.passwordChange = key;

        const query = `
            UPDATE Accounts
            SET passwordChange = ?
            WHERE username = ?
        `;

        await MAIN.run(query, [key, this.username]);
        return key;
    }

    async changePassword(key: string, password: string): Promise<AccountStatus> {
        if (key !== this.passwordChange) return AccountStatus.passwordChangeInvalid;

        const { salt, key: newKey } = Account.newHash(password);

        const query = `
            UPDATE Accounts
            SET key = ?, salt = ?, passwordChange = ?
            WHERE username = ?
        `;

        await MAIN.run(query, [newKey, salt, null, this.username]);
        this.key = newKey;
        this.salt = salt;
        this.passwordChange = null;

        return AccountStatus.success;
    }

    async getPermissions(): Promise<PermissionsObject> {
        const roles = await Promise.all(this.roles.map(r => Role.fromName(r)));

        let perms = roles.reduce((acc, role) => {
            acc.permissions.push(...role.permissions);
            acc.rank = Math.min(acc.rank, role.rank);
            return acc;
        }, {
            permissions: [],
            rank: Infinity
        } as PermissionsObject);

        perms.permissions = perms.permissions
            .filter((p, i) => perms.permissions.indexOf(p) === i); // Remove duplicates

        return perms;
    }
};