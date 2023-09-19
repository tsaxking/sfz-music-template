import { Member } from '../server-functions/structure/member';

export const main = async (...args: string[]) => {
    console.log(args);
    const m = args[0];
    console.log(`Approving member ${m}`);
    // return;
    const member = await Member.get(m);
    if (!member) return console.log('Could not find member!');
    await member.accept();
    console.log('Member approved!');

    if (args.includes('board')) {
        console.log('Adding to board...');
        await member.addToBoard();
        console.log('Added to board!');
    }
};