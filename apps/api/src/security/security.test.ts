import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, hashIp, safeEqual } from './crypto';
import { hashPassword, verifyPassword } from './password';
import { base32Decode, base32Encode, hotp, otpauthUri, totp, verifyTotp } from './totp';

describe('TOTP (RFC 6238)', () => {
  // Секрет из приложения B RFC 6238: ASCII «12345678901234567890»
  const secret = base32Encode(Buffer.from('12345678901234567890'));

  it('base32 туда и обратно', () => {
    expect(secret).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(base32Decode(secret).toString()).toBe('12345678901234567890');
  });

  it('HOTP — тестовые векторы RFC 4226', () => {
    const key = Buffer.from('12345678901234567890');
    expect([0, 1, 2, 9].map((c) => hotp(key, c))).toEqual(['755224', '287082', '359152', '520489']);
  });

  it('TOTP — векторы RFC 6238 (SHA1, 6 цифр)', () => {
    expect(totp(secret, 59_000)).toBe('287082');
    expect(totp(secret, 1_111_111_109_000)).toBe('081804');
    expect(totp(secret, 2_000_000_000_000)).toBe('279037');
  });

  it('окно ±30 с и отказ за его пределами', () => {
    const now = 1_111_111_109_000;
    expect(verifyTotp(secret, '081804', now + 30_000)).not.toBeNull();
    expect(verifyTotp(secret, '081804', now + 90_000)).toBeNull();
    expect(verifyTotp(secret, '12345', now)).toBeNull();
  });

  it('otpauth URI для QR-кода', () => {
    expect(otpauthUri({ secret, account: 'admin@apex.local', issuer: 'APEX' })).toBe(
      'otpauth://totp/APEX%3Aadmin%40apex.local?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=APEX&algorithm=SHA1&digits=6&period=30',
    );
  });
});

describe('криптография', () => {
  const key = Buffer.alloc(32, 7).toString('base64');

  it('AES-256-GCM: шифрует, расшифровывает, ловит подмену', () => {
    const sealed = encryptSecret('JBSWY3DPEHPK3PXP', key);
    expect(sealed).not.toContain('JBSWY3DPEHPK3PXP');
    expect(decryptSecret(sealed, key)).toBe('JBSWY3DPEHPK3PXP');
    const [iv, tag, data] = sealed.split('.');
    const tampered = [iv, tag, `${data!.slice(0, -2)}AA`].join('.');
    expect(() => decryptSecret(tampered, key)).toThrow();
  });

  it('хеш IP зависит от соли; сравнение секретов', () => {
    expect(hashIp('10.0.0.1', 'a')).not.toBe(hashIp('10.0.0.1', 'b'));
    expect(safeEqual('secret', 'secret')).toBe(true);
    expect(safeEqual('secret', 'secreT')).toBe(false);
    expect(safeEqual('short', 'longer')).toBe(false);
  });

  it('argon2id: верный и неверный пароль, битый хеш', async () => {
    const stored = await hashPassword('correct horse battery staple');
    expect(stored.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(stored, 'correct horse battery staple')).toBe(true);
    expect(await verifyPassword(stored, 'wrong')).toBe(false);
    expect(await verifyPassword('not-a-hash', 'x')).toBe(false);
  });
});
