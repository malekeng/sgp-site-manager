// The weekly plan as a sheet: days → groups (גרעין 4, כלי צמ"ה, כללי) → lines. A line is a row of
// `tasks` in the plan: due_date is its day, plan_group its group. Pure, for the page and its PDF.
const WP_GENERAL = 'כללי';
const WP_NO_DAY = 'ללא יום';
const WP_DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const WP_COLORS = ['#3D9EFF', '#00C77F', '#7C4DFF', '#E8952E', '#E5484D', '#12A5A5', '#D6409F', '#8D6E3F'];
const WP_GENERAL_COLOR = '#9AA3B8';
const WP_DAY_MS = 86400000;
const WP_MAX_DAYS = 31;

function wpEsc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function wpParts(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) } : null;
}

function wpDayLabel(iso) {
  const p = wpParts(iso);
  if (!p) return WP_NO_DAY;
  const day = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
  return `יום ${WP_DAY_NAMES[day]}, ${String(p.d).padStart(2, '0')}/${String(p.m).padStart(2, '0')}`;
}

function wpGroupOf(task) {
  return String(task.plan_group || '').trim() || WP_GENERAL;
}

// Numbered cores by number, then the other groups as they first appear, כללי last.
function wpGroups(tasks) {
  const rank = name => {
    if (name === WP_GENERAL) return Infinity;
    const m = name.match(/גרעין\s*(\d+)/);
    return m ? Number(m[1]) : 1e6;
  };
  const names = [...new Set(tasks.map(wpGroupOf))]
    .map((name, i) => ({ name, i }))
    .sort((a, b) => rank(a.name) - rank(b.name) || a.i - b.i)
    .map(g => g.name);
  let next = 0;
  return names.map(name => ({ name, color: name === WP_GENERAL ? WP_GENERAL_COLOR : WP_COLORS[next++ % WP_COLORS.length] }));
}

function wpSheet(tasks) {
  const groups = wpGroups(tasks);
  const days = [...new Set(tasks.map(t => t.due_date || null))]
    .sort((a, b) => (a === null) - (b === null) || String(a).localeCompare(String(b)));
  return days.map(date => {
    const ofDay = tasks.filter(t => (t.due_date || null) === date);
    return {
      date,
      label: wpDayLabel(date),
      groups: groups.map(g => ({ ...g, lines: ofDay.filter(t => wpGroupOf(t) === g.name) })).filter(g => g.lines.length),
    };
  });
}

function wpWeekDays(plan) {
  const s = wpParts(plan.week_start);
  if (!s) return [];
  const e = wpParts(plan.week_end);
  const start = Date.UTC(s.y, s.m - 1, s.d);
  const last = e ? Date.UTC(e.y, e.m - 1, e.d) : start + 6 * WP_DAY_MS;
  const days = [];
  for (let t = start; t <= last && days.length < WP_MAX_DAYS; t += WP_DAY_MS) days.push(new Date(t).toISOString().slice(0, 10));
  return days.length ? days : [String(plan.week_start).slice(0, 10)];
}

function wpDots(iso, yearDigits = 0) {
  const p = wpParts(iso);
  if (!p) return '';
  return `${p.d}.${p.m}` + (yearDigits ? `.${String(p.y).slice(-yearDigits)}` : '');
}

function wpWeekText(plan) {
  return plan.week_end ? `${wpDots(plan.week_start, 4)} – ${wpDots(plan.week_end, 4)}` : wpDots(plan.week_start, 4);
}

function wpFileName(siteName, plan) {
  const site = String(siteName || '').replace(/[\\/:*?"<>|]+/g, '-');
  const range = plan.week_end ? `${wpDots(plan.week_start)}-${wpDots(plan.week_end, 2)}` : wpDots(plan.week_start, 2);
  return `תכנית עבודה שבועית - ${site} ${range}.pdf`;
}

// "+71.30" and "-2" keep their sign beside the number inside Hebrew text. Takes escaped text.
function wpLevels(html) {
  return html.replace(/(^|[\s(,:])([+-]\d+(?:\.\d+)?)(?=$|[\s),.;:])/g, '$1<span dir="ltr" style="unicode-bidi:isolate;">$2</span>');
}

function wpLineHtml(task) {
  const part = s => wpLevels(wpEsc(String(s).trim()));
  return task.location ? `${part(task.title)} · ${part(task.location)}` : part(task.title);
}

// Which cards go on which page. A card that does not fit moves on whole; a page always takes one.
function wpPaginate(heights, firstRoom, restRoom) {
  const pages = [[]];
  let room = firstRoom;
  heights.forEach((h, i) => {
    const page = pages[pages.length - 1];
    if (page.length && h > room) {
      pages.push([i]);
      room = restRoom - h;
    } else {
      page.push(i);
      room -= h;
    }
  });
  return pages;
}

// A plan line stays on the plan until someone is assigned to it; then it is a task like any other.
// TASKS_ON_BOARD (supabase-client.js) is the same rule for a query.
function wpIsBoardTask(task) {
  return !task.plan_group || !!task.assignee_id;
}

// `existing` is the row being edited. A task from before the groups keeps having none.
function wpGroupToSave(input, existing) {
  const name = String(input || '').trim();
  if (name) return name;
  return existing && !existing.plan_group ? null : WP_GENERAL;
}
