exports.handler = async function (event) {
  try {
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        body: JSON.stringify({ ok: false, message: 'Method Not Allowed' }),
      };
    }

    const {
      MS_TENANT_ID,
      MS_CLIENT_ID,
      MS_CLIENT_SECRET,
      MS_CALENDAR_USER,
    } = process.env;

    const body = JSON.parse(event.body || '{}');

    const {
      subject,
      startDateTime,
      endDateTime,
      timezone = 'Asia/Seoul',
      description = '',
      location = '',
    } = body;

    // 🔑 1. Graph 토큰 발급
    const tokenRes = await fetch(
      `https://login.microsoftonline.com/${MS_TENANT_ID}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: MS_CLIENT_ID,
          client_secret: MS_CLIENT_SECRET,
          scope: 'https://graph.microsoft.com/.default',
          grant_type: 'client_credentials',
        }),
      }
    );

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          ok: false,
          message: '토큰 발급 실패',
          detail: tokenData,
        }),
      };
    }

    const accessToken = tokenData.access_token;

    // 📅 2. Outlook 일정 생성
    const graphRes = await fetch(
      `https://graph.microsoft.com/v1.0/users/${MS_CALENDAR_USER}/calendar/events`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subject,
          body: {
            contentType: 'HTML',
            content: description || '<p>프로젝트 일정</p>',
          },
          start: {
            dateTime: startDateTime,
            timeZone: timezone,
          },
          end: {
            dateTime: endDateTime,
            timeZone: timezone,
          },
          location: location ? { displayName: location } : undefined,
        }),
      }
    );

    const graphData = await graphRes.json();

    if (!graphRes.ok) {
      return {
        statusCode: graphRes.status,
        body: JSON.stringify({
          ok: false,
          message: 'Graph 일정 생성 실패',
          detail: graphData,
        }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        eventId: graphData.id,
        webLink: graphData.webLink,
      }),
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        message: error.message || 'Unknown error',
      }),
    };
  }
};
