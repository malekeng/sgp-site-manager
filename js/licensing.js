// ===== The licensing path to טופס 4 and תעודת גמר ======================================
// The stages and the approvals list a building needs, so the team does not have to know
// them by heart: loaded once per site from this template, then edited freely (each local
// committee has its own "טבלת ריכוז אישורים נדרשים").
// Sources (see the standards study): תקנות התכנון והבנייה (רישוי בנייה) 2016 — 76–78, 87(ב),
// 89, 95(א); ISRAC G-119-014 (the control institute's procedure and its start / completion
// checklists); the fire-authority form set; the municipal completion lists.

const LIC_STAGES = [
  { label: 'תחילת עבודות', hint: 'תקנות 76–78 · רשימת התיוג לתחילת עבודות (ISRAC)' },
  { label: 'ביקורות שלביות', hint: 'תקנה 87(ב) — 4 ביקורות לפחות; דוח תוך 5 ימים (תקנה 89)' },
  { label: 'גמר בנייה ואישורי גורמים', hint: 'ISRAC 4.13 · רשימת התיוג לגמר הבניין' },
  { label: 'טופס 4 ללא אכלוס', hint: 'חיבור לתשתיות להרצת המערכות, בלי שימוש במבנה' },
  { label: 'אישור אכלוס (טופס 4)', hint: 'שימוש במבנה כשאין סכנה למשתמשים' },
  { label: 'תעודת גמר', hint: 'תקנה 95(א) — הבנייה בוצעה לפי ההיתר' },
];

// Commercial and office buildings. [stage index, item, issuer / responsible, basis, category]
const LIC_TEMPLATE_COMMERCIAL = [
  [0, 'היתר בנייה בתוקף', 'ועדה מקומית', 'חוק התכנון והבנייה', 'רשויות ואישורים'],
  [0, 'הודעת מינויים: עורך ראשי, מתכננים, אחראי לביצוע, קבלן רשום, מנהל עבודה', 'ועדה מקומית', 'תקנה 76', 'רשויות ואישורים'],
  [0, 'התקשרות עם מכון בקרה', 'מכון בקרה', 'ISRAC G-119-014', 'בדיקות מכון'],
  [0, 'התקשרות עם מעבדה מוסמכת', 'מעבדה מוסמכת', 'ISRAC 4.7', 'בדיקות מכון'],
  [0, 'תכנית בדיקות מאושרת (סוגי הבדיקות וכמותן לפרויקט)', 'מכון בקרה', 'ISRAC 4.7 · נספח תכנית בדיקות', 'בדיקות מכון'],
  [0, 'סימון קווי בניין ע״י מודד מוסמך', 'מודד מוסמך', 'ISRAC — רשימת תיוג לתחילת עבודות', 'מסמכי תכנון'],
  [0, 'הערכת כמויות פסולת בניין והתקשרות עם אתר סילוק מורשה', 'רשות מקומית', 'ISRAC — רשימת תיוג לתחילת עבודות', 'רשויות ואישורים'],
  [0, 'נספח ארגון אתר ושלט אתר', 'ועדה מקומית', 'ISRAC — רשימת תיוג לתחילת עבודות', 'מסמכי תכנון'],
  [0, 'גידור האתר', 'קבלן ראשי', 'ISRAC — רשימת תיוג לתחילת עבודות', 'רשויות ואישורים'],
  [1, 'ביקורת סימון קווי בניין', 'מכון בקרה', 'תקנה 87(ב)', 'בדיקות מכון'],
  [1, 'ביקורת גמר יסודות', 'מכון בקרה', 'תקנה 87(ב)', 'בדיקות מכון'],
  [1, 'ביקורת גמר שלד / ממ״ד', 'מכון בקרה', 'תקנה 87(ב)', 'בדיקות מכון'],
  [1, 'אישור פיקוד העורף — ממ״ד / מקלט (בטון, טיח, אטימות, אוורור וסינון)', 'פיקוד העורף', 'ת״י 4570', 'רשויות ואישורים'],
  [2, 'ביקורת גמר בנייה', 'מכון בקרה', 'תקנה 87(ב)', 'בדיקות מכון'],
  [2, 'אישור רשות הכבאות (מים, מטפים, תאורת חירום, גילוי אש ועשן, כריזה, מתזים, שחרור עשן)', 'רשות הכבאות', 'ת״י 1220 · ת״י 1596', 'רשויות ואישורים'],
  [2, 'אישור בודק חשמל / חברת החשמל', 'חברת החשמל', 'ISRAC 4.13', 'חיבורי תשתית'],
  [2, 'אישור תאגיד מים וביוב (חיבור, שטיפה וחיטוי)', 'תאגיד מים וביוב', 'ת״י 1205', 'חיבורי תשתית'],
  [2, 'אישור בודק מעליות מוסמך', 'בודק מעליות', 'ת״י 2481', 'בדיקות מכון'],
  [2, 'אישור מתקין גז מורשה', 'מתקין גז', 'ת״י 158', 'חיבורי תשתית'],
  [2, 'אישור מורשה נגישות', 'מורשה נגישות', 'תקנה 95 · ת״י 1918', 'רשויות ואישורים'],
  [2, 'מפת מדידה AS-MADE (כולל פיתוח ומפלס גמר)', 'מודד מוסמך', 'ISRAC 4.13.5.2', 'מסמכי תכנון'],
  [2, 'תוצאות מעבדה מרוכזות לכל הבדיקות לפי תכנית הבדיקות', 'מעבדה מוסמכת', 'ISRAC — תכנית בדיקות', 'בדיקות מכון'],
  [2, 'תכניות AS-MADE למבנה', 'מתכננים', 'ISRAC — רשימת תיוג לגמר הבניין', 'מסמכי תכנון'],
  [2, 'אישורי מתכננים לאיכות הביצוע (קונסטרוקטור ומתכננים)', 'מתכננים', 'ISRAC 4.11.5.6', 'מסמכי תכנון'],
  [2, 'אישור פינוי פסולת לאתר מורשה', 'רשות מקומית', 'ISRAC — רשימת תיוג לגמר הבניין', 'רשויות ואישורים'],
  [2, 'מסמכי הפעלה ותחזוקה של המערכות', 'קבלן ראשי', 'ISRAC — רשימת תיוג לגמר הבניין', 'מסמכי תכנון'],
  [3, 'בקשה לטופס 4 ללא אכלוס (חיבור לתשתיות להרצת מערכות)', 'ועדה מקומית', 'נוהל הרשות המקומית', 'רשויות ואישורים'],
  [4, 'דוח מסכם של מכון הבקרה — "ראוי לשימוש"', 'מכון בקרה', 'ISRAC 4.13', 'בדיקות מכון'],
  [4, 'הצהרת האחראי לביקורת על הביצוע שהבנייה לפי ההיתר', 'אחראי לביקורת', 'תקנה 95(א)', 'רשויות ואישורים'],
  [4, 'אישור הרשות המקומית: ערבויות, היטלים, פיתוח, דרכים וגינון', 'רשות מקומית', 'ISRAC — רשימת תיוג לגמר הבניין', 'רשויות ואישורים'],
  [4, 'ביקורת מפקח הרשות המקומית באתר', 'רשות מקומית', 'ISRAC 4.13', 'רשויות ואישורים'],
  [5, 'בקשה לתעודת גמר עם מפת עדות ותכניות עדות', 'ועדה מקומית', 'תקנה 95(א)', 'רשויות ואישורים'],
  [5, 'שחרור ערבויות', 'רשות מקומית', 'תנאי ההיתר', 'רשויות ואישורים'],
];

