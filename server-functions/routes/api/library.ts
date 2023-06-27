import { Router } from 'express';
import { Library, LibraryStatus } from '../../business/library/library';
import { Status } from '../../structure/status';
import { CustomFile, fileStream, getUpload } from '../../files';
import { Server } from 'socket.io';
import { Session } from '../../structure/sessions';

export const lib = Router();


declare global {
    namespace Express {
        interface Request {
            session: Session;
            start: number;
            io: Server;

            file?: CustomFile;
        }
    }
}

lib.post('/new', async (req, res) => {
    const { name } = req.body;
    const lib = await Library.new(name);
    Status.from('library.new', req).send(res);

    const { socket } = req.session;

    if (socket) {
        socket.emit('lib:data', await lib.getData());
    }
});

lib.post('/from-file', fileStream({
    extensions: [
        'csv',
        'tsv',
        'json',
        'xml'
    ]
}), async (req, res, next) => {
    const { file } = req;
    if (file) {
        const { 
            id,
            name,
            size,
            type,
            contentType,
            ext
        } = file;

        const libId = req.headers['X-Custom-Library-Id'];

        if (!libId || Array.isArray(libId)) {
            return Status.from('library.notFound', req).send(res);
        };

        const lib = await Library.fromId(libId);

        if (!lib.library) {
            return Status.from('library.notFound', req).send(res);
        }
        
        let status: LibraryStatus;

        switch (ext) {
            case 'csv':
                status = await lib.library.fromCSV(id + '.' + ext);
                break;
            case 'tsv':
                status = await lib.library.fromTSV(id + '.' + ext);
                break;
            case 'json':
                status = await lib.library.fromJSON(id + '.' + ext);
                break;
            case 'xml':
                status = await lib.library.fromXML(id + '.' + ext);
                break;
            default:
                status = LibraryStatus.unknown;
                break;
        }

        Status.from('library.' + status, req).send(res);
    }
});