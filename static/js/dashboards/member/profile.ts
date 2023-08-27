const memberProfile = new Page('Profile');


// █ █ █▀▄ █▀▄ ▄▀▄ ▀█▀ ██▀ ▄▀▀ 
// ▀▄█ █▀  █▄▀ █▀█  █  █▄▄ ▄█▀ 

Account.onSetAccount(() => {
    const form = Account.current.editForm();
    memberProfile.dom.clearElements();
    memberProfile.dom.append(form.container.el);

    memberProfile.newUpdate(
        'change-username',
        () => form.inputs.username.value = Account.current.username,
        Account.current.filterUsername
    );



    memberProfile.newUpdate(
        'change-email',
        () => form.inputs.email.value = Account.current.email,
        Account.current.filterUsername
    );


    memberProfile.newUpdate(
        'change-first-name',
        () => form.inputs.firstName.value = Account.current.firstName,
        Account.current.filterUsername
    );

    memberProfile.newUpdate(
        'change-last-name',
        () => form.inputs.lastName.value = Account.current.lastName,
        Account.current.filterUsername
    )



    memberProfile.newUpdate(
        'change-picture',
        () => form.inputs.picture.value = Account.current.picture,
        Account.current.filterUsername
    );



    memberProfile.newUpdate(
        'add-skill',
        () => {
            const { current } = Account;
            if (!current) return;

            const { memberInfo } = current;
            const skill = memberInfo.skills[memberInfo.skills.length - 1];
            const el = form.inputs.skills.addListElement(skill);
            el.subcomponents.button.on('click', () => {
                current.removeSkill(skill);
            });
        },
        Account.current.filterUsername
    );



    memberProfile.newUpdate(
        'add-role',
        () => {
            const { current } = Account;
            if (!current) return;

            const { roles } = current;
            const role = roles[roles.length - 1];
            const el = form.inputs.roles.addListElement(role);
            el.subcomponents.button.on('click', () => {
                current.removeRole(role);
            });
        },
        Account.current.filterUsername
    );


    memberProfile.newUpdate(
        'remove-skill',
        () => {
            const { current } = Account;
            if (!current) return;

            const { memberInfo } = current;

            const skill = memberInfo.skills[memberInfo.skills.length - 1];
            const el = form.inputs.skills.collection[skill];
            if (!el) return;

            el.destroy();
        },
        Account.current.filterUsername
    );




    memberProfile.newUpdate(
        'remove-role',
        () => {
            const { current } = Account;
            if (!current) return;

            const { roles } = current;

            const role = roles[roles.length - 1];
            const el = form.inputs.roles.collection[role];
            if (!el) return;

            el.destroy();
        },
        Account.current.filterUsername
    );
});