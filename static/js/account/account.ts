ServerRequest
    .post('/account/my-account')
    .then(({ 
        username,
        email,
        firstName,
        lastName,
        picture,
        memberInfo,
        roles
    }) => {
        Account.current = new Account(username, email, firstName, lastName, picture, memberInfo, roles);
    });





socket.on('change-username',
    (from: string, to: string) => {
        const a = Account.accounts[from];
        if (!a) return;
        a.username = to;
    }
);

socket.on('change-email',
    (username: string, to: string) => {
        const a = Account.accounts[username];
        if (!a) return;
        a.email = to;
    }
);

socket.on('change-first-name',
    (username: string, to: string) => {
        const a = Account.accounts[username];
        if (!a) return;
        a.firstName = to;
    }
);

socket.on('change-last-name',
    (username: string, to: string) => {
        const a = Account.accounts[username];
        if (!a) return;
        a.lastName = to;
    }
);

socket.on('change-picture',
    (username: string, to: string) => {
        const a = Account.accounts[username];
        if (!a) return;
        a.picture = to;
    }
);

socket.on('add-skill',
    (username: string, skill: string) => {
        const a = Account.accounts[username];
        if (!a) return;
        a.member?.skills.push(skill);
    }
);

socket.on('add-role',
    (username: string, role: string) => {
        const a = Account.accounts[username];
        if (!a) return;
        a.roles.push(role);
    }
);

socket.on('remove-skill',
    (username: string, skill: string) => {
        const a = Account.accounts[username];
        if (!a) return;
        a.member?.skills.splice(a.member.skills.indexOf(skill), 1);
    }
);

socket.on('remove-role',
    (username: string, role: string) => {
        const a = Account.accounts[username];
        if (!a) return;
        a.roles.splice(a.roles.indexOf(role), 1);
    }
);

socket.on('new-account', (a) => {
    new Account(
        a.username,
        a.email,
        a.firstName,
        a.lastName,
        a.picture,
        a.memberInfo,
        a.roles
    );
});

socket.on('remove-account', (username: string) => {
    const a = Account.accounts[username];
    if (!a) return;
    delete Account.accounts[username];
});