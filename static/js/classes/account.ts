type AccountChangeFn = (account?: Account) => void;

class AccountEditForm {
    public readonly container: CBS_Container;
    public readonly inputs: {
        username: CBS_Input;
        email: CBS_Input;
        firstName: CBS_Input;
        lastName: CBS_Input;
        picture: CBS_Input;
    };

    public readonly collections: {
        skills: ProfileListElCollection;
        roles: ProfileListElCollection;
    }

    public readonly viewUpdates: ViewUpdate[] = [];

    constructor(public readonly account: Account) {
        this.container = CBS.createElement('container');

        this.inputs = {
            username: CBS.createElement('input', {
                attributes: {
                    type: 'text'
                }
            }),
            email: CBS.createElement('input', {
                attributes: {
                    type: 'email'
                }
            }),
            firstName: CBS.createElement('input', {
                attributes: {
                    type: 'text'
                }
            }),
            lastName: CBS.createElement('input', {
                attributes: {
                    type: 'text'
                }
            }),
            picture: CBS.createElement('input-file', {
                attributes: {
                    type: 'file'
                }
            })
        };

        this.collections = {
            skills: new ProfileListElCollection(),
            roles: new ProfileListElCollection()
        };

        for (const [key, input] of Object.entries(this.inputs)) {
            if (!(input instanceof CBS_FileInput)) input.value = this.account[key as keyof Account] || '';
            const label = CBS.createElement('label', {
                attributes: {
                    for: key
                }
            }).append(capitalize(fromCamelCase(key)));
            const button = CBS.createElement('button', {
                classes: ['btn-success']
            }).append(CBS_MaterialIcon.fromTemplate('mi-save'));

            const labelRow = this.container.addRow();
            labelRow.addCol().append(label);
            const inputRow = this.container.addRow();
            inputRow.addCol({
                sm: 8
            }).append(input);
            inputRow.addCol({
                sm: 4
            }).append(button);
            inputRow.marginB = 3;

            button.on('click', () => {
                switch (key) {
                    case 'username':
                        this.account.changeUsername(input.value);
                        break;
                    case 'email':
                        this.account.changeEmail(input.value);
                        break;
                    case 'firstName':
                        this.account.changeFirstName(input.value);
                        break;
                    case 'lastName':
                        this.account.changeLastName(input.value);
                        break;
                    case 'picture':
                        this.account.changePicture(input.value);
                        break;
                }
            });
        }



        for (const [key, collection] of Object.entries(this.collections)) {
            const container = CBS.createElement('container');
            container.marginB = 3;
            container.padding = 0;
            const label = CBS.createElement('p');
            label.append(capitalize(fromCamelCase(key)));
            const line = CBS.createElement('hr');
            container.addRow().addCol({
                sm: 8
            }).append(label, line);
            // container.addRow().addCol().append(line);
            container.addRow().addCol().append(collection);

            this.container.addRow().addCol().append(container);

            collection.onInput((value: string) => {
                switch (key) {
                    // case 'skills':
                    //     this.account.addSkill(value);
                    //     break;
                    case 'roles':
                        this.account.addRole(value);
                        break;
                }
            });
        }





        this.newUpdate(
            'change-username',
            () => this.inputs.username.value = this.account.username
        );

        this.newUpdate(
            'change-email',
            () => this.inputs.email.value = this.account.email
        );

        this.newUpdate(
            'change-first-name',
            () => this.inputs.firstName.value = this.account.firstName
        );

        this.newUpdate(
            'change-last-name',
            () => this.inputs.lastName.value = this.account.lastName
        );

        this.newUpdate(
            'change-picture',
            () => this.inputs.picture.value = this.account.picture
        );

        this.newUpdate(
            'add-role',
            () => {
                const { roles } = this.account;
                const role = roles[roles.length - 1];
                const el = this.collections.roles.addListElement(role);
                el.subcomponents.button.on('click', () => {
                    this.account.removeRole(role);
                });
            }
        );

        this.newUpdate(
            'remove-role',
            () => {
                const { roles } = this.account;

                const role = roles[roles.length - 1];
                const el = this.collections.roles.collection[role];
                if (!el) return;

                el.destroy();
            }
        );
    }

    private newUpdate(name: string, callback: (...args: any[]) => void) {
        const update = new ViewUpdate(name, null, callback, this.account.filterUsername);
        this.viewUpdates.push(update);
        return update;
    }


    destroy() {
        this.container.destroy();
        for (const update of this.viewUpdates) update.destroy();
    }
}


class ProfileListEl extends CBS_Component {
    static create(label: string) {
        const el = new ProfileListEl();
        el.subcomponents.label.content = label;

        return el;
    }

    subcomponents: CBS_ElementContainer = {
        label: new CBS_Paragraph(),
        button: new CBS_Button() // to remove
    }

