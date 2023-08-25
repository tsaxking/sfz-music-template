type AccountChangeFn = (account?: Account) => void;

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

    async changeUsername(username: string) {
        return ServerRequest.new('/account/change-username', {
            username: this.username,
            newUsername: username
        });
    }

    async changePicture(files: FileList) {
        return ServerRequest.stream('/account/change-picture', files);
    }

    async changeName(name: string) {
        return ServerRequest.new('/account/change-name', {
            username: this.username,
            name
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