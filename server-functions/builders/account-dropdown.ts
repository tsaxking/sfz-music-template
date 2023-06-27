import parse from "node-html-parser";
import { Session } from "../structure/sessions"
import { getJSON, getTemplate } from "../files";

enum SectionType {
    link = 'link',
    line = 'line'
}

type Section = {
    title: string,
    icon: string,
    url: string,
    type: SectionType
}

export const buildAccountDropdown = async (session: Session): Promise<string> => {
    if (session.account) {
        return getTemplate('account/not-signed-in-dropdown') as Promise<string>;
    }




    const root = parse(`
            <ul class="navbar-nav mb-2 mb-lg-0">
            </ul>
        `);
    
    const dropdown = parse(`
            <li class="nav-item dropdown">
            </li>
        `);

    const links = await getJSON('account-dropdown');

    for (const link of links) {
        switch (link.type) {
            case SectionType.link:
                (() => {
                    const item = parse(`
                        <li class="nav-item">
                            <a class="nav-link" href="${link.url}">
                                ${link.icon}&nbsp;${link.title}
                            </a>
                        </li>
                    `);
                    dropdown.appendChild(item);
                })();
                break;
            case SectionType.line:
                (() => {
                    const item = parse(`
                        <li><hr class="dropdown-divider"></li>
                    `);
                    dropdown.appendChild(item);
                }
                )();
                break;
            default:
                console.error(new Error(`Invalid link type: ${link.type}`));
        }
    }

    root.appendChild(dropdown);

    return root.toString();
}