    constructor(options?: CBS_Options) {
        super(options);

        this.el = document.createElement('li');

        this.addClass(
            'd-flex',
            'justify-content-between',
            'align-items-center',
            'list-group-item'
        );

        this.subcomponents.button.setAttribute('aria-label', 'close');

        this.append(
            this.subcomponents.label,
            this.subcomponents.button
        );
    }
}

class ProfileListElInput extends CBS_Component {
    subcomponents: CBS_ElementContainer = {
        input: new CBS_Input({
            attributes: {
                type: 'text'
            }
        }),
        button: new CBS_Button({
            classes: ['btn-success']
        }).append(CBS_MaterialIcon.fromTemplate('mi-add'))
    }

    constructor(options?: CBS_Options) {
        super(options);

        this.el = document.createElement('li');
        this.addClass('list-group-item');
        const container = CBS.createElement('container');
        const row = container.addRow();
        row.addCol({
            sm: 8
        }).append(this.subcomponents.input);
        row.addCol({
            sm: 4
        }).append(this.subcomponents.button);

        this.append(container);
    }
}


class ProfileListElCollection extends CBS_Component {
    collection: {
        [key: string]: ProfileListEl;
    } = {};

    subcomponents: CBS_ElementContainer = {
        input: new ProfileListElInput()
    }

    constructor(options?: CBS_Options) {
        super(options);

        this.el = document.createElement('ul');
        // this.addClass('list-group');
        this.append(this.subcomponents.input);
    }


    addListElement(label: string) {
        const el = ProfileListEl.create(label);
        this.append(el);
        this.collection[label] = el;
        return el;
    }

    onInput(callback: (value: string) => void) {
        (this.subcomponents.input as ProfileListElInput).subcomponents.button.on('click', () => {
            callback(((this.subcomponents.input as ProfileListElInput).subcomponents.input as CBS_Input).value);
        });
    }
}


class Account {
    static accounts: {
        [username: string]: Account;
    } = {};
    private static _current: Account;
    private static _accountSet: AccountChangeFn[] = [];

    static onSetAccount(callback: AccountChangeFn) {
        Account._accountSet.push(callback);
    }

    static set current(account: Account) {
        Account._current = account;
        Account._accountSet.forEach(fn => fn(account));
    }

    static get current() {
        return Account._current;
    }



    static async all(refresh?: boolean): Promise<Account[]> {
        if (!refresh && Account.accounts.length) {
            return Object.values(Account.accounts);
        }

        const accounts = await ServerRequest.post('/account/all', null, { cached: !!refresh })
            .then((accounts: any[]) => accounts.map(a => new Account(
                a.username,
                a.email,
                a.firstName,
                a.lastName,
                a.picture,
                a.memberInfo,
                a.roles
            )));

        Account.accounts = accounts.reduce((acc, a) => {
            acc[a.username] = a;
            return acc;
        }, {} as { [username: string]: Account });

        return accounts;
    }


    public readonly member?: Member;



    constructor(
        public username: string,
        public email: string,
        public firstName: string,
        public lastName: string,
        public picture: string,
        public roles: string[],
        memberInfo?: {
            bio: string;
            title: string;
            skills: string[];
            resume: string|null;
            status: MembershipStatus;
        }
    ) {
        if (!Account.accounts[this.username]) {
            Account.accounts[this.username] = this;
        }

        if (memberInfo) {
            console.log('account', 
            {
                ...memberInfo,
                username: this.username
            });
            this.member = new Member(
                {
                    ...memberInfo,
                    username: this.username
                }
            );
        }

    }

    manageModal() {
        const tabNav = CBS.createElement('tab-nav');
        const container = CBS.createElement('container');
        container.addRow().append(tabNav);
        container.addRow().append(tabNav.container);



        tabNav.addPage('View', 'view');


        const editForm = this.editForm();

        tabNav.addPage('Edit', editForm.container);





        const modal = CBS.createElement('modal');
        modal.on('hidden.bs.modal', () => {
            editForm.destroy();
        });
    }

    editForm(): AccountEditForm {
        return new AccountEditForm(this);
    }




    async changeUsername(username: string) {
        return ServerRequest.post('/account/change-username', {
            username: this.username,
            newUsername: username
        });
    }

    async changePicture(files: FileList) {
        return ServerRequest.stream('/account/change-picture', files);
    }

    async changeFirstName(firstName: string) {
        return ServerRequest.post('/account/change-name', {
            username: this.username,
            firstName
        });
    }

    async changeLastName(lastName: string) {
        return ServerRequest.post('/account/change-name', {
            username: this.username,
            lastName
        });
    }

    async changeEmail(email: string) {
        return ServerRequest.post('/account/change-email', {
            username: this.username,
            email
        });
    }

    async addRole(role: string) {
        return ServerRequest.post('/account/add-role', {
            username: this.username,
            role
        });
    }

    async removeRole(role: string) {
        return ServerRequest.post('/account/remove-role', {
            username: this.username,
            role
        });
    }


    filterUsername(username: string) {
        return username === this.username;
    }
}