// institute: the site's control institute (e.g. "איזוטופ"), written into its items
function licTemplateRows(institute) {
  const name = String(institute || '').trim();
  return LIC_TEMPLATE_COMMERCIAL.map(([st, item_name, responsible, basis, category], i) => ({
    stage: LIC_STAGES[st].label, item_name, basis, category, status: 'פתוח', sort_order: (i + 1) * 10,
    responsible: name && responsible === 'מכון בקרה' ? `מכון בקרה ${name}` : responsible,
  }));
}

// The stage path above the list: done / total per stage; a click shows only that stage.
function licPathHtml(rows, activeStage) {
  const byStage = LIC_STAGES.map(s => {
    const items = rows.filter(r => r.stage === s.label);
    const done = items.filter(r => r.status === 'הושלם').length;
    return { ...s, total: items.length, done };
  });
  const other = rows.filter(r => !LIC_STAGES.some(s => s.label === r.stage)).length;
  return `<ol class="lic-path">${byStage.map((s, i) => {
    const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
    const state = !s.total ? 'empty' : s.done === s.total ? 'done' : s.done ? 'partial' : 'open';
    return `<li class="lic-step lic-${state}${activeStage === s.label ? ' active' : ''}">
      <button type="button" data-stage="${esc(s.label)}" title="${esc(s.hint)}">
        <span class="lic-num">${state === 'done' ? uiIcon('check', 14) : i + 1}</span>
        <span class="lic-name">${esc(s.label)}</span>
        <span class="lic-count">${s.total ? `${s.done}/${s.total}` : '—'}</span>
        <span class="lic-bar"><span style="width:${pct}%"></span></span>
      </button></li>`;
  }).join('')}</ol>${other ? `<p class="lic-note">${other} פריטים ללא שלב</p>` : ''}`;
}
