// Ezoic ads.txt — managed via adstxtmanager so the seller list stays current.
// Cloudflare Pages _redirects can't do absolute/external redirects, so this
// Pages Function handles /ads.txt with a 301 to Ezoic's manager.
// Publisher ID: 19390 (https://docs.ezoic.com/docs/ezoicads/adstxt/)
const ADSTXT_MANAGER_URL = 'https://srv.adstxtmanager.com/19390/emwiki.com';

export function onRequest() {
    return Response.redirect(ADSTXT_MANAGER_URL, 301);
}
