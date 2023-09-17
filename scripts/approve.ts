import { Member } from '../server-functions/structure/member';

export const main = async (...args: string[]) => {
    console.log(args);
    const m = args[0];
    console.log(`Approving member ${m}`);
    // return;
    const member = await Member.get(m);
    if (!member) return console.log('Could not find member!');
    member.accept();
    console.log('Member approved!');
};