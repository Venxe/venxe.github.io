import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const markup = html.slice(html.indexOf('<div id="desktop-controls"'), html.indexOf('<p id="scene-help"'));
const dataName = (name) => name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

// Browser boundaries only; the desktop module and its real HTML are unchanged.
export class TestElement extends EventTarget {
  constructor(tag) {
    super();
    this.tagName = tag.toUpperCase();
    this.dataset = {};
    this.attributes = new Map();
    this.children = [];
    this.style = {};
    this.hidden = false;
    this.disabled = false;
    this.textContent = '';
    this.labels = [];
    this.images = [];
    this.boxes = [];
    this.arcs = [];
    let scale = 1;
    this.context = new Proxy({}, { get: (target, key) => {
      if (key in target) return target[key];
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (key === 'measureText') return text => ({ width: String(text).length * 8 });
      if (key === 'setTransform') return (value) => { scale = value; };
      if (key === 'fillRect') return (x, y, w, h) => {
        if (x === 0 && y === 0 && w === this.width && h === this.height) { this.labels.length = 0; this.images.length = 0; this.boxes.length = 0; this.arcs.length = 0; }
      };
      if (key === 'fillText') return (text, x, y) => this.labels.push({ text, x: x * scale, y: y * scale });
      if (key === 'drawImage') return (image, x, y, w, h) => {
        if (image.tagName === 'CANVAS') { this.labels.length = 0; this.images.length = 0; this.boxes.length = 0; this.arcs.length = 0; }
        else this.images.push({ src: image.src, x: x * scale, y: y * scale, w: w * scale, h: h * scale });
      };
      if (key === 'roundRect') return (x, y, w, h, radius) => this.boxes.push({ x: x * scale, y: y * scale, w: w * scale, h: h * scale, radius: radius * scale });
      if (key === 'arc') return (x, y, r) => this.arcs.push({ x: x * scale, y: y * scale, r: r * scale });
      return () => {};
    } });
  }
  append(...elements) { for (const element of elements) { element.parent = this; this.children.push(element); } }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
  contains(element) { return element === this || this.children.some((child) => child.contains(element)); }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name.startsWith('data-')) this.dataset[dataName(name)] = String(value);
    else if (['type', 'value', 'id', 'min', 'max', 'step'].includes(name)) this[name] = String(value);
    else if (name === 'hidden') this.hidden = true;
  }
  getAttribute(name) { return name.startsWith('data-') ? this.dataset[dataName(name)] ?? null : this.attributes.get(name) ?? null; }
  querySelectorAll(selector) {
    const [, attribute, value] = selector.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);
    const result = [];
    const visit = (node) => {
      for (const child of node.children) {
        const actual = child.getAttribute(attribute);
        if (actual !== null && (value === undefined || actual === value)) result.push(child);
        visit(child);
      }
    };
    visit(this);
    return result;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  getContext() { return this.context; }
  focus() {
    globalThis.document.activeElement?.dispatchEvent(new Event('blur'));
    globalThis.document.activeElement = this;
    this.dispatchEvent(new Event('focus'));
  }
  click() { if (!this.disabled) this.dispatchEvent(new Event('click')); }
}

export const createElement = (tag) => new TestElement(tag);
export class TestImage extends EventTarget {
  static instances = [];
  complete = true;
  naturalWidth = 16;
  constructor() { super(); TestImage.instances.push(this); }
}

export function createDesktopControls() {
  const stack = [];
  let root;
  for (const [, closing, tag, attributes] of markup.matchAll(/<(\/)?([a-z]+)\b([^>]*)>/g)) {
    if (closing) { stack.pop(); continue; }
    const element = createElement(tag);
    for (const [, name, value] of attributes.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) element.setAttribute(name, value ?? '');
    if (stack.length) stack.at(-1).append(element);
    else root = element;
    if (tag !== 'input') stack.push(element);
  }
  return root;
}
