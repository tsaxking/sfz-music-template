import { NextFunction, Request, Response } from "express";
import { MAIN } from "../databases";
import { Status } from "./status";


type RoleObject = {
    name: string;
    description: string;
    rank: number;
}



export type Permission = 
    "manageMembers" |
    "manageBoard";

export type RoleName = 
    "admin" |
    "developer" |
    "user" | 
    "guest";


export default class Role {

    static allowRoles(...role: RoleName[]): NextFunction {
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




    static async fromName(name: string):Promise<Role> {
        const data = await MAIN.get('role-from-name', [name]);
        return new Role(data as RoleObject);
    }

    static async all(): Promise<Role[]> {
        const data = await MAIN.all('roles');
        return data.map(d => new Role(d as RoleObject)).sort((a, b) => a.rank - b.rank);
    }

    name: string;
    description: string;
    rank: number;

    constructor(role: RoleObject) {
        this.name = role.name;
        this.description = role.description;
        this.rank = role.rank;
    }


    async getPermissions(): Promise<Permission[]> {
        const data = await MAIN.all('permissions-from-role', [this.name]);
        return data.map(d => d.permission) as Permission[];
    }
}