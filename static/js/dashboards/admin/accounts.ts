// class AdminAccounts extends Page {
//     public readonly data: {
//         roleDropdown?: CBS_SelectInput,
//         userTable?: CBS_Table,
//         userTableHeaders?: CBS_TableRow,
//         userTableBody?: CBS_TableRow,
//         tableHeaders?: string[]
//     } = {};
// }

const adminAccounts = new Page('Accounts');

adminAccounts.data.roleDropdown = CBS.createElement('select');

adminAccounts.data.userTable = CBS.createElement('table');
adminAccounts.data.userTableHeaders = adminAccounts.data.userTable.addHead().addRow();
adminAccounts.data.userTableBody = adminAccounts.data.userTable.addBody();

const tableHeaders: string[] = [
    'Username',
    'Email',
    'Roles',
    'First Name',
    'Last Name',
    'Verified'
];

for (const header of tableHeaders) {
    adminAccounts.data.userTableHeaders.addHeader(header);
}


adminAccounts.data.roleDropdown.on('change', () => {
    const { value } = adminAccounts.data.roleDropdown;
});


const addAccount = (account: Account) => {
    const row = adminAccounts.data.userTableBody.addRow();

    for (const header of tableHeaders) {
        if (header === 'Roles') {
            continue;
        }

        row.addCell(account[toCamelCase(header)]);
    }

    row.on('click', () => {
        // opens a modal to manage the account
        account.manageModal();
    });
};


adminAccounts.on(PageEvent.OPEN, async () => {
    const [accounts, roles] = await Promise.all([
        Account.all(),
        Role.all()
    ]);

    adminAccounts.data.roleDropdown.clearElements();

    adminAccounts.data.roleDropdown.addOption('All', 'all');

    for (const role of roles) {
        adminAccounts.data.oleDropdown.addOption(capitalize(role.name), role.name);
    }

    for (const account of accounts) {
        addAccount(account);
    }
});