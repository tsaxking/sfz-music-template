import Random from 'random-org';
import { MAIN } from '../databases';
import { config } from 'dotenv';
import { v4 as uuidv4 } from 'uuid';




config();

const getIds = async (n: number) => {
    const tableQuery = `
        CREATE TABLE IF NOT EXISTS ids (
            id TEXT PRIMARY KEY,
            used INTEGER DEFAULT 0
        )
    `;

    await MAIN.run(tableQuery);

    const uuids = new Random({
        apiKey: process.env.RANDOM_ORG_API_KEY || ''
    });

    uuids.generateUUIDs({
        n
    }).then(res => {
        getIds(n);
        const { data } = res.random;
        ids = [...ids, ...data];

        const insertQuery = `
            INSERT INTO ids (
                id,
                used
            ) VALUES (
                ?, ?
            )
        `;

        Promise.all(data.map(id => {
            return MAIN.run(insertQuery, [id, 0]);
        }));

    })
    .catch(_ => console.log('Quota Filled Today, or other error'));
}

let ids: string[] = [];
(async () => {
    const getQuery = `
        SELECT * 
        FROM ids
    `;

    ids = await MAIN.all(getQuery) || []; 
})();


type uuidOptions = {
    letters?: boolean;
    length?: number;
};


const getId = ():string => {
    if (ids.length) {
        const id = ids[0];

        const setUsedQuery = `
            UPDATE ids
            SET used = 1
            WHERE id = ?
        `;

        MAIN.run(setUsedQuery, [id]);3
        return id;
    }

    return uuidv4();
}




export const uuid = (options?: uuidOptions) => {
    // random string, only letters
    let id: string;
    id = getId();

    if (options?.letters) {
        id = id.replace(/0-9/g, (num) => {
            return String.fromCharCode(parseInt(num) + 65);
        });
    }

    if (options?.length) {
        if (options.length < 1) throw new Error('Length must be greater than 0');
        if (options.length > 32) throw new Error('Length must be less than 32');

        while (id.length < options.length) {
            const i = getId();
            id += i;
        }

        id = id.slice(0, options.length);
    }

    return id;
}
