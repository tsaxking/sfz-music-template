import express, { NextFunction, Request, Response } from 'express';
import { Server, Socket } from 'socket.io';
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import { Session } from './server-functions/structure/sessions';
import { emailValidation } from './server-functions/middleware/spam-detection';
import { Worker, isMainThread, workerData, parentPort } from 'worker_threads';
import { config } from 'dotenv';
import './server-functions/declaration-merging/express.d.ts';
import { Status } from './server-functions/structure/status';
import { SocketWrapper, initSocket } from './server-functions/structure/socket';
import Account from './server-functions/structure/accounts';
import { getTemplateSync, getJSON, LogType, log, getTemplate, getJSONSync } from './server-functions/files';
import { Member } from './server-functions/structure/member';
import { Colors } from './server-functions/colors';

config();

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



const { PORT, DOMAIN } = process.env;

const [,, env, ...args] = workerData?.args ? [,,...workerData.args] : process.argv;


const app = express();

const server = http.createServer(app);
const io = new Server(server);

initSocket(io);

app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '50mb' }));
app.use('/static', express.static(path.resolve(__dirname, './static')));
app.use('/uploads', express.static(path.resolve(__dirname, './uploads')));

app.get('/favicon.ico', (req, res) => {
    res.sendFile(path.resolve(__dirname, './static/pictures/logo-square.png'));
});

app.get('/robots.txt', (req, res) => {
    res.sendFile(path.resolve(__dirname, './static/pictures/robots.jpg'));
});


app.use((req, res, next) => {
    req.io = io;
    req.start = Date.now();

    const { cookie } = req.headers;
    const { tab } = parseCookie(cookie || '');
    if (!tab) return next();
    if (SocketWrapper.sockets[tab]) {
        req.socketIO = SocketWrapper.sockets[tab];
    }

    next();
});


function stripHtml(body: any) {
    let files: any;

    if (body.files) {
        files = JSON.parse(JSON.stringify(body.files));
        delete body.files;
    }

    let obj: any = {};

    const remove = (str: string) => str.replace(/(<([^>]+)>)/gi, '');

    const strip = (obj: any): any => {
        switch (typeof obj) {
            case 'string':
                return remove(obj);
            case 'object':
                if (Array.isArray(obj)) {
                    return obj.map(strip);
                }
                for (const key in obj) {
                    obj[key] = strip(obj[key]);
                }
                return obj;
            default:
                return obj;
        }
    }


    obj = strip(body);

    if (files) {
        obj.files = files;
    }

    return obj;
}

app.use(Session.middleware as NextFunction);

app.use((req, res, next) => {
    console.log(Colors.FgRed, `[${req.method}]`, Colors.Reset, req.originalUrl, Colors.FgYellow, req.session.account?.username || 'Not logged in', Colors.Reset);
    next();
});

// logs body of post request
app.post('/*', (req, res, next) => {
    req.body = stripHtml(req.body);
    console.log(req.body);
    next();
});
// production/testing/development middleware


app.use((req, res, next) => {
    switch (env) {
        case 'prod':
            (() => {
                // This code will only run in production


            })();
            break;
        case 'test':
            (() => {
                // this code will only run in testing
                // you could add features like auto-reloading, automatic sign-in, etc.


            })();
            break;
        case 'dev':
            (() => {
                // this code will only run in development
                // you could add features like auto-reloading, automatic sign-in, etc.


            })();
            break;
    }

    next();
});


// spam detection
// app.post('/*', detectSpam(['message', 'name', 'email'], {
//     onSpam: (req, res, next) => {
//         res.json({ error: 'spam' });
//     },
//     onerror: (req, res, next) => {
//         res.json({ error: 'error' });
//     }
// } as Options));

app.post('/*', emailValidation(['email', 'confirmEmail'], {
    onspam: (req, res, next) => {
        Status.from('spam', req).send(res);
    },
    onerror: (req, res, next) => {
        Status.from('spam', req).send(res);
    }
}));





// █▀▄ ██▀ ▄▀▄ █ █ ██▀ ▄▀▀ ▀█▀ ▄▀▀ 
// █▀▄ █▄▄ ▀▄█ ▀▄█ █▄▄ ▄█▀  █  ▄█▀ 

// this can be used to build pages on the fly and send them to the client
// app.use(builder);


const homePages = getJSONSync('pages/home') as string[];
import { homeBuilder, navBuilder } from './server-functions/page-builder';

app.get('/', (req, res, next) => {
    res.redirect('/home');
});

app.get('/*', async (req, res, next) => {
    if (homePages.includes(req.url.slice(1))) {
        return res.send(
            await homeBuilder(req.url)
        );
    }
    next();
});


app.get('/about-member/:member', async (req, res, next) => {
    const { member } = req.params;

    const m = await Member.get(member);
    if (!m) return Status.from('member.notFound', req).send(res);
    const a = await Account.fromUsername(member);
    if (!a) return Status.from('account.notFound', req).send(res);

    res.send(await getTemplate('sfz-music/member', {
        ...a,
        ...m
    }));
});







import accounts from './server-functions/routes/account';
app.use('/account', accounts);


