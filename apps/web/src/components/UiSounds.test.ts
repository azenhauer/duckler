import { cueFor, zoneFor } from './UiSounds';

const build = (html: string) => { document.body.innerHTML = `<div class="app-shell">${html}</div>`; return (selector: string) => document.querySelector<HTMLElement>(selector)!; };

describe('UI sound zones', () => {
  it('tells menus, cards, settings and canvas tools apart', () => {
    const $ = build(`
      <nav class="bottom-dock"><button id="dock">Collections</button></nav>
      <article class="library-card"><button id="card">Edit</button></article>
      <div class="collection-tile"><button id="tile">Open</button></div>
      <div class="app-settings"><button id="setting">PS Blue</button></div>
      <div class="card-editor"><button id="editor">Copy</button></div>
      <div class="canvas-studio"><div class="canvas-float" aria-label="Canvas tools"><button id="pen" aria-pressed="false">Pen</button><button id="select" aria-pressed="true">Select</button></div><button id="fit">Fit board</button></div>`);
    expect(zoneFor($('#dock'))).toBe('menu');
    expect(zoneFor($('#card'))).toBe('card');
    expect(zoneFor($('#tile'))).toBe('card');
    expect(zoneFor($('#setting'))).toBe('settings');
    expect(zoneFor($('#editor'))).toBe('settings');
    expect(zoneFor($('#fit'))).toBe('canvas');
    expect(cueFor($('#dock'))).toBe('click');
    expect(cueFor($('#card'))).toBe('click-card');
    expect(cueFor($('#setting'))).toBe('click-settings');
    expect(cueFor($('#fit'))).toBe('click-canvas');
    expect(cueFor($('#pen'))).toBe('canvas-tool');
    expect(cueFor($('#select'))).toBe('toggle-off');
  });

  it('keeps semantic cues (save, delete, back, open) in every zone', () => {
    const $ = build(`
      <div class="card-editor"><button id="save" type="submit">✕ Save</button><button id="trash" aria-label="Move to trash"></button><button id="close" aria-label="Close details"></button></div>
      <article class="library-card"><button id="menu" aria-haspopup="menu">More</button></article>
      <div class="canvas-studio"><button id="remove" aria-label="Remove selected"></button></div>`);
    expect(cueFor($('#save'))).toBe('save');
    expect(cueFor($('#trash'))).toBe('delete');
    expect(cueFor($('#close'))).toBe('back');
    expect(cueFor($('#menu'))).toBe('open');
    expect(cueFor($('#remove'))).toBe('delete');
  });
});
