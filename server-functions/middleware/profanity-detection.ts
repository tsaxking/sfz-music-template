import Filter from 'bad-words';
import { Status } from '../structure/status';
import { NextFunction } from 'express';

const filter = new Filter();


export const detect = (...keys: string[]): NextFunction => {
    const fn = (req: any, res: any, next: any) => {
        for (const key of keys) {
            if (filter.isProfane(req.body[key])) {
                return Status.from('profanity', res).send(res);
            }
        }
        next();
    }

    return fn as NextFunction;
}