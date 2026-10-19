// "סיסמה זמנית" (2026-10-19): an owner or admin gives a member a temporary password when the
// reset email cannot be used; the member replaces it at the next login (mustChangePassword).
// The set-temp-password Edge Function holds these three word for word — a test checks it.

// letters and digits that cannot be read as one another (no 0 O 1 l I)
const TEMP_PASSWORD_CHARS = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';

// owner → admin, site_user, contractor; admin → site_user, contractor; never an owner, never oneself
function tempPasswordAllowed(callerRole, targetRole, isSelf) {
  if (isSelf) return false;
  if (callerRole === 'owner') return ['admin', 'site_user', 'contractor'].includes(targetRole);
  if (callerRole === 'admin') return ['site_user', 'contractor'].includes(targetRole);
  return false;
}

// 10 characters with at least one letter and one digit; rand(n) gives n random whole numbers
function tempPasswordGenerate(rand) {
  for (;;) {
    const r = rand(10);
    let p = '';
    for (let i = 0; i < 10; i++) p += TEMP_PASSWORD_CHARS[r[i] % TEMP_PASSWORD_CHARS.length];
    if (/[a-zA-Z]/.test(p) && /[2-9]/.test(p)) return p;
  }
}
