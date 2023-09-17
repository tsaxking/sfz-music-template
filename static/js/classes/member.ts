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

        console.log('No members, retrieving from server.');
        
        return ServerRequest.post('/member/get-members')
            .then((members: MemberInfo[]) => members.map(m => new Member(m)));
    };





    public username: string;
    public bio: string;
    public title: string;
    public resume?: PDF;
    public status: MembershipStatus;
    public skills: string[];

    private viewUpdates: ViewUpdate[] = [];

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

    filterUsername(username: string) {
        return this.username.toLowerCase() === username.toLowerCase();
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

    async changeResume(resume: File) {
        return ServerRequest.post('/member/change-resume', {
            username: this.username,
            resume
        });
    }





    // TODO: create member profile view
    async view(): Promise<CBS_Container> {
        const container = CBS.createElement('container');

        container.addRow().append(CBS.createElement('h4').append(`${this.username}'s Profile`));

        container.addRow().append(CBS.createElement('h6').append('Bio'));
        container.addRow().append(CBS.createElement('p').append(this.bio || 'No bio yet'));

        container.addRow().append(CBS.createElement('h6').append('Title'));
        container.addRow().append(CBS.createElement('p').append(this.title || 'No title yet'));

        container.addRow().append(CBS.createElement('h6').append('Skills'));
        const skills = CBS.createElement('list');

        for (const skill of this.skills) {
            const li = CBS.createElement('li');
            li.append(skill);
            skills.append(li);
        }
        container.addRow().append(skills);

        container.addRow().append(CBS.createElement('h6').append('Resume'));
        const canvas = document.createElement('canvas');
        container.addRow().append((await this.resume?.viewer(canvas)) || 'No resume uploaded');


        return container;
    }

    // TODO: create member management view
    manage(): CBS_Container {
        const manageUpdates: ViewUpdate[] = [];

        const newUpdate = (name: string, callback: (...args: any[]) => void) => {
            const u = this.newUpdate(name, callback);
            manageUpdates.push(u);
        }


        const container = CBS.createElement('container');

        const bioInput = CBS.createElement('input-label-save', {
            clear: false
        });
        bioInput.subcomponents.container.label.append('Bio');
        bioInput.subcomponents.container.addClass('w-100', 'pe-2');
        bioInput.input = CBS.createElement('input-textarea');
        bioInput.input.value = this.bio;
        bioInput.on('input.save', () => {
            this.changeBio(bioInput.input.value);
        });
        container.addRow().append(bioInput);

        newUpdate(
            'change-bio', 
            () => bioInput.value = this.bio
        );


        const titleInput = CBS.createElement('input-label-save', {
            clear: false
        });
        titleInput.subcomponents.container.label.append('Title');
        titleInput.subcomponents.container.addClass('w-100', 'pe-2');
        titleInput.input = CBS.createElement('input');
        titleInput.input.value = this.title;
        titleInput.on('input.save', () => {
            this.changeTitle(titleInput.input.value);
        });
        container.addRow().append(titleInput);

        newUpdate(
            'change-title', 
            () => titleInput.value = this.title
        );


        const addSkillLabel = (row: CBS_Row, skill: string) => {
            const div = CBS.createElement('div');
            div.addClass('d-flex', 'justify-content-between', 'align-items-center');

            const remove = CBS.createElement('button', {
                color: 'danger'
            }).append('Remove').on('click', () => {
                this.removeSkill(skill).then(() => {
                    div.destroy();
                });
            });

            div.append(CBS.createElement('p').append(skill), remove);
            row.addCol().append(div);
        }

        const skillsRow = container.addRow();
        this.skills.forEach(s => addSkillLabel(skillsRow, s));

        newUpdate(
            'add-skill',
            (username: string, skill: string) => addSkillLabel(skillsRow, skill)
        )



        const addSkillInput = CBS.createElement('input-label-save', {
            clear: false
        });
        addSkillInput.subcomponents.container.label.append('Add Skill');
        addSkillInput.subcomponents.container.addClass('w-100', 'pe-2');
        addSkillInput.input = CBS.createElement('input');
        addSkillInput.on('input.save', () => {
            this.addSkill(addSkillInput.input.value).then(() => {
                addSkillLabel(skillsRow, addSkillInput.input.value);
                addSkillInput.input.value = '';
            });
        });
        container.addRow().append(addSkillInput);
        
        const addResumeInput = CBS.createElement('input-label-save', {
            clear: false
        });
        addResumeInput.subcomponents.container.label.append('Resume');
        addResumeInput.input = CBS.createElement('input-file');
        addResumeInput.subcomponents.container.addClass('w-100', 'pe-2');
        (addResumeInput.input as CBS_FileInput).accept = ['.pdf'];
        addResumeInput.on('input.save', () => {
            this.changeResume((addResumeInput.input as CBS_FileInput).value[0]).then(() => {
                addResumeInput.input.value = '';
            });
        });
        container.addRow().append(addResumeInput);

        container.on('el.destroy', () => {
            manageUpdates.forEach(u => u.destroy());
        });


        return container;
    }






    async modal(): Promise<CBS_Modal> {
        const container = CBS.createElement('container');
        const nav = CBS.createElement('tab-nav');
        nav.addClass('nav-tabs');

        container.addRow().append(nav);

        const profile = nav.addPage('Profile', await this.view());
        const manage = nav.addPage('Manage',  this.manage());

        container.addRow().append(profile, manage);

        const modal = CBS.modal(container, {
            title: 'Member',
            size: 'xl',
            destroyOnHide: true
        });

        return modal;
    }




    
    private newUpdate(name: string, callback: (...args: any[]) => void) {
        const update = new ViewUpdate(name, null, callback, this.filterUsername);
        return update;
    }
}