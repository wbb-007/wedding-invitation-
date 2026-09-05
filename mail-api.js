const http = require('http');
const { URLSearchParams } = require('url');
const nodemailer = require('nodemailer');

const PORT = Number(process.env.PORT || 5051);
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.partner.outlook.cn';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const MAIL_TO = process.env.MAIL_TO || '465991083@qq.com';
const MAIL_FROM_NAME = process.env.MAIL_FROM_NAME || '婚礼回执';

if (!SMTP_USER || !SMTP_PASS) {
  console.error('Missing SMTP_USER or SMTP_PASS');
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: false,
  requireTLS: true,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
  tls: {
    minVersion: 'TLSv1.2',
  },
});

function normalizeText(value) {
  return String(value || '').replace(/\r?\n/g, ' ').trim();
}

function parseBody(raw, contentType) {
  if (contentType.includes('application/json')) {
    return raw ? JSON.parse(raw) : {};
  }

  const params = new URLSearchParams(raw);
  return Object.fromEntries(params.entries());
}

function buildMessage(data) {
  const name = normalizeText(data.姓名 || data.name);
  const contact = normalizeText(data.联系方式 || data.contact);
  const attendees = normalizeText(data.到场人数 || data.attendees);
  const stay = normalizeText(data.住宿接送需求 || data.lodging);
  const blessing = normalizeText(data.祝福留言 || data.blessing);
  const submittedAt = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

  return {
    subject: `婚礼回执 - ${name || '未填写姓名'}`,
    text: [
      `姓名：${name || '-'}`,
      `联系方式：${contact || '-'}`,
      `到场人数：${attendees || '-'}`,
      `住宿/接送需求：${stay || '-'}`,
      `祝福留言：${blessing || '-'}`,
      `提交时间：${submittedAt}`,
    ].join('\n'),
  };
}

async function sendMail(data) {
  const { subject, text } = buildMessage(data);

  await transporter.sendMail({
    from: `${MAIL_FROM_NAME} <${SMTP_USER}>`,
    to: MAIL_TO,
    subject,
    text,
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 64 * 1024) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  if (req.method !== 'POST' || req.url !== '/api/rsvp') {
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders() });
    res.end(JSON.stringify({ ok: false, error: 'Not found' }));
    return;
  }

  try {
    const contentType = String(req.headers['content-type'] || '').toLowerCase();
    const raw = await readBody(req);
    const payload = parseBody(raw, contentType);
    await sendMail(payload);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders() });
    res.end(JSON.stringify({ ok: true }));
  } catch (error) {
    console.error(error);
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders() });
    res.end(JSON.stringify({ ok: false, error: '邮件发送失败' }));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`mail api listening on ${PORT}`);
});
