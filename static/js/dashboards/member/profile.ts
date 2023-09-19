class MemberProfile extends Page {
    constructor(name: string) {
        super(name);
    }

    openProfile(): void {
        if (!Account.current) return; // If no account is set, it'll be handled by the Account.onSetAccount event
        const form = Account.current.editForm();
        this.dom.clearElements();
        this.dom.append(form.container.el);
    }
}


const memberProfile = new MemberProfile('Profile');



memberProfile.on(PageEvent.OPEN, () => {
    memberProfile.openProfile();
});


// █ █ █▀▄ █▀▄ ▄▀▄ ▀█▀ ██▀ ▄▀▀ 
// ▀▄█ █▀  █▄▀ █▀█  █  █▄▄ ▄█▀ 

Account.onSetAccount(() => {
    memberProfile.openProfile();
});