import {describe,expect,test} from 'vitest';
import {ACCESS_TOKEN_MAX_LENGTH,parseAccessTokenRequest,validatedAccessToken} from './session-token';

describe('validatedAccessToken',()=>{
  test('trims a provisioned token',()=>expect(validatedAccessToken('  demo-token  ')).toBe('demo-token'));
  test('rejects an empty token',()=>expect(()=>validatedAccessToken(' \n ')).toThrow('Enter your account access token.'));
  test('rejects oversized tokens',()=>expect(()=>validatedAccessToken('x'.repeat(ACCESS_TOKEN_MAX_LENGTH+1))).toThrow('That access token is too long.'));
});

describe('parseAccessTokenRequest',()=>{
  test('rejects malformed JSON as a client error',()=>expect(()=>parseAccessTokenRequest('{')).toThrow('Request body must be valid JSON.'));
  test('rejects missing, short, and whitespace tokens',()=>{
    expect(()=>parseAccessTokenRequest('{}')).toThrow('Enter a valid per-user access token.');
    expect(()=>parseAccessTokenRequest('{"token":"short"}')).toThrow('Enter a valid per-user access token.');
    expect(()=>parseAccessTokenRequest(JSON.stringify({token:'x'.repeat(16)+' y'}))).toThrow('Enter a valid per-user access token.');
  });
  test('accepts a bounded non-whitespace token',()=>expect(parseAccessTokenRequest(JSON.stringify({token:'x'.repeat(64)}))).toBe('x'.repeat(64)));
});
