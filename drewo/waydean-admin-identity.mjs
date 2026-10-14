export async function readWaydeanAdminEmail(auth) {
  if (typeof auth?.getSession !== 'function') return '';
  try {
    const session = await auth.getSession();
    const email = session?.user?.email;
    return typeof email === 'string' ? email.trim() : '';
  } catch {
    return '';
  }
}
