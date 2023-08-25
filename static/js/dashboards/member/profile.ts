const memberProfile = new Page('Profile');

class CBS_InputSubmit extends CBS_Component {
    static create(name: string, type: string) {
        const input = new CBS_InputSubmit();
        input.subcomponents.label.setAttribute('for', name);
        input.subcomponents.label.content = capitalize(fromCamelCase(name));
        input.subcomponents.input.setAttribute('type', type);
        input.subcomponents.input.setAttribute('name', name);

        return input;
    }


    subcomponents: CBS_ElementContainer = {
        label: new CBS_Label(),
        input: new CBS_Input(),
        submit: new CBS_Button()
    }

    constructor(options?: CBS_Options) {
        super(options);

        this.subcomponents.submit.content = '<i class="material-icons">save</i>'
        this.subcomponents.submit.addClass('btn-success');

        const container = CBS.createElement('container');
        container.addRow().append(this.subcomponents.label);
        const row = container.addRow({
            classes: ['mb-3']
        });
        row.addCol({
            sm: 8
        }).append(this.subcomponents.input);
        row.addCol({
            sm: 4
        }).append(this.subcomponents.submit);

        this.append(container);
    }

    get value(): string {
        return (this.subcomponents.input as CBS_Input).value;
    }

    set value(value: string) {
        (this.subcomponents.input as CBS_Input).value = value;
    }
}

type ProfileInputMap = {
    [key: string]: CBS_InputSubmit;
}

memberProfile.data.inputs = {
    username: CBS_InputSubmit.create('username', 'text'),
    email: CBS_InputSubmit.create('email', 'email'),
    firstName: CBS_InputSubmit.create('firstName', 'text'),
    lastName: CBS_InputSubmit.create('lastName', 'text'),
    picture: CBS_InputSubmit.create('picture', 'file'),
    skill: CBS_InputSubmit.create('skill', 'text')
}

for (const [key, row] of Object.entries(memberProfile.data.inputs as ProfileInputMap)) {
    const { input, submit } = row.subcomponents;

    submit.on('click', () => {
        switch (key) {
            case 'username':
                Account.current.changeUsername((input as CBS_InputSubmit).value);
                break;
            case 'email':
                Account.current.changeEmail((input as CBS_InputSubmit).value);
                break;
            case 'name':
                Account.current.changeName((input as CBS_InputSubmit).value);
                break;
            case 'picture':
                Account.current.changePicture(
                    (input.el as HTMLInputElement).files as FileList
                );
                break;
            case 'skill':
                Account.current.addSkill((input as CBS_InputSubmit).value);
                break;
        }
    });

    memberProfile.body?.append(row.el);
}

memberProfile.data.skills = {
    list: CBS.createElement('list'),
    elements: {}
}

memberProfile.data.roles = {
    list: CBS.createElement('list'),
    elements: {}
}

memberProfile.body?.append(memberProfile.data.skills.list.el, memberProfile.data.roles.list.el);

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


memberProfile.data.openProfile = () => {
    const { current: current } = Account;

    if (!current) return;
    const { memberInfo, roles } = current;

    // Sets the current values of the inputs
    for (const [key, input] of Object.entries(memberProfile.data.inputs as ProfileInputMap)) {
        if (key !== 'skill') input.subcomponents.input.setAttribute('value', current[key]);
    }

    memberProfile.data.skills.list.clearElements();
    memberProfile.data.roles.list.clearElements();

    for (const skill of memberInfo.skills) {
        if (!skill) continue;
        const el = ProfileListEl.create(skill);
        el.subcomponents.button.on('click', () => {
            // remove skill
            Account.current.removeSkill(skill);
        });


        memberProfile.data.skills.list.append(el);
        memberProfile.data.skills.elements[skill] = el;
    }

    for (const role of roles) {
        if (!role) continue;
        const el = ProfileListEl.create(role);
        el.subcomponents.button.on('click', () => {
            // remove role
            Account.current.removeRole(role);
        });


        memberProfile.data.roles.list.append(el);
        memberProfile.data.roles.elements[role] = el;
    }
};

// this is where the user can edit their profile
memberProfile.on(PageEvent.OPEN, memberProfile.data.openProfile);








// █ █ █▀▄ █▀▄ ▄▀▄ ▀█▀ ██▀ ▄▀▀ 
// ▀▄█ █▀  █▄▀ █▀█  █  █▄▄ ▄█▀ 

Account.onSetAccount(() => {
    memberProfile.data.openProfile();

    memberProfile.newUpdate(
        'change-username',
        () => memberProfile.data.inputs.username.value = Account.current.username,
        Account.current.filterUsername
    );



    memberProfile.newUpdate(
        'change-email',
        () => memberProfile.data.inputs.email.value = Account.current.email,
        Account.current.filterUsername
    );


    memberProfile.newUpdate(
        'change-first-name',
        () => memberProfile.data.inputs.firstName.value = Account.current.firstName,
        Account.current.filterUsername
    );

    memberProfile.newUpdate(
        'change-last-name',
        () => memberProfile.data.inputs.lastName.value = Account.current.lastName,
        Account.current.filterUsername
    )



    memberProfile.newUpdate(
        'change-picture',
        () => memberProfile.data.inputs.picture.value = Account.current.picture,
        Account.current.filterUsername
    );



    memberProfile.newUpdate(
        'add-skill',
        () => {
            const { current: current } = Account;
            if (!current) return;

            const { memberInfo } = current;

            const skill = memberInfo.skills[memberInfo.skills.length - 1];
            const el = ProfileListEl.create(skill);
            el.subcomponents.button.on('click', () => {
                // remove skill
                Account.current.removeSkill(skill);
            });

            memberProfile.data.skills.list.append(el);
            memberProfile.data.skills.elements[skill] = el;
        },
        Account.current.filterUsername
    );



    memberProfile.newUpdate(
        'add-role',
        () => {
            const { current: current } = Account;
            if (!current) return;

            const { roles } = current;

            const role = roles[roles.length - 1];
            const el = ProfileListEl.create(role);
            el.subcomponents.button.on('click', () => {
                // remove role
                Account.current.removeRole(role);
            });

            memberProfile.data.roles.list.append(el);
            memberProfile.data.roles.elements[role] = el;
        },
        Account.current.filterUsername
    );


    memberProfile.newUpdate(
        'remove-skill',
        () => {
            const { current: current } = Account;
            if (!current) return;

            const { memberInfo } = current;

            const skill = memberInfo.skills[memberInfo.skills.length - 1];
            const el = memberProfile.data.skills.elements[skill];

            el.remove();
            delete memberProfile.data.skills.elements[skill];
        },
        Account.current.filterUsername
    );




    memberProfile.newUpdate(
        'remove-role',
        () => {
            const { current: current } = Account;
            if (!current) return;

            const { roles } = current;

            const role = roles[roles.length - 1];
            const el = memberProfile.data.roles.elements[role];

            el.remove();
            delete memberProfile.data.roles.elements[role];
        },
        Account.current.filterUsername
    );
});