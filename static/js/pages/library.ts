class LibraryPage extends Page {
    table = CBS.createElement('table');
    thead = this.table.addHead();
    tbody = this.table.addBody();
};

const libraryPage = new LibraryPage('library');