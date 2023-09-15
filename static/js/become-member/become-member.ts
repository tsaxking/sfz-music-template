enum MembershipStatus {
    pending = 'pending',
    accepted = 'accepted',
    rejected = 'rejected',
    notMember = 'notMember',
    notAllowed = 'notAllowed',
    twicePending = 'twicePending'
}



// TODO: Animated canvas

// const membershipCanvas = (() => {
//     const canvas = document.querySelector('#membership-canvas');
//     if (!canvas) throw new Error('Canvas not found');

//     return new Canvas(canvas as HTMLCanvasElement, {
//         size: {
//             width: canvas.parentElement?.clientWidth as number,
//             height: 1.5 * (canvas.parentElement?.clientHeight as number)
//         }
//     });
// })();


// const membershipStatusElements = {
//     pending: new Circle({ x: .25, y: .5, z: 0 }, 50),
//     accepted: new Circle({ x: .5, y: .5, z: 0 }, 50),
//     rejected: new Circle({ x: .75, y: .25, z: 0 }, 50),
//     notMember: new Circle({ x: .75, y: .75, z: 0 }, 50)
// }

// for (const status in membershipStatusElements) {
//     membershipCanvas.addElement(membershipStatusElements[status]);
// }

// membershipCanvas.start();








function membershipPending(container: CBS_Container) {
    console.log('pending');


    container.addRow().addCol({
        sm: 12
    }).append('Your membership is pending approval. You will be notified when your membership is approved. Thank you for your patience.');
}

function membershipAccepted(container: CBS_Container) {
    console.log('accepted');

    container.addRow().addCol({
        sm: 12
    }).append('Your membership has been accepted. Welcome to sfzMusic!');

    const button = CBS.createElement('button', {
        classes: ['btn-primary']
    });

    button.append('Go to Dashboard');

    button.on('click', () => {
        window.location.pathname = '/member/dashboard';
    });

    container.addRow().addCol({
        sm: 12
    }).append(button);
}

function membershipRejected(container: CBS_Container) {
    console.log('rejected');

    container.addRow().addCol({
        sm: 12
    }).append('Your membership has been rejected. If you believe this is a mistake, please contact an administrator.');

    
    const button = CBS.createElement('button', {
        classes: ['btn-primary']
    });

    button.append('Try again');

    button.on('click', () => {
        ServerRequest.post('/member/request');
    });

    container.addRow().addCol({
        sm: 12
    }).append(button);
}

function notMember(container: CBS_Container) {
    console.log('not member');

    container.addRow().addCol({
        sm: 12
    }).append('You are not a member of sfzMusic. If you would like to become a member, please click the button below.');

    const button = CBS.createElement('button', {
        classes: ['btn-primary']
    });

    button.append('Become a Member!');

    button.on('click', () => {
        ServerRequest.post('/member/request');
    });

    container.addRow().addCol({
        sm: 12
    }).append(button);
}

function notAllowed(container: CBS_Container) {
    console.log('not allowed');

    container.addRow().addCol({
        sm: 12
    }).append('You are not allowed to become a member of sfzMusic. If you believe this is a mistake, please contact an administrator.');
}




function populateMembershipStatus(response: {
    membershipStatus: MembershipStatus
}) {
    const { membershipStatus: status } = response;

    document.querySelector('#hold-on')?.remove();
    const membershipStatusPage = CBS.createDomFromElement(document.querySelector('#dom') as HTMLDivElement);
    membershipStatusPage.clearElements();
    const container = CBS.createElement('container');
    membershipStatusPage.append(container);

    switch (status) {
        case MembershipStatus.twicePending:
        case MembershipStatus.pending:
            membershipPending(container);
            break;
        case MembershipStatus.accepted:
            membershipAccepted(container);
            break;
        case MembershipStatus.rejected:
            membershipRejected(container);
            break;
        case MembershipStatus.notMember:
            notMember(container);
            break;
        case MembershipStatus.notAllowed:
            notAllowed(container);
            break;
    }
}


ServerRequest.post('/member/status')
    .then(populateMembershipStatus);

Account.onSetAccount(() => {
    socket.on('member-status', (username: string, status: MembershipStatus) => {
        if (Account.current?.username !== username) return;
        populateMembershipStatus({ membershipStatus: status });
    });
});
