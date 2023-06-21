import { NextFunction, Request, Response } from "express";
import { LogType, getJSONSync, getTemplateSync, log } from "../files";
import Account from "./accounts";
import { Email, EmailType } from "./email";
import { config } from "dotenv";
import { Session } from "./sessions";
import { Server } from "socket.io";


declare global {
    namespace Express {
        interface Request {
            session: Session;
            start: number;
            io: Server;
        }
    }
}

config();




export enum ServerCode {
    continue = 100,
    switchingProtocols = 101,
    processing = 102,
    earlyHints = 103,

    ok = 200,
    created = 201,
    accepted = 202,
    nonAuthoritativeInformation = 203,
    noContent = 204,
    resetContent = 205,
    partialContent = 206,
    multiStatus = 207,
    alreadyReported = 208,
    imUsed = 226,

    multipleChoices = 300,
    movedPermanently = 301,
    found = 302,
    seeOther = 303,
    notModified = 304,
    useProxy = 305,
    unused = 306,
    temporaryRedirect = 307,
    permanentRedirect = 308,

    badRequest = 400,
    unauthorized = 401,
    paymentRequired = 402,
    forbidden = 403,
    notFound = 404,
    methodNotAllowed = 405,
    notAcceptable = 406,
    proxyAuthenticationRequired = 407,
    requestTimeout = 408,
    conflict = 409,
    gone = 410,
    lengthRequired = 411,
    preconditionFailed = 412,
    payloadTooLarge = 413,
    uriTooLong = 414,
    unsupportedMediaType = 415,
    rangeNotSatisfiable = 416,
    expectationFailed = 417,
    imATeapot = 418,
    misdirectedRequest = 421,
    unprocessableEntity = 422,
    locked = 423,
    failedDependency = 424,
    tooEarly = 425,
    upgradeRequired = 426,
    preconditionRequired = 428,
    tooManyRequests = 429,
    requestHeaderFieldsTooLarge = 431,
    unavailableForLegalReasons = 451,

    internalServerError = 500,
    notImplemented = 501,
    badGateway = 502,
    serviceUnavailable = 503,
    gatewayTimeout = 504,
    httpVersionNotSupported = 505,
    variantAlsoNegotiates = 506,
    insufficientStorage = 507,
    loopDetected = 508,
    notExtended = 510,
    networkAuthenticationRequired = 511
}


export enum ColorCode {
    success = 'success',
    error = 'danger',
    warning = 'warning',
    info = 'info',
    majorError = 'danger'
}

const messages = getJSONSync('status-messages');

if (!messages) {
    throw new Error('Unable to load status messages.');
}

export class Status {
    static middleware(id: string, test: (session: Session) => boolean) {
        return (req: Request, res: Response, next: NextFunction) => {
            if (test(req.session)) {
                next();
            } else {
                const status = Status.from(id, req);
                status.send(res);
            }
        }
    }






    static from(id: string, req: Request, data?: any): Status {
        try {
            data = JSON.stringify(data);
        } catch (e) {
            console.error('Unable to stringify data for status message.', e);
            data = undefined;
        }


        const message = messages[id];
        if (!message) {
            return new Status(
                'Unknown Error',
                'An unknown error has occurred.',
                ColorCode.error,
                ServerCode.internalServerError,
                'Please contact the administrator.',
                false,
                req,
                data
            )
        }

        return new Status(
            message.title,
            message.message,
            message.status,
            message.code,
            message.instructions,
            message.redirect || false,
            req,
            data
        )
    }

    constructor(
        public title: string,
        public message: string,
        public status: ColorCode,
        public code: ServerCode,
        public instructions: string,
        public redirect: string|boolean = false,
        public request: Request,
        public data?: string
    ) {

        if (!data) {
            data = '{}';
        }

        log(LogType.status, {
            date: Date.now(),
            sessionId: request.session.id,
            username: request.session.account?.username,
            ip: request.session.ip,
            email: request.session.account?.email,
            title,
            code,
            data: data == '{}' ? 'No data provided.' : data
        });



        // Send email to admins if error
        if (status === ColorCode.majorError && process.env.SEND_STATUS_EMAILS === 'TRUE') {
            Account.fromRole('admin')
                .then(admins => {
                    const email = new Email(
                        admins.map(admin => admin.email),
                        'Error: ' + title,
                        EmailType.error,
                        {
                            constructor: {
                                title,
                                message,
                                code,
                                sessionId: request.session.id,
                                username: request.session.account?.username,
                                ip: request.session.ip,
                                email: request.session.account?.email,
                            }
                        });

                    email.send()
                        .catch(console.error);
                })
                .catch(console.error);
        }
    }

    get html() {
        return getTemplateSync('status', {
            ...this,
            data: this.data ? JSON.parse(this.data) : 'No data provided.'
        });
    }

    get json() {
        return {
            title: this.title,
            message: this.message,
            status: this.status,
            code: this.code,
            instructions: this.instructions,
            data: JSON.parse(this.data || '{}')
        }
    }

    send(res: Response) {
        switch (this.request.method) {
            case 'GET':
                res.status(this.code).send(this.html);
                break;
            case 'POST':
                res.status(this.code).json(this.json);
                break;
            default:
                res.status(this.code).send(this.html);
                break;
        }
    }
}