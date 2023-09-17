import * as fs from 'fs';
import * as path from 'path';


export const main = async () => {
    const saveDirFiles = (dir: string) => {
        fs.readdirSync(
            dir
        ).forEach(f => {
            const contents = fs.readFileSync(
                path.resolve(__dirname, '../db/queries', dir, f),
                'utf8'
            );
    
            if (contents.includes('Use the ▷ button in the top right corner to run the entire file.')) return;
    
            const insert = `-- database: /home/tsaxking/tators-dashboard-template/db/main.db
    
    -- Use the ▷ button in the top right corner to run the entire file.
    
    
    
    `;
    
            fs.writeFileSync(
                path.resolve(__dirname, '../db/queries', dir, f),
                insert + contents,
                'utf8'
            );
        });
    }


    fs.readdirSync(
        path.resolve(__dirname, '../db/queries')
    ).forEach(dir => {
        saveDirFiles(
            path.resolve(__dirname, '../db/queries', dir)
        );
    });


};