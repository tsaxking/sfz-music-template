import { MAIN } from "../databases";


type RoleObject = {
    name: string;
    permissions: string; // JSON
    description: string;
    rank: number;
}



export default class Role {
    static async fromName(name: string):Promise<Role> {
        const getQuery = `
            SELECT * 
            FROM roles
            WHERE name = ?
        `;

        const data = await MAIN.get(getQuery, [name]);
        return new Role(data as RoleObject);
    }

    static async all(): Promise<Role[]> {
        const getQuery = `
            SELECT * 
            FROM roles
        `;

        const data = await MAIN.all(getQuery);
        return data.map(d => new Role(d as RoleObject)).sort((a, b) => a.rank - b.rank);
    }

    name: string;
    permissions: string[];
    description: string;
    rank: number;

    constructor(role: RoleObject) {
        this.name = role.name;
        this.permissions = JSON.parse(role.permissions) as string[];
        this.description = role.description;
        this.rank = role.rank;
    }
}