// "שינוי סיסמה" in profile.html (2026-11-02): what is checked before the call, and the server's
// refusals in Hebrew. The minimum is the one the login page asks for a new password.
const PASSWORD_MIN = 6;

function passwordChangeProblem(current, next, confirm) {
  if (!current) return 'יש להזין את הסיסמה הנוכחית';
  if (!next || next.length < PASSWORD_MIN) return `הסיסמה החדשה צריכה להיות באורך ${PASSWORD_MIN} תווים לפחות`;
  if (next !== confirm) return 'הסיסמאות אינן תואמות';
  if (next === current) return 'הסיסמה החדשה זהה לנוכחית';
  return null;
}

function passwordErrorText(err) {
  const code = (err && err.code) || '';
  const message = String((err && err.message) || '');
  if (code === 'same_password') return 'הסיסמה החדשה זהה לנוכחית';
  if (code === 'weak_password') return 'הסיסמה החדשה חלשה מדי — נסו סיסמה ארוכה יותר, עם אותיות ומספרים';
  if (code === 'over_request_rate_limit') return 'יותר מדי ניסיונות — נסו שוב בעוד כמה דקות';
  if (code === 'reauthentication_needed') return 'יש להתחבר מחדש לפני שינוי הסיסמה — צאו והיכנסו שוב, ונסו שוב';
  return 'שגיאה בשינוי הסיסמה: ' + message;
}
