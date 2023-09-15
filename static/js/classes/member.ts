type MemberInfo = {
    username: string;
    bio: string;
    title: string;
    resume: string|null;
    status: MembershipStatus;
    skills: string[];
}



class Member {
    static members: { [username: string]: Member } = {};

    public static async getMembers(): Promise<Member[]> {
        if (Object.keys(Member.members).length) return Object.values(Member.members);

        return ServerRequest.post('/member/get-members')
            .then((members: MemberInfo[]) => members.map(m => new Member(m)));
    };





    public username: string;
    public bio: string;
    public title: string;
    public resume?: PDF;
    public status: MembershipStatus;
    public skills: string[];

    constructor(memberInfo: MemberInfo) {
        this.username = memberInfo.username;
        this.bio = memberInfo.bio;
        this.title = memberInfo.title;
        if (memberInfo.resume) {
            this.resume = new PDF(memberInfo.resume, memberInfo.username + "'s resume");
        }
        this.status = memberInfo.status;
        this.skills = memberInfo.skills;

        Member.members[this.username] = this;
    }


    // changes


    async changeBio(bio: string) {
        return ServerRequest.post('/member/change-bio', {
            username: this.username,
            bio
        });
    }

    async changeTitle(title: string) {
        return ServerRequest.post('/member/change-title', {
            username: this.username,
            title
        });
    }

    async addSkill(skill: string) {
        return ServerRequest.post('/member/add-skill', {
            username: this.username,
            skill
        });
    }

    async removeSkill(skill: string) {
        return ServerRequest.post('/member/remove-skill', {
            username: this.username,
            skill
        });
    }







    // TODO: create member profile view
    view(): CBS_Container {
        const container = CBS.createElement('container');









        return container;
    }

    // TODO: create member management view
    manage(): CBS_Form {
        const form = CBS.createElement('form');

        const bio = form.createInput('Bio', 'textarea');
        bio.value = this.bio;

        const title = form.createInput('Title', 'text');
        title.value = this.title;

        const resume = form.createInput('Resume', 'file');
        resume.on('change', () => {});

        return form;
    }






    modal(): void {
        const container = CBS.createElement('container');
        const nav = CBS.createElement('tab-nav');

        container.addRow().append(nav);

        const profile = nav.addPage('Profile', this.view());
        const manage = nav.addPage('Manage',  this.manage());

        container.addRow().append(profile, manage);

        const modal = CBS.modal(container);

        modal.show();
    }
}