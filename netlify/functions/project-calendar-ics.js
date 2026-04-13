function formatIcsDate(dateValue) {
  const date = new Date(`${dateValue}T00:00:00`);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function escapeIcsText(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ message: 'Method Not Allowed' }),
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const title = String(body.title || '').trim();
    const startDate = String(body.startDate || '').trim();
    const endDateExclusive = String(body.endDateExclusive || '').trim();
    const description = String(body.description || '').trim();
    const fileName = String(body.fileName || 'project-calendar.ics').trim();

    if (!title || !startDate || !endDateExclusive) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'title, startDate, endDateExclusive are required' }),
      };
    }

    const uid = `${Date.now()}-${Math.random().toString(36).slice(2)}@bexley-project`;
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Bexley//Project Calendar//KO',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${formatIcsDate(startDate)}`,
      `DTEND;VALUE=DATE:${formatIcsDate(endDateExclusive)}`,
      `SUMMARY:${escapeIcsText(title)}`,
      `DESCRIPTION:${escapeIcsText(description)}`,
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ].join('\r\n');

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName.replace(/"/g, '')}"`,
        'Cache-Control': 'no-store',
      },
      body: ics,
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ message: error.message || 'Unknown error' }),
    };
  }
};
