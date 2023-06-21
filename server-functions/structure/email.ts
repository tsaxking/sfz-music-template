import nodemailer from 'nodemailer';
import sgTransport from 'nodemailer-sendgrid-transport';
import { config } from 'dotenv';
import { getTemplateSync } from '../files';


config();

const transporter = nodemailer.createTransport(sgTransport({
        service: 'gmail',
        auth: {
            api_key: process.env.SENDGRID_API_KEY
        }
    }));




type EmailOptions = {
    attachments?: {
        filename: string,
        path: string
    }[],
    constructor: {
        link?: string,
        linkText?: string,
        title: string,
        message: string,
        [key: string]: any
    }
}



export enum EmailType {
    link,
    text,
    error
}

export class Email {
    constructor(
        public to: string | string[],
        public subject: string,
        public type: EmailType,
        public options: EmailOptions
    ) {}


    send() {
        const { to, subject, type, options } = this;
        let { attachments, constructor } = options;


        constructor = {
            ...(constructor || {}),
            logo: (process.env.DOMAIN || '') + (process.env.LOGO || ''),
            homeLink: (process.env.DOMAIN || '') + (process.env.HOME_LINK || ''),
            footer: (process.env.FOOTER || '')
        }



        let html: string;
        let temp: string|boolean;
        
        switch (type) {
            case EmailType.link:
                temp = getTemplateSync('emails/link', constructor);
                html = typeof temp === 'string' ? temp : '';
                break;
            case EmailType.text:
                temp = getTemplateSync('emails/text', constructor);
                html = typeof temp === 'string' ? temp : '';
                break;
            case EmailType.error:
                temp = getTemplateSync('emails/error', constructor);
                html = typeof temp === 'string' ? temp : '';
                break;
            default:
                html = '';
                break;
        }


        const mailOptions = {
            from: process.env.EMAIL,
            to,
            subject,
            html,
            attachments
        };

        return new Promise((resolve, reject) => {
            transporter.sendMail(mailOptions, (err, info) => {
                if (err) {
                    console.error(err);
                } else {
                    console.log('Email sent: ' + info.response);
                    resolve(info);
                }
            });
        });
    }
}