import { MAIN } from '../server-functions/databases';
import { Member } from '../server-functions/structure/member';

export const main = async () => {
    console.log(`Approving member ${process.argv[3]}`);
    // return;
    const member = await Member.get(process.argv[3]);
    if (!member) return console.log('Could not find member!');
    member.accept();
    console.log('Member approved!');
};