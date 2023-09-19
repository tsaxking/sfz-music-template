class M_Dashboard extends Page {
    constructor(name: string, home: boolean) {
        super(name, home);
    }

    addMember(member: Member): void {
        const row = memberTableBody.addRow();
        row.addCell(member.username);
        row.addCell(member.title || '');
        row.addCell(member.status || '');
    
        row.on('click', () => {
            if (member.username === Account.current.username) {
                member.viewManageModal();
            } else {
                member.viewModal();
            }
        });
    }
}

const memberDashboard = new M_Dashboard('Dashboard', true);

memberDashboard.dom.append(CBS.createElement('h3').append('sfzMusic Members:'));


const memberTableContainer = CBS.createElement('div', {
    classes: ['table-responsive']
});

memberDashboard.dom.append(memberTableContainer);

const memberTable = CBS.createElement('table', {
    classes: ['table-dark', 'table-striped', 'table-hover']
});
memberTableContainer.append(memberTable);

const memberTableHeaders = memberTable.addHead().addRow();
memberTableHeaders.addHeader('Username');
memberTableHeaders.addHeader('Title');
memberTableHeaders.addHeader('Status');

const memberTableBody = memberTable.addBody();

memberDashboard.on(PageEvent.OPEN, async () => {
    // display stats on dashboard
    const members = await Member.getMembers();
    memberTableBody.clearElements();
    for (const member of members) {
        memberDashboard.addMember(member);
    }
});


socket.on('new-member', (username, memberInfo: MemberInfo) => {
    new Member(memberInfo);
});

memberDashboard.newUpdate(
    'new-member',
    async (username: string) => {
        let member = Member.members[username];
        if (!member) {
            await Member.getMembers();
            member = Member.members[username];
            if (!member) return;
        }

        memberDashboard.addMember(member);
    }
);