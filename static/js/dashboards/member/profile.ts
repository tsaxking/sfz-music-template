


const memberProfile = new Page('Profile');


memberProfile.data.open = () => {
    if (!Account.current) return; // If no account is set, it'll be handled by the Account.onSetAccount event
    const form = Account.current.editForm();
    memberProfile.dom.clearElements();
    memberProfile.dom.append(form.container.el);
};


memberProfile.on(PageEvent.OPEN, () => {
    memberProfile.data.open();
});


// █ █ █▀▄ █▀▄ ▄▀▄ ▀█▀ ██▀ ▄▀▀ 
// ▀▄█ █▀  █▄▀ █▀█  █  █▄▄ ▄█▀ 

Account.onSetAccount(() => {
    memberProfile.data.open();
});