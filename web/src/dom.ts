type Child = Node | string | number | null | undefined | false;

interface Attrs {
  class?: string;
  text?: string;
  html?: string;
  style?: Partial<CSSStyleDeclaration> | string;
  dataset?: Record<string, string>;
  on?: Record<string, (event: Event) => void>;
  [key: string]: unknown;
}

/**
 * A three-line element builder. The dashboard is small enough that a framework
 * would cost more in bundle size than it saves in code.
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;

    if (key === 'class') node.className = String(value);
    else if (key === 'text') node.textContent = String(value);
    else if (key === 'html') node.innerHTML = String(value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'style' && typeof value === 'string') node.setAttribute('style', value);
    else if (key === 'style') Object.assign(node.style, value);
    else if (key === 'on') {
      for (const [event, handler] of Object.entries(value as Record<string, EventListener>)) {
        node.addEventListener(event, handler);
      }
    } else node.setAttribute(key, String(value));
  }

  append(node, children);
  return node;
}

export function append(parent: Node, children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(typeof child === 'object' ? child : document.createTextNode(String(child)));
  }
}

export function clear(node: Node): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function replace(node: Element, ...children: Child[]): void {
  clear(node);
  append(node, children);
}
