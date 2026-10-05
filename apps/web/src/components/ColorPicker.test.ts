import { hexToHsv, hsvToHex, isHex } from './ColorPicker';

describe('colour picker conversions', () => {
  it('round-trips hex through HSV', () => {
    for (const hex of ['#000000', '#ffffff', '#ff0000', '#3cc8ff', '#506bbb', '#f2d33d', '#0c1424', '#7fa9c9']) expect(hsvToHex(hexToHsv(hex))).toBe(hex);
  });
  it('maps the picker axes as expected', () => {
    expect(hsvToHex({ h: 0, s: 1, v: 1 })).toBe('#ff0000');
    expect(hsvToHex({ h: 120, s: 1, v: 1 })).toBe('#00ff00');
    expect(hsvToHex({ h: 240, s: 0, v: 1 })).toBe('#ffffff');
    expect(hsvToHex({ h: 300, s: .5, v: 0 })).toBe('#000000');
    expect(isHex('#3cc8ff')).toBe(true);
    expect(isHex('3cc8ff')).toBe(false);
    expect(isHex('#3cc8f')).toBe(false);
  });
});
