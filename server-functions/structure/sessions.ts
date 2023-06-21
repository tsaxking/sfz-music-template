import { Request, Response, NextFunction } from 'express';
import { getClientIp } from 'request-ip';
import { v4 as uuid } from 'uuid';
import Account from './accounts';
import * as fs from 'fs';
import * as path from 'path';
import { parseCookie } from './cookie';
import { Socket } from 'socket.io';

type CustomRequest = Request & { session: Session };


export class Session {
    static middleware(req: CustomRequest, res: Response, next: NextFunction) {
        if (!req.session) {
            req.session = new Session(req, res);
            Session.addSession(req.session);
        }
        next();
    }

    static _sessions: { [key: string]: Session } = {};
    static get sessions() {
        return Session._sessions;
    }
    static addSession(session: Session) {
        Session._sessions[session.id] = session;
        if (!session.account) {
            session.signOut();
            session.account = new Account({
                username: 'guest',
                key: '',
                salt: '',
                verified: 1,
                roles: JSON.stringify(['guest']),
                email: '',
                name: 'Guest',
                tatorBucks: 0,
                info: '{}'
            })
        }
    }
    static removeSession(session: Session) {
        delete Session._sessions[session.id];
    }

    static saveSessions() {
        const s: {[key: string]: any} = {};
        Object.entries(Session.sessions).forEach(([id, session]) => {
            // customize what you want to save
            s[id] = {
                ip: session.ip,
                id: session.id,
                latestActivity: session.latestActivity,
                account: session.account?.username
            };
        });

        fs.writeFile(path.resolve(__dirname, './sessions.txt'), JSON.stringify(s, null, 4), err => {
            if (err) {
                console.error(err);
                console.log(Session.sessions);
            }
        });
    }

    static loadSessions() {
        if (!fs.existsSync(path.resolve(__dirname, './sessions.txt'))) return fs.writeFileSync(path.resolve(__dirname, './sessions.txt'), '{}', 'utf8');

        const s = fs.readFileSync(path.resolve(__dirname, './sessions.txt'), 'utf8');
        const sessions = JSON.parse(s) as {[key: string]: any};

        return Promise.all(Object.entries(sessions).map(async ([id, session]) => {
            Session.addSession(await Session.fromSessObj(session));
        }));
    }

    static async fromSessObj(s: any) {
        const session = new Session();
        session.ip = s.ip;
        session.id = s.id;
        session.latestActivity = s.latestActivity;
        session.account = await Account.fromUsername(s.account);
        return session;
    }

    static addSocket(socket: Socket): boolean {
        const cookie = socket.handshake.headers.cookie;
        if (!cookie) return false;
        const { id } = parseCookie(cookie) as { id: string };
        if (!id) return false;
        const session = Session.sessions[id];
        if (!session) return false;
        session.setSocket(socket);
        return true;
    }



    ip: string|null;
    id: string;
    latestActivity: number = Date.now();
    account: Account|null = null;
    socket?: Socket;

    constructor(req?: CustomRequest, res?: Response) {
        if (req) this.ip = getClientIp(req);
        else this.ip = 'unknown';
        this.id = uuid();

        if (res) res.cookie('ssid', this.id, {
            httpOnly: true,
            maxAge: 1000 * 60 * 60 * 24 * 365 * 10 // 10 years
        });
    }

    setSocket(socket: Socket) {
        this.socket = socket;
    }

    signIn(account: Account) {
        this.account = account;
    }

    signOut() {
        this.account = null;
    }

    destroy() {
        Session.removeSession(this);
    }
}

Session.loadSessions();

setInterval(Session.saveSessions, 1000 * 10); // save sessions every 10 seconds