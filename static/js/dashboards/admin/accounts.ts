const adminAccounts = new Page('Accounts');

const roleDropdown = CBS.createElement('select');

const userTable = CBS.createElement('table');
const userTableHeaders = userTable.addHead().addRow();
const userTableBody = userTable.addBody();

const tableHeaders: string[] = [
    'Username',
    'Email',
    'Roles',
    'First Name',
    'Last Name',
    'Verified'
];

for (const header of tableHeaders) {
    userTableHeaders.addHeader().content = header;
}


roleDropdown.on('change', () => {
    const { value } = roleDropdown;
});


const addAccount = (account: Account) => {
    const row = userTableBody.addRow();

    for (const header of tableHeaders) {
        if (header === 'Roles') {
            continue;
        }

        row.addData().content = account[toCamelCase(header)];
    }

    row.on('click', () => {});
};


adminAccounts.on(PageEvent.OPEN, async () => {
    const [accounts, roles] = await Promise.all([
        Account.all(),
        Role.all()
    ]);

    roleDropdown.clearElements();

    roleDropdown.addOption('All', 'all');

    for (const role of roles) {
        roleDropdown.addOption(capitalize(role.name), role.name);
    }

    for (const account of accounts) {
        addAccount(account);
    }
});