app.use(async (req, res, next) => {
    const username = process.env.AUTO_SIGN_IN as string;
    // if auto sign in is enabled, sign in as the user specified in the .env file
    if (env !== 'prod' && username && req.session.account?.username !== username) {
        const account = await Account.fromUsername(username as string);
        if (account) {
            req.session.signIn(account);
        }
    }
    next();
});


app.use((req, res, next) => {
    // console.log(req.session.account);
    if (!req.session.account) {
        // return Status.from('account.notLoggedIn', req).send(res);
        req.session.prevUrl = req.originalUrl;
        return res.redirect('/account/sign-in');
    }
    next();
});




// █▀▄ ▄▀▄ █ █ ▀█▀ █ █▄ █ ▄▀  
// █▀▄ ▀▄▀ ▀▄█  █  █ █ ▀█ ▀▄█ 


import admin from './server-functions/routes/admin';
import { parseCookie } from './server-functions/structure/cookie';
app.use('/admin', admin);










type Link = {
    name: string;
    html: string;
    icon: string;
    pathname: string;
    scripts: string[];
    styles: string[];
    keywords: string[];
    description: string;
    screenInfo: {
        size: string;
        color: string
    };
    prefix: string;
    display: boolean;
    permission?: string;
};

type Page = {
    name: string;
    links: Link[];
    display: boolean;
};





app.use('/404', (req, res) => {
    Status.from('page.notFound', req).send(res);
});

import { router as MemberRouter } from './server-functions/routes/member';
import Role from './server-functions/structure/roles';

app.use('/member', MemberRouter);





const getBlankTemplate = (page: string): NextFunction => {
    const fn = async (req: Request, res: Response) => {

        const { page: requestedPage } = req.params;

        // const permissions = await req.session.account?.getPermissions();

        // if (permissions?.permissions.includes('logs')) {
        //     req.session.getSocket(req)?.join('logs');
        // }


        const pages = await getJSON('pages/' + page) as Page[];

        // const links = pages.map(p => p.links).some(linkList => linkList.some(l =>  l.pathname === req.originalUrl));

        // if (!links) return res.redirect(`/${page}` + pages[0].links[0].pathname);

        const cstr = {
            pages: (await Promise.all(pages.map(async p => {
                return Promise.all(p.links.map(async l => {
                    if (l.display === false) return;
                    return {
                        title: l.name,
                        content: await getTemplate(`dashboards/${page}/` + l.html),
                        lowercaseTitle: l.name.toLowerCase().replace(/ /g, '-'),
                        prefix: l.prefix,
                        year: new Date().getFullYear()
                    }
                }))
            }))).flat(Infinity).filter(Boolean),


            navSections: pages.flatMap(page => {
                return [
                    {
                        navScript: {
                            title: page.name,
                            type: 'navTitle'
                        }
                    },
                    ...page.links.map(l => {
                        if (l.display === false) return;
                        return {
                            navScript: {
                                name: l.name,
                                type: 'navLink',
                                pathname: l.pathname,
                                icon: l.icon,
                                lowercaseTitle: l.name.toLowerCase().replace(/ /g, '-'),
                                prefix: l.prefix
                            }
                        }
                    })
                ];
            }).flat(Infinity).filter(Boolean),


            description: 'sfzMusic Dashboard',
            keywords: 'sfzMusic, Dashboard',
            offcanvas: true,
            navbar: await navBuilder(req.url, true),
            year: new Date().getFullYear(),
            script: await getTemplate('dashboards/' + page + '/script'),
        };

        const html = await getTemplate('dashboard-index', cstr);
        res.status(200).send(html);
    };

    return fn as unknown as NextFunction;
};





app.get('/member/:page', Account.isSignedIn, Member.isMember, getBlankTemplate('member'));
// app.get('/instructor/:page', Account.isSignedIn, getBlankTemplate('instructor'));
app.get('/admin/:page', Role.allowRoles('admin'), getBlankTemplate('admin'));
// app.get('/student/:page', Account.isSignedIn, getBlankTemplate('student'));
// app.get('/library/:page', Account.isSignedIn, getBlankTemplate('library'));























type Log = {
    date: number,
    duration: number,
    ip?: string|null,
    method: string,
    url: string,
    status: number,
    userAgent?: string,
    body: string,
    params: string,
    query: string
}


let logCache: Log[] = [];

// sends logs to client every 10 seconds
setInterval(() => {
    if (logCache.length) {
        io.to('logs').emit('request-logs', logCache);
        logCache = [];
    }
}, 1000 * 10);

app.use((req, res, next) => {
    const csvObj: Log = {
        date: Date.now(),
        duration: Date.now() - req.start,
        ip: req.session.ip,
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        userAgent: req.headers['user-agent'],
        body: req.method == 'post' ? JSON.stringify((() => {
            let { body } = req;
            body = JSON.parse(JSON.stringify(body));
            delete body.password;
            delete body.confirmPassword;
            delete body.files;
            return body;
        })()) : '',
        params: JSON.stringify(req.params),
        query: JSON.stringify(req.query)
    };

    logCache.push(csvObj);

    log(LogType.request, csvObj);
});


server.listen(PORT, () => {
    console.log('------------------------------------------------');
    console.log(`Listening on port \x1b[35m${DOMAIN}...\x1b[0m`);
});