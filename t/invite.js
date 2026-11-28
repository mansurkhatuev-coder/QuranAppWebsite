// The Pages 404 handler sends unresolved /t/<login> invitations here as ?c=<login>.
const params = new URLSearchParams(location.search);
const login = params.get('u') || params.get('c') || params.get('code');
const target = new URL('/atlas/', location.origin);
target.searchParams.set('login','1');
if (login) target.searchParams.set('u',login);
location.replace(target.pathname + target.search);
