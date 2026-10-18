import {describe,expect,test} from 'vitest';
import {ACCESS_TOKEN_MAX_LENGTH,validatedAccessToken} from './session-token';

describe('validatedAccessToken',()=>{
  test('trims a provisioned token',()=>expect(validatedAccessToken('  demo-token  ')).toBe('demo-token'));
  test('rejects an empty token',()=>expect(()=>validatedAccessToken(' \n ')).toThrow('Enter your account access token.'));
  test('rejects oversized tokens',()=>expect(()=>validatedAccessToken('x'.repeat(ACCESS_TOKEN_MAX_LENGTH+1))).toThrow('That access token is too long.'));
});
