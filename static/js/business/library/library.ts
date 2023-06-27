class Library {
    static async new() {
        const form = CBS.createElement('form');
        const name = form.createInput('name', 'text');
        const container = CBS.createElement('container');
        const row = container.addRow();
        const col = row.addCol({
            md: 6
        });
        
        col.append(name);

        form.append(container);

        const { value: {
            name: libraryName
        } } = await CBS.modalForm(form);

        if (libraryName) {
            libraryPage.fetch('new', {
                name: libraryName
            });
        }
    }

    constructor(
        public readonly name: string,
        public length: number,
        public headers: string[],
        public readonly id: string
    ) {}

    async addPiecesFromFile() {
        const form = CBS.createElement('form');
        const file = form.createInput('file', 'file');
        const container = CBS.createElement('container');
        const row = container.addRow();
        const col = row.addCol({
            md: 6
        });
        col.append(file);
        form.append(container);
        const { value: {
            file: fileList
        } } = await CBS.modalForm(form);

        if (fileList) {
            libraryPage.stream('from-file', fileList, {
                headers: {
                    'Library-Id': this.id
                }
            });
        }
    }
};




type LibraryData = {
    headers: string[];
    name: string;
    length: number;
    id: string;
}

socket.on('lib:data', (data: LibraryData) => {});

type PieceObj = {
    id: string;
    title: string;
    composer: string;
    pdfs: string[];
    info: string;
    dateCreated: string;
    checkedIn: boolean;
    libraryId: string;
    [key: string]: any;
};

socket.on('lib:piece', (data: PieceObj[]) => {});
