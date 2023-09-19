Account.onSetAccount(async () => {
    const { current } = Account;
    const { username } = current;

    await Member.getMembers();

    const member = Member.members[username];
    if (!member) throw new Error('Could not find member!');

    const { resume } = member;
    if (!resume) throw new Error('Could not find resume!');

    const canvas = document.querySelector('canvas');
    if (!canvas) throw new Error('Could not find canvas!');
    resume.viewer(canvas);
});