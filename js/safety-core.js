// הדרכות בטיחות (2026-11-19): the training-documentation form that every contractor who supplies
// workers fills and signs (training.html, through a personal link), and that the company keeps
// (safety-trainings.html). The texts of parts א'–ג' are the user's, word for word; part ד' (the
// participants and their signatures) is ours. The same checks run again in the database
// (safety_training_submit). Spec: docs/superpowers/specs/2026-11-19-safety-training-forms-design.md

const SAFETY_TOPICS = [
  { key: 'site_risks', title: 'סיכונים כלליים וספציפיים באתר', text: 'דרכי גישה, בורות פתוחים, תנועת כלים כבדים, עבודה בקרבת קווי מתח.' },
  { key: 'height', title: 'עבודה בגובה ומניעת נפילה', text: 'שימוש תקין ברתמות, מעקות, פיגומים, סולמות ופתחים ברצפה.' },
  { key: 'electric', title: 'חשמל וכלים מיטלטלים', text: 'בדיקת תקינות כבלים, מפסקי פחת, הארקה ושימוש בציוד מגן אישי (צמ"א).' },
  { key: 'heat', title: 'סיכונים פיזיולוגיים ועומס חום (תוספת 2026)', text: 'זיהוי סימני התייבשות ומכת חום, משטר שתייה והפסקות התרעננות.' },
  { key: 'excavation_lifting', title: 'חפירות ודיפון / הרמת מטענים', text: 'הנחיות בטיחות לעבודה בתעלות ועבודה תחת עגורנים.' },
  { key: 'emergency', title: 'נהלי חירום ועזרה ראשונה', text: 'מיקום ערכת עזרה ראשונה, מטפים, דרכי מילוט ופרטי התקשרות של בעלי תפקידים.' },
  { key: 'written_summary', title: 'מסירת תמצית מידע בכתב', text: 'אישור כי לכל עובד נמסרה תמצית כתובה על הסיכונים בעברית ובשפה המובנת לו' },
];

const SAFETY_TITLE = 'טופס תיעוד הדרכת בטיחות לעובדים';
const SAFETY_PART_A = "חלק א': פרטי האתר, הקבלן וההדרכה";
const SAFETY_PART_B = "חלק ב': נושאי ההדרכה והמידע שנמסר לעובדים";
const SAFETY_PART_B_INTRO = 'יש לסמן את הנושאים שהועברו בפועל בהתאם לסיכונים הספציפיים באתר ולדרישות התיקון מ-2026:';
const SAFETY_PART_C = 'חלק ג\': הצהרת "בעל מקצוע מתאים" (חובה לצרף לפנקס ההדרכה)';
const SAFETY_PART_C_INTRO = 'לפי תיקון התקנות של אוקטובר 2026, מעביר ההדרכה חייב לעמוד בהגדרת "בעל מקצוע מתאים" ולחתום על הצהרה זו:';
const SAFETY_PART_D = "חלק ד': רשימת העובדים המשתתפים וחתימותיהם";
const SAFETY_DECLARATION = 'אני החתום מטה מצהיר בזאת כי אני בעל הניסיון, הכישורים וההכשרה המתאימים להדרכת עובדים בתחום הבטיחות והבריאות התעסוקתית בנושאים שפורטו לעיל. ההדרכה הועברה על ידי פנים אל פנים, בשפה המובנת לכלל העובדים המשתתפים, ותוך התאמה לסיכונים הקיימים באתר העבודה.';
const SAFETY_FACE_TO_FACE = 'פנים אל פנים (פרונטלית בלבד – חובה באתרי בנייה ובנייה הנדסית לפי התקנות החדשות).';

