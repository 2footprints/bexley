
const { Resend } = require('resend');

exports.handler = async function (event) {
  try {
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        body: JSON.stringify({ message: 'Method Not Allowed' }),
      };
    }

    const resend = new Resend(process.env.RESEND_API_KEY);

    const body = JSON.parse(event.body || '{}');
    const to = body.to;

    if (!to) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: '받는 사람 이메일이 없습니다.' }),
      };
    }

    const result = await resend.emails.send({
      from: process.env.MAIL_FROM,
      to: [to],
      subject: '[Bexley] 테스트 메일',
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6;">
          <h2>Bexley 테스트 메일</h2>
          <p>Netlify Function + Resend 연결 테스트입니다.</p>
          <p>이 메일이 왔다면 1차 연결은 성공입니다.</p>
        </div>
      `,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        result,
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        message: error.message,
      }),
    };
  }
};
