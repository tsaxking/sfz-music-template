document.addEventListener('DOMContentLoaded', () => {
    const page = Page.pages[capitalize(window.location.pathname.split('/')[2].toLowerCase())];
    if (page) page.open();
    // open first page if no page is found
    else Page.home.open();
});