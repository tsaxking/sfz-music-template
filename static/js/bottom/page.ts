
document.addEventListener('DOMContentLoaded', () => {
    const page = Page.pages[capitalize(window.location.pathname.split('/')[2].toLowerCase())];
    // console.log(page, Page);
    if (page) page.open();
    // open first page if no page is found
    else Page.home.open();
});




window.onpopstate = (e) => {
    e.preventDefault();
    const page = Page.pages[e.state.page];
    if (page) page.open();
    // open first (or home) page if no page is found
    else Page.home.open();
}

socket.on('page-open', (page: string) => {
    const p = Page.pages[page];
    if (p) p.open();
});