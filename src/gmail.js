import { google } from 'googleapis';

function encodeMessage({ from, fromName, to, subject, text, unsubscribeUrl }) {
    const safeSubject = subject.replace(/[\r\n]+/g, ' ');
    const safeFromName = fromName.replace(/[\r\n"<>]+/g, ' ').trim();
    const safeTo = to.replace(/[\r\n]+/g, '');
    const headers = [
        `From: "${safeFromName}" <${from}>`,
        `To: ${safeTo}`,
        `Subject: ${safeSubject}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        `List-Unsubscribe: <${unsubscribeUrl}>`,
        'List-Unsubscribe-Post: List-Unsubscribe=One-Click',
        '',
        text,
    ];
    return Buffer.from(headers.join('\r\n')).toString('base64url');
}

export function createGmailSender(environment = process.env) {
    const required = ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN', 'GMAIL_SENDER_EMAIL'];
    const missing = required.filter((name) => !environment[name]);
    if (missing.length > 0) {
        throw new Error(`Sending requires Apify secrets: ${missing.join(', ')}.`);
    }

    const auth = new google.auth.OAuth2(environment.GMAIL_CLIENT_ID, environment.GMAIL_CLIENT_SECRET);
    auth.setCredentials({ refresh_token: environment.GMAIL_REFRESH_TOKEN });
    const gmail = google.gmail({ version: 'v1', auth });

    return async (draft, fromName) => {
        const raw = encodeMessage({
            from: environment.GMAIL_SENDER_EMAIL,
            fromName,
            to: draft.to,
            subject: draft.subject,
            text: draft.text,
            unsubscribeUrl: draft.unsubscribe_url,
        });
        const response = await gmail.users.messages.send({
            userId: 'me',
            requestBody: { raw },
        });
        return { id: response.data.id, threadId: response.data.threadId };
    };
}

export { encodeMessage };
