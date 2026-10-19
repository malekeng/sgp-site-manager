// Supabase client — shared across all pages
const SUPABASE_URL = 'https://odsxjatgebpwphzbevpu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9kc3hqYXRnZWJwd3BoemJldnB1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5NzIxNDksImV4cCI6MjEwMTU0ODE0OX0.5J0zvsxDeOjWeSkEmXVBTnEPhFXN8I0NGZbOgVTM2T8';

const SUPABASE_FUNCTIONS_URL = SUPABASE_URL + '/functions/v1';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Signed in with a temporary password (users.html "סיסמה זמנית"): a new one must be set
// before anything else opens (index.html shows that screen; requireAuth sends them there).
function mustChangePassword(user) {
  return !!(user && user.user_metadata && user.user_metadata.must_change_password === true);
}

// Who may edit or delete a row (spec 2026-10-19-record-ownership; the database enforces the same):
// its author, the company's owner/admin, or a member whose job title is "מנהל פרויקט".
// who = { id, role, jobTitle } (window.sgpWho, set by requireAuth).
const PROJECT_MANAGER_TITLE = 'מנהל פרויקט';
function canManageAll(who) {
  return !!who && (who.role === 'owner' || who.role === 'admin' || (who.role === 'site_user' && who.jobTitle === PROJECT_MANAGER_TITLE));
}
function canChangeRecord(row, who, author = 'created_by') {
  if (!who || !row) return false;
  return canManageAll(who) || (!!row[author] && row[author] === who.id);
}
// a task's assignee may also move its status
function canSetTaskStatus(task, who) {
  return canChangeRecord(task, who) || (!!who && !!task && !!task.assignee_id && task.assignee_id === who.id);
}
