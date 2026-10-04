import { parseShareTargetFallback } from './shareTargetFallback';

describe('parseShareTargetFallback', () => {
  it('parses a bounded HTTPS share target payload', () => {
    expect(parseShareTargetFallback('?sharedId=share-1&sharedTitle=Article&sharedText=Read+this&sharedUrl=https%3A%2F%2Fexample.com'))
      .toEqual({
        id: 'share-1',
        title: 'Article',
        text: 'Read this',
        url: 'https://example.com',
      });
  });

  it('ignores URLs without a Pages fallback payload', () => {
    expect(parseShareTargetFallback('?theme=dark')).toBeNull();
  });

  it('rejects unsafe shared URL protocols', () => {
    expect(() => parseShareTargetFallback('?sharedId=share-1&sharedUrl=javascript%3Aalert(1)'))
      .toThrow('Only HTTP(S) shared URLs can be imported.');
  });
});
