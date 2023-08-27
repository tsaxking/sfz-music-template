type AccountChangeFn = (account?: Account) => void;

class AccountEditForm {
    public readonly container: CBS_Container;
    public readonly inputs: {
        username: CBS_Input;
        email: CBS_Input;
        firstName: CBS_Input;
        lastName: CBS_Input;
        picture: CBS_Input;
        bio: CBS_Input;
        title: CBS_Input;
        skills: ProfileListElCollection;
        roles: ProfileListElCollection;
    };

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
            picture: CBS.createElement('input', {
                attributes: {
                    type: 'file'
                }
            }),
            bio: CBS.createElement('input', {
                attributes: {
                    type: 'text'
                }
            }),
            title: CBS.createElement('input', {
                attributes: {
                    type: 'text'
                }
            }),
            skills: new ProfileListElCollection(),
            roles: new ProfileListElCollection()
        };

        for (const [key, input] of Object.entries(this.inputs)) {
            if (input instanceof ProfileListElCollection) continue; // ignore ProfileListCollections


            input.value = this.account[key as keyof Account];
            const label = CBS.createElement('label', {
                attributes: {
                    for: key
                }
            }).append(key);
            const button = CBS.createElement('button').append(CBS_MaterialIcon.fromTemplate('save'));

            const labelRow = this.container.addRow();
            labelRow.addCol().append(label);
            const inputRow = this.container.addRow();
            inputRow.addCol({
                sm: 8
            }).append(input);
            inputRow.addCol({
                sm: 4
            }).append(button);

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
                    case 'bio':
                        this.account.changeBio(input.value);
                        break;
                    case 'title':
                        this.account.changeTitle(input.value);
                        break;
                }
            });
        }



        



    }

    private newUpdate(name: string, callback: (...args: any[]) => void) {
        const update = new ViewUpdate(name, null, callback, this.account.filterUsername);
        this.viewUpdates.push(update);
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
            'align-items-center'
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
        }).append(CBS_MaterialIcon.fromTemplate('add'))
    }

    constructor(options?: CBS_Options) {
        super(options);

        this.el = document.createElement('li');
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
        this.append(this.subcomponents.input);
    }


    addListElement(label: string) {
        const el = ProfileListEl.create(label)
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
    static accounts: Account[] = [];
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
            return Account.accounts;
        }

        const accounts = await ServerRequest.new('/account/all', null, { cached: !!refresh })
            .then((accounts: any[]) => accounts.map(a => new Account(
                a.username,
                a.email,
                a.firstName,
                a.lastName,
                a.picture,
                a.memberInfo,
                a.roles
            )));

        Account.accounts = accounts;

        return accounts;
    }

    constructor(
        public username: string,
        public email: string,
        public firstName: string,
        public lastName: string,
        public picture: string,
        public readonly memberInfo: {
            bio: string;
            title: string;
            skills: string[];
        },
        public roles: string[]
    ) {
        if (!Account.accounts.find(a => a.username == username)) {
            Account.accounts.push(this);
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
    }

    editForm(): AccountEditForm {
        return new AccountEditForm(this);
    }




    async changeUsername(username: string) {
        return ServerRequest.new('/account/change-username', {
            username: this.username,
            newUsername: username
        });
    }

    async changePicture(files: FileList) {
        return ServerRequest.stream('/account/change-picture', files);
    }

    async changeFirstName(firstName: string) {
        return ServerRequest.new('/account/change-name', {
            username: this.username,
            firstName
        });
    }

    async changeLastName(lastName: string) {
        return ServerRequest.new('/account/change-name', {
            username: this.username,
            lastName
        });
    }

    async changeEmail(email: string) {
        return ServerRequest.new('/account/change-email', {
            username: this.username,
            email
        });
    }

    async addRole(role: string) {
        return ServerRequest.new('/account/add-role', {
            username: this.username,
            role
        });
    }

    async removeRole(role: string) {
        return ServerRequest.new('/account/remove-role', {
            username: this.username,
            role
        });
    }

    async changeBio(bio: string) {
        return ServerRequest.new('/account/change-bio', {
            username: this.username,
            bio
        });
    }

    async changeTitle(title: string) {
        return ServerRequest.new('/account/change-title', {
            username: this.username,
            title
        });
    }

    async addSkill(skill: string) {
        return ServerRequest.new('/account/add-skill', {
            username: this.username,
            skill
        });
    }

    async removeSkill(skill: string) {
        return ServerRequest.new('/account/remove-skill', {
            username: this.username,
            skill
        });
    }


    filterUsername(username: string) {
        return username === this.username;
    }
}