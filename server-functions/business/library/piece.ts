import { PDF } from './pdf';
import { Library } from './library';
import { MAIN, LIB } from '../../databases';
import { uuid } from '../../structure/uuid';

type PieceSystemData = {
    _dateCreated: number,
    _checkedIn: boolean,
    _id: string,
    _pdfs: string, // JSON array of strings
    _info: string,
    _libraryId: string
}

type PieceData = {
    [key: string]: any
}



class Piece {
    static async new(lib: Library, data: PieceData) {
        const date = Date.now();
        const id = await this.newId(lib.id);

        const { headers, archivedHeaders } = lib;

        const query = `
            INSERT INTO ${lib}_Pieces (
                _dateCreated,
                _checkedIn,
                _id,
                _pdfs,
                _info,
                _libraryId,
                ${headers.map(header => header).join(', ')},
                ${archivedHeaders.map(header => header).join(', ')}
            ) VALUES (
                ?, ?, ?, ?, ?, ?,
                ${headers.map(() => '?').join(', ')},
                ${archivedHeaders.map(() => '?').join(', ')}
            )
        `;

        const params = [
            date,
            true,
            id,
            JSON.stringify([]),
            JSON.stringify({}),
            lib.id,
            ...headers.map(header => data[header]),
            ...archivedHeaders.map(header => data[header])
        ];

        await LIB.run(query, params);

        return new Piece({
            _dateCreated: date,
            _checkedIn: true,
            _id: id,
            _pdfs: JSON.stringify([]),
            _info: JSON.stringify({}),
            _libraryId: lib.id,
            ...data
        }, lib);
    }



    static async newId(libId: string): Promise<string> {
        let id: string;
        do {
            id = uuid({
                letters: true
            });
        } while (await LIB.get(`SELECT id FROM ${libId} WHERE id = ?`, [id]));
        return id;
    }

    static async fromId(id: string, lib: Library): Promise<Piece> {
        const pieceData = await LIB.get(`SELECT * FROM ${lib.id}_Versions WHERE id = ?`, [id]);
        return new Piece(pieceData as PieceSystemData & PieceData, lib);
    }

    systemData: {
        dateCreated: Date,
        checkedIn: boolean,
        id: string,
        pdfs: PDF[],
        info: PieceData,
        libraryId: string
    };

    data: PieceData;
    archivedData: PieceData;
    __originalData: PieceSystemData & PieceData;
    readonly library: Library;

    constructor(pieceData: PieceSystemData & PieceData, lib: Library) {
        this.__originalData = pieceData;
        this.library = lib;

        const {
            _dateCreated,
            _checkedIn,
            _id,
            _pdfs,
            _info, // JSON object
            _libraryId,
            ...__data
        } = pieceData;

        this.systemData = {
            dateCreated: new Date(_dateCreated),
            checkedIn: _checkedIn,
            id: _id,
            pdfs: (JSON.parse(_pdfs) as string[]).map(id => new PDF(id)),
            info: JSON.parse(_info) as PieceData,
            libraryId: _libraryId
        }


        const { data, archived } = Object.entries(__data).reduce((acc, [key, value]) => {
            if (key.startsWith('__')) {
                acc[key.slice(2)] = value;
            } else if (!key.startsWith('_')) {
                acc[key] = value;
            }
            return acc;
        }, {
            archived: {},
            data: {}
        } as PieceData);

        this.data = data;
        this.archivedData = archived;
    }


    async save() {
        const {
            dateCreated,
            checkedIn,
            id,
            pdfs,
            info,
            libraryId
        } = this.systemData;

        const pdfIds = JSON.stringify(pdfs.map(pdf => pdf.id));

        const infoString = JSON.stringify(info);

        const data = {
            ...this.data,
            ...this.archivedData
        };

        const dataString = JSON.stringify(data);

        const archivedData = {
            ...this.archivedData
        };

        const archivedDataString = JSON.stringify(archivedData);

        await LIB.run(`
            INSERT INTO Pieces (
                _dateCreated,
                _checkedIn,
                _id,
                _pdfs,
                _info,
                _libraryId,
                __data,
                __archived
            )
            VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?
            )
            ON CONFLICT (_id) DO UPDATE SET
                _dateCreated = ?,
                _checkedIn = ?,
                _id = ?,
                _pdfs = ?,
                _info = ?,
                _libraryId = ?,
                __data = ?,
                __archived = ?
        `, [
            dateCreated.getTime(),
            checkedIn,
            id,
            pdfIds,
            infoString,
            libraryId,
            dataString,
            archivedDataString,

            // on conflict (where _id already exists)
            dateCreated.getTime(),
            checkedIn,
            id,
            pdfIds,
            infoString,
            libraryId,
            dataString,
            archivedDataString
        ]);
    }

    async refresh() {
        const data = await LIB.get('SELECT * FROM Pieces WHERE _id = ?', [this.systemData.id]) as PieceSystemData & PieceData;

        const p = new Piece(data, this.library);

        this.systemData = p.systemData;
        this.data = p.data;
        this.archivedData = p.archivedData;
        this.__originalData = p.__originalData;
    }

    async makeVersion() {
        const version = await Version.new(this.library, this.__originalData);
        await version.save();
    }

    async getVersions() {
        const versions = await LIB.all(`SELECT * FROM ${this.library}_Versions WHERE id = ?`, [this.systemData.id]);
        return versions.map(version => new Version(version, this.library));
    }
}

class Version extends Piece {
    static async new(lib: Library, data: PieceSystemData & PieceData): Promise<Version> {
        const versionQuery = `
            SELECT *
            FROM ${lib.id}_Versions
            WHERE id = ?
        `;

        const allVersions = await LIB.all(versionQuery, [data.id]);
        const versionNumber = allVersions.length + 1;

        const v = new Version({
            ...data,
            _versionNumber: versionNumber
        }, lib);

        return v;
    }

    systemData: {
        dateCreated: Date,
        checkedIn: boolean,
        id: string,
        pdfs: PDF[],
        info: PieceData,
        libraryId: string,
        versionNumber: number
    };

    constructor(pieceData: PieceSystemData & PieceData, lib: Library) {
        super(pieceData, lib);

        const {
            _dateCreated,
            _checkedIn,
            _id,
            _pdfs,
            _info, // JSON object
            _libraryId,
            ...__data
        } = pieceData;

        this.systemData = {
            dateCreated: new Date(_dateCreated),
            checkedIn: _checkedIn,
            id: _id,
            pdfs: (JSON.parse(_pdfs) as string[]).map(id => new PDF(id)),
            info: JSON.parse(_info) as PieceData,
            libraryId: _libraryId,
            versionNumber: __data._version
        }
    }

    async save(): Promise<void> {
        const { __originalData: originalData } = this;

        const query = `
            INSERT INTO ${this.library}_Versions (
                ${Object.keys(originalData).join(', ')}
            ) VALUES (
                ${Object.keys(originalData).map(() => '?').join(', ')}
            )
        `;

        const params = Object.values(originalData);

        await LIB.run(query, params);
    }

    async refresh(): Promise<void> {
        console.error('Cannot refresh a version!');
    }

    async restore(): Promise<Piece> {
        const { __originalData: originalData } = this;

        const p = await Piece.fromId(originalData._id, this.library);
        await p.makeVersion();

        const query = `
            UPDATE Pieces
            SET
                ${Object.keys(originalData).map(key => `${key} = ?`).join(', ')}
            WHERE _id = ?
        `;

        const params = Object.values(originalData);

        await LIB.run(query, params);

        return await Piece.fromId(originalData._id, this.library);
    }
}