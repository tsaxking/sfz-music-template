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
import { MembershipProgress } from "./member";


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

    static async fromVerificationKey(key: string): Promise<Account|null> {
        const cachedAccount = Object.values(Account.cachedAccounts).find((a) => a.verification === key);

        if (cachedAccount) return cachedAccount;

        const query = `
            SELECT * FROM Accounts
            WHERE verification = ?
        `;

        const act = await MAIN.get(query, [key]);
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
        const fn = async (req: Request, res: Response, next: NextFunction) => {
            const { session } = req;
            const { account } = session;

            if (!account) {
                return Status.from('account.notLoggedIn', req).send(res);
            }

            const roles = await account.getRoles();

            if (role.every(r => roles.find(_r => _r.name === r))) {
                return next();
            } else {
                const s = Status.from('roles.invalid', req);
                return s.send(res);
            }
        }

        return fn as unknown as NextFunction;
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

        const query = `
            INSERT INTO Accounts (
                username,
                key,
                salt,
                info,
                roles,
                firstName,
                lastName,
                email,
                verified
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?
            )
        `;

        await MAIN.run(query, [
            username,
            key,
            salt,
            JSON.stringify({}),
            JSON.stringify([]),
            firstName,
            lastName,
            email,
            0
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

        const query = `
            DELETE FROM Accounts
            WHERE username = ?
        `;

        await MAIN.run(query, [username]);

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

            const query = `
                UPDATE Accounts
                SET email = ?, emailChange = null
                WHERE username = ?
            `;

            await MAIN.run(query, [email, this.username]);
            this.email = email;
            delete this.emailChange;

            return AccountStatus.verified;
        }


        const query = `
            UPDATE Accounts
            SET verified = 1, verification = null
        `;

        await MAIN.run(query);
        this.verified = 1;
        delete this.verification;

        return AccountStatus.verified;
    }


    async sendVerification() {
        const key = uuid();
        const query = `
            UPDATE Accounts
            SET verification = ?
            WHERE username = ?
        `;

        await MAIN.run(query, [key, this.username]);

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





    async getMemberInfo(): Promise<{
        skills: string[];
        bio: string;
        title: string;
        resume: string|null;
        status: MembershipProgress
    }> {
        const query = `
            SELECT * FROM MemberInfo
            WHERE username = ?
        `;

        const result = await MAIN.get(query, [this.username]);

        return {
            skills: await this.getSkills(),
            bio: result?.bio || '',
            title: result?.title || '',
            resume: result?.resume || null,
            status: result?.status || MembershipProgress.pending
        };
    }

    async sendEmail(subject: string, type: EmailType, options: EmailOptions) {
        const email = new Email(this.email, subject, type, options);
        return email.send();
    }







    async getRoles(): Promise<Role[]> {
        const query = `
            SELECT * FROM AccountRoles
            WHERE username = ?
        `;

        const data = await MAIN.all(query, [this.username]);

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

            const query = `
                INSERT INTO AccountRoles (
                    username,
                    role
                ) VALUES (
                    ?, ?
                )
            `;

            await MAIN.run(query, [this.username, role]);

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

            const query = `
                DELETE FROM AccountRoles
                WHERE username = ? AND role = ?
            `;

            await MAIN.run(query, [this.username, role]);

            return AccountStatus.roleRemoved;
        }));
    }







    async addSkill(...skills: { skill: string, years: number }[]): Promise<AccountStatus[]> {
        return Promise.all(skills.map(async(skill) => {
            const existsQuery = `
                SELECT * FROM MemberSkills
                WHERE username = ? AND skill = ?
            `;

            const exists = await MAIN.get(existsQuery, [this.username, skill.skill]);
            if (exists) return AccountStatus.hasSkill;

            const query = `
                INSERT INTO MemberSkills (
                    username,
                    skill,
                    years
                ) VALUES (
                    ?, ?, ?
                )
            `;

            await MAIN.run(query, [this.username, skill.skill, Math.round(skill.years * 10) / 10]);
            return AccountStatus.skillAdded;
        }));
    }

    async removeSkill(...skills: string[]): Promise<AccountStatus[]> {
        return Promise.all(skills.map(async(skill) => {
            const existsQuery = `
                SELECT * FROM MemberSkills
                WHERE username = ? AND skill = ?
            `;

            const exists = await MAIN.get(existsQuery, [this.username, skill]);
            if (!exists) return AccountStatus.noSkill;

            const query = `
                DELETE FROM MemberSkills
                WHERE username = ? AND skill = ?
            `;

            await MAIN.run(query, [this.username, skill]);
            return AccountStatus.skillRemoved;
        }));
    }

    async getSkills(): Promise<string[]> {
        const query = `
            SELECT * FROM MemberSkills
            WHERE username = ?
        `;

        const data = await MAIN.all(query, [this.username]);
        return data.map((d: { skill: string }) => d.skill);
    }





    async getPermissions(): Promise<PermissionsObject> {
        const roles = await this.getRoles();

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



    async change(property: AccountDynamicProperty, to: string): Promise<AccountStatus> {
        if (property !== AccountDynamicProperty.picture &&!Account.valid(to)) {
            return AccountStatus.invalidName;
        }

        const query = `
            UPDATE Accounts
            SET ${property} = ?
            WHERE username = ?        
        `;

        await MAIN.run(query, [to, this.username]);

        this[property] = to;

        return AccountStatus.success;
    }


    async changeUsername(username: string): Promise<AccountStatus> {
        const findQuery = `
            SELECT * FROM Accounts
            WHERE username = ?
        `;

        if (await MAIN.get(findQuery, [username])) return AccountStatus.usernameTaken;

        const query = `
            UPDATE Accounts
            SET username = ?
            WHERE username = ?
        `;

        await MAIN.run(query, [username, this.username]);

        this.username = username;

        return AccountStatus.success;
    }


    


    
    testPassword(password: string): boolean {
        const hash = Account.hash(password, this.salt);
        return hash === this.key;
    }


    async changeEmail(email: string) {
        const existsQuery = `
            SELECT * FROM Accounts
            WHERE email = ?
        `;

        const exists = await MAIN.get(existsQuery, [email]);

        if (exists) return AccountStatus.emailTaken;

        const query = `
            UPDATE Accounts
            SET emailChange = ?
            WHERE username = ?
        `;

        this.emailChange = {
            email,
            date: Date.now()
        }

        MAIN.run(query, [
            JSON.stringify(this.emailChange),
            this.username
        ]);

        this.sendVerification();

        return AccountStatus.checkEmail;
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

        return AccountStatus.passwordChangeSuccess;
    }



    async changeBio(bio: string) {
        if (!Account.valid(bio, [' '])) return AccountStatus.invalidBio;

        const query = `
            UPDATE MemberInfo
            SET bio = ?
            WHERE username = ?
        `;

        await MAIN.run(query, [bio, this.username]);

        return AccountStatus.success;
    }


    async changeTitle(title: string) {
        if (!Account.valid(title, [' '])) return AccountStatus.invalidTitle;

        const query = `
            UPDATE MemberInfo
            SET title = ?
            WHERE username = ?
        `;

        await MAIN.run(query, [title, this.username]);

        return AccountStatus.success;
    }
};