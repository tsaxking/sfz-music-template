import { Update } from "../server-update";
import { DB } from "../../server-functions/databases";

export const update: Update = {
    name: 'Switch Permissions',
    description: 'Switches permissions from Roles to RolePermissions',
    test: async (db: DB) => {
        const tableInfo = await db.info();
        const t = tableInfo.find(t => t.table === 'Roles');
        if (!t) return false; // this should never happen

        // if the column "role" exists, then the update hasn't been run
        return !t.columns.find(c => c.name === 'permissions');
    },
    execute: async (db: DB) => {
        const createQuery = `
            CREATE TABLE IF NOT EXISTS RolePermissions (
                rowId INTEGER PRIMARY KEY AUTOINCREMENT,
                role TEXT NOT NULL,
                permission TEXT NOT NULL
            )
        `;

        await db.unsafe.run(createQuery);


        const rolePermissions: {
            [role: string]: Permission[];
        } = {
            admin: [
                "manageMembers",
                "manageBoard"
            ],
            board: [
                "manageBoard"
            ]
        };
        
        
        
        type Permission = 
            "manageMembers" |
            "manageBoard";
        
        
        const insertQuery = `
            INSERT INTO RolePermissions (role, permission)
            VALUES (?, ?)
        `;
    
        Object.entries(rolePermissions).forEach(async ([role, permissions]) => {
            permissions.forEach(async permission => {
                await db.unsafe.run(insertQuery, [role, permission]);
            });
        });


        const dropQuery = `
            ALTER TABLE Roles
            DROP COLUMN permissions
        `;

        await db.unsafe.run(dropQuery);
    },
    revert: async (db: DB) => {
        const addQuery = `
            ALTER TABLE Roles
            ADD COLUMN permissions TEXT DEFAULT "[]" NOT NULL
        `;

        await db.unsafe.run(addQuery);

        const query = `
            SELECT
                role,
                permission
            FROM RolePermissions
        `;

        const rolePermissions = await db.unsafe.all(query) as { permission: string; role: string; }[];

        const updateQuery = `
            UPDATE Roles
            SET permissions = ?
            WHERE name = ?
        `;

        const roles: {
            [role: string]: string[];
        } = {};

        for (const { permission, role } of rolePermissions) {
            if (!roles[role]) roles[role] = [];
            roles[role].push(permission);
        }

        await Promise.all(Object.entries(roles).map(async ([role, permissions]) => {
            await db.unsafe.run(updateQuery, [JSON.stringify(permissions), role]);
        }));

        const dropQuery = `
            DROP TABLE RolePermissions
        `;

        await db.unsafe.run(dropQuery);
    },
    type: 'patch',
    date: new Date(2023, 8, 16, 2, 53).getTime()
};