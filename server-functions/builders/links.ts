import parse, { HTMLElement } from "node-html-parser";
import { getJSON, getTemplate } from "../files"
import { Session } from "../structure/sessions";
import { buildAccountDropdown } from "./account-dropdown";


enum PageType {
    page = 'page',
    dropdown = 'dropdown',
    section = 'section'
}

type Page = {
    title: string,
    type: PageType,
    link?: string,
    items?: Page[],
    keywords?: string[]
    description?: string,
    template?: string
}


type LinkResult = {
    html: string,
    description: string,
    keywords: string[]
};

export const linkBuilder = async (url: string): Promise<LinkResult> => {
    let root = parse(`<ul class="nav nav-tabs"></ul>`);
    const pages = await getJSON('sfz-pages');

    let description = '';
    let keywords: string[] = [];

    const addContent = (root: HTMLElement, page: Page): HTMLElement => {
        switch (page.type) {
            case PageType.page:
                (() => {
                    const item = parse(`<item class="nav-item"><a class="nav-link" href="${page.link}">${page.title}</a></item>`);
                    if (url === page.link) {
                        item.classList.add('active');
                        description = page.description || '';
                        keywords = page.keywords || [];
                    }
                    root.appendChild(item);
                })();
                break;
            case PageType.dropdown:
                (() => {
                    const item = parse(`<item class="nav-item dropdown">`);
                    const a = parse(`<a class="nav-link dropdown-toggle" href="#" id="navbarDropdown" role="button" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">${page.title}</a>`);
                    item.appendChild(a);
                    let menu = parse(`<ul class="dropdown-menu" aria-labelledby="navbarDropdown"></ul>`);

                    if (!page.items) {
                        return console.error(new Error(`Invaitemd page: ${page.title} page has no items`));
                    }

                    for (const p of page.items) {
                        menu = addContent(menu, p);
                    }
                    item.appendChild(menu);
                    root.appendChild(item);
                })();
                break;
            case PageType.section:
                const section = parse(`<item class="nav-item"><strong>${page.title}</strong></item>`);
                const hr = parse(`<li><hr class="dropdown-divider"></li>`);
                root.appendChild(section);
                root.appendChild(hr);
                break;
            default:
                console.error(new Error('Invaitemd page type: ' + page.type + ' in ' + page.title + ' page'));
                break;
        }

        return root;
    }



    for (const page of pages) {
        root = addContent(root, page);
    }

    return {
        html: root.toString(),
        description,
        keywords
    }
}


export const navbarBuilder = async (url: string, session: Session): Promise<LinkResult> => {
    const [mainLinks, accountDropdown] = await Promise.all([
        linkBuilder(url),
        buildAccountDropdown(session)
    ]);

    return {
        html: await getTemplate('/components/navbar', {
            mainLinks,
            accountDropdown,
            accountName: session.account?.username || 'Guest'
        }) as string,
        description: mainLinks.description,
        keywords: mainLinks.keywords
    };
}