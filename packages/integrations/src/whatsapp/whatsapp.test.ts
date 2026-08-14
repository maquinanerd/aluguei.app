import { describe, expect, it } from 'vitest';
import { FakeWhatsAppMessenger } from './fake.js';
import { MetaWhatsAppAdapter } from './meta.js';

describe('FakeWhatsAppMessenger', () => {
  it('sendText é determinístico e registra no outbox', async () => {
    const messenger = new FakeWhatsAppMessenger('tok');
    const a = await messenger.sendText('5511999990001', 'Olá');
    const b = await messenger.sendText('5511999990001', 'Olá');
    expect(a.waMessageId).toBe(b.waMessageId); // mesmo to+body → mesmo id (retry não duplica)
    expect(messenger.outbox.length).toBe(2);
  });

  it('verifyWebhook valida token', () => {
    const messenger = new FakeWhatsAppMessenger('tok');
    expect(messenger.verifyWebhook({ mode: 'subscribe', token: 'tok', challenge: 'c' })).toEqual({
      valid: true,
      challenge: 'c',
    });
    expect(
      messenger.verifyWebhook({ mode: 'subscribe', token: 'errado', challenge: 'c' }).valid,
    ).toBe(false);
  });
});

describe('MetaWhatsAppAdapter parseWebhookEvent', () => {
  it('normaliza mensagens e ignora payloads sem messages', () => {
    const adapter = new MetaWhatsAppAdapter({
      accessToken: 't',
      phoneNumberId: 'p',
      verifyToken: 'v',
      fetchImpl: () => Promise.resolve(new Response('{}', { status: 200 })),
    });
    const events = adapter.parseWebhookEvent({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: '1001' },
                messages: [
                  { from: '5511', id: 'w1', timestamp: '1', type: 'text', text: { body: 'oi' } },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ waContactId: '5511', body: 'oi', waMessageId: 'w1' });

    const status = adapter.parseWebhookEvent({
      entry: [{ changes: [{ value: { statuses: [] } }] }],
    });
    expect(status).toHaveLength(0);
  });
});