// part א' and part ג' fields, in the order of the form; the column names are the database's
const SAFETY_FIELDS = [
  { key: 'contractor_name', label: 'שם הקבלן / החברה המבצעת', part: 'A' },
  { key: 'contractor_reg', label: 'ח.פ. / ע.מ.', part: 'A' },
  { key: 'site_name', label: 'שם אתר הבנייה וכתובתו', part: 'A' },
  { key: 'client_name', label: 'שם מזמין העבודה (היזם)', part: 'A' },
  { key: 'site_manager_name', label: 'שם מנהל העבודה באתר', part: 'A' },
  { key: 'training_date', label: 'תאריך ההדרכה', part: 'A', type: 'date' },
  { key: 'start_time', label: 'שעת התחלה', part: 'A', type: 'time' },
  { key: 'end_time', label: 'שעת סיום', part: 'A', type: 'time' },
  { key: 'language', label: 'שפת ההדרכה', part: 'A' },
  { key: 'translation', label: 'אמצעי תרגום (אם נדרש)', part: 'A' },
  { key: 'instructor_name', label: 'שם מלא של המדריך', part: 'C' },
  { key: 'instructor_id_number', label: 'מספר ת"ז / רישיון', part: 'C' },
  { key: 'instructor_role', label: 'תפקיד / הסמכה (מנהל עבודה / ממונה בטיחות / מדריך מוסמך)', part: 'C' },
  { key: 'instructor_signed_on', label: 'תאריך', part: 'C', type: 'date' },
];
// part ד' columns
const SAFETY_PEOPLE = [
  { key: 'full_name', label: 'שם מלא' },
  { key: 'id_number', label: 'ת"ז / דרכון' },
  { key: 'profession', label: 'מקצוע' },
  { key: 'language', label: 'שפה' },
];

const SAFETY_MAX_PEOPLE = 200;
const SAFETY_MAX_TEXT = 300;
const SAFETY_MAX_SIGNATURE = 150000;
const SAFETY_SIGNATURE_RE = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;

function sgpSafetySignatureError(sig) {
  if (typeof sig !== 'string' || !SAFETY_SIGNATURE_RE.test(sig)) return 'missing';
  return sig.length > SAFETY_MAX_SIGNATURE ? 'big' : null;
}

// The form ({ field: value, topics: [keys] }) and its participants → the problems, in Hebrew
function sgpSafetyValidate(form, people) {
  const f = form || {}, list = people || [], errs = [];
  if (!String(f.contractor_name || '').trim()) errs.push('חסר שם הקבלן / החברה');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(f.training_date || ''))) errs.push('חסר תאריך ההדרכה');
  if (!String(f.instructor_name || '').trim()) errs.push('חסר שם המדריך');
  const sig = sgpSafetySignatureError(f.instructor_signature);
  if (sig === 'missing') errs.push('חסרה חתימת המדריך');
  if (sig === 'big') errs.push('חתימה גדולה מדי');
  const keys = SAFETY_TOPICS.map(t => t.key);
  if ((f.topics || []).some(t => !keys.includes(t))) errs.push('נושא לא מוכר בחלק ב\'');
  for (const fld of SAFETY_FIELDS) {
    if (String(f[fld.key] ?? '').length > SAFETY_MAX_TEXT) errs.push('טקסט ארוך מדי: ' + fld.label);
  }
  if (!list.length) errs.push('צריך לפחות משתתף אחד');
  else if (list.length > SAFETY_MAX_PEOPLE) errs.push(`אפשר עד ${SAFETY_MAX_PEOPLE} משתתפים בטופס אחד`);
  else {
    list.forEach((p, i) => {
      const n = `משתתף ${i + 1}: `;
      if (!String(p.full_name || '').trim()) errs.push(n + 'חסר שם');
      const s = sgpSafetySignatureError(p.signature);
      if (s === 'missing') errs.push(n + 'חסרה חתימה');
      if (s === 'big') errs.push(n + 'חתימה גדולה מדי');
      for (const c of SAFETY_PEOPLE) {
        if (String(p[c.key] ?? '').length > SAFETY_MAX_TEXT) errs.push(n + 'טקסט ארוך מדי: ' + c.label);
      }
    });
  }
  return errs;
}

// ---- the link sent to the contractor ----
function sgpSafetyTokenOk(t) {
  return typeof t === 'string' && /^[0-9a-f]{64}$/.test(t);
}
function sgpSafetyLink(origin, token) {
  return `${origin}/training.html?t=${token}`;
}
function sgpSafetyMessage(link, { site, company, contractor } = {}) {
  return `שלום${contractor ? ' ' + contractor : ''}, מצורף טופס תיעוד הדרכת בטיחות לעובדים שלכם`
    + `${site ? ' באתר ' + site : ''}${company ? ' של ' + company : ''}. נא למלא את הפרטים, להחתים את המדריך ואת העובדים ולשלוח: ${link}`;
}
function sgpSafetyWhatsApp(text) {
  return 'https://wa.me/?text=' + encodeURIComponent(text);
}
function sgpSafetyMailto(email, text) {
  return `mailto:${email || ''}?subject=${encodeURIComponent('טופס תיעוד הדרכת בטיחות')}&body=${encodeURIComponent(text)}`;
}
