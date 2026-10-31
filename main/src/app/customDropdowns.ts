let dropdownId = 0;
const refreshDropdown = new WeakMap<HTMLSelectElement, () => void>();

type DropdownParts = {
  wrapper: HTMLDivElement;
  trigger: HTMLButtonElement;
  menu: HTMLDivElement;
};

function optionLabel(option: HTMLOptionElement): string {
  const width = window.innerWidth;
  if (width <= 400) return option.dataset.xs || option.dataset.short || option.textContent || '';
  if (width <= 570) return option.dataset.short || option.textContent || '';
  return option.textContent || '';
}

function enhanceSelect(select: HTMLSelectElement): void {
  if (select.closest('.custom-dropdown--native')) {
    refreshDropdown.get(select)?.();
    return;
  }

  const computed = getComputedStyle(select);
  const wrapper = document.createElement('div');
  wrapper.className = 'custom-dropdown custom-dropdown--native';
  wrapper.style.flex = computed.flex;
  wrapper.style.flexShrink = computed.flexShrink;
  wrapper.style.minWidth = computed.minWidth;
  if (select.style.width) wrapper.style.width = computed.width;

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'custom-dropdown-trigger';
  trigger.id = `sqg-dropdown-${select.id || ++dropdownId}`;
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  const label = select.getAttribute('aria-label') || select.previousElementSibling?.textContent?.trim();
  if (label) trigger.setAttribute('aria-label', label);
  for (const property of ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'textAlign', 'padding', 'borderRadius', 'color', 'backgroundColor', 'borderColor'] as const) {
    trigger.style[property] = computed[property];
  }

  const menu = document.createElement('div');
  menu.className = 'custom-dropdown-menu';
  menu.setAttribute('role', 'listbox');
  menu.id = `${trigger.id}-options`;
  trigger.setAttribute('aria-controls', menu.id);

  const parts: DropdownParts = { wrapper, trigger, menu };
  const sync = () => {
    const selected = select.selectedOptions[0];
    trigger.textContent = '';
    const text = document.createElement('span');
    text.className = 'custom-dropdown-label';
    text.textContent = selected ? optionLabel(selected) : '';
    trigger.appendChild(text);
    trigger.disabled = select.disabled;
    trigger.setAttribute('aria-expanded', String(!menu.hidden));

    menu.replaceChildren();
    [...select.options].forEach((option, index) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'custom-dropdown-option';
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(index === select.selectedIndex));
      item.disabled = option.disabled || option.parentElement instanceof HTMLOptGroupElement && option.parentElement.disabled;
      const itemText = document.createElement('span');
      itemText.textContent = optionLabel(option);
      item.appendChild(itemText);
      if (index === select.selectedIndex) {
        const check = document.createElement('span');
        check.className = 'custom-dropdown-check';
        check.setAttribute('aria-hidden', 'true');
        check.textContent = '✓';
        item.appendChild(check);
      }
      item.addEventListener('click', () => {
        select.value = option.value;
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
        queueMicrotask(() => {
          sync();
          close();
        });
      });
      document.addEventListener('focusin', (event) => {
        const target = event.target;
        if (!(target instanceof Node)) return;
        document.querySelectorAll<HTMLDivElement>('.custom-dropdown--native').forEach((wrapper) => {
          if (!wrapper.contains(target)) {
            const menu = wrapper.querySelector<HTMLElement>('.custom-dropdown-menu');
            const trigger = wrapper.querySelector<HTMLButtonElement>('.custom-dropdown-trigger');
            if (menu) menu.hidden = true;
            trigger?.setAttribute('aria-expanded', 'false');
          }
        });
      });
      item.addEventListener('keydown', (event) => handleOptionKey(event, item, parts));
      menu.appendChild(item);
    });
  };
  refreshDropdown.set(select, sync);
  const close = () => {
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
  };
  const open = () => {
    if (trigger.disabled) return;
    menu.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    const rect = trigger.getBoundingClientRect();
    const menuHeight = Math.min(menu.scrollHeight, 260);
    menu.classList.toggle('custom-dropdown-menu--above', window.innerHeight - rect.bottom < menuHeight && rect.top > menuHeight);
    menu.querySelector<HTMLButtonElement>('[aria-selected="true"]:not(:disabled)')?.focus();
  };

  trigger.addEventListener('click', () => (menu.hidden ? open() : close()));
  trigger.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      open();
    }
  });
  select.addEventListener('change', () => queueMicrotask(sync));
  menu.hidden = true;
  sync();

  const parent = select.parentElement;
  if (!parent) return;
  parent.insertBefore(wrapper, select);
  wrapper.append(trigger, menu, select);
  select.classList.add('custom-dropdown-native');
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');
  select.style.position = 'absolute';
  select.style.width = '1px';
  select.style.height = '1px';
  select.style.opacity = '0';
  select.style.pointerEvents = 'none';
  select.style.left = '0';
  select.style.top = '0';
}

function handleOptionKey(event: KeyboardEvent, item: HTMLButtonElement, parts: DropdownParts): void {
  const options = [...parts.menu.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)')];
  const currentIndex = options.indexOf(item);
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    options[Math.min(options.length - 1, Math.max(0, currentIndex + (event.key === 'ArrowDown' ? 1 : -1)))]?.focus();
  } else if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault();
    (event.key === 'Home' ? options[0] : options[options.length - 1])?.focus();
  } else if (event.key === 'Escape') {
    parts.menu.hidden = true;
    parts.trigger.setAttribute('aria-expanded', 'false');
    parts.trigger.focus();
  }
}

export function installCustomDropdowns(): void {
  const enhanceIn = (node: Node) => {
    if (!(node instanceof Element)) return;
    if (node instanceof HTMLSelectElement) enhanceSelect(node);
    node.querySelectorAll('select').forEach((select) => enhanceSelect(select));
  };
  document.querySelectorAll('select').forEach((select) => enhanceSelect(select));

  document.addEventListener('pointerdown', (event) => {
    const target = event.target;
    if (!(target instanceof Node)) return;
    document.querySelectorAll<HTMLDivElement>('.custom-dropdown--native').forEach((wrapper) => {
      if (!wrapper.contains(target)) {
        const menu = wrapper.querySelector<HTMLElement>('.custom-dropdown-menu');
        const trigger = wrapper.querySelector<HTMLButtonElement>('.custom-dropdown-trigger');
        if (menu) menu.hidden = true;
        trigger?.setAttribute('aria-expanded', 'false');
      }
    });
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    document.querySelectorAll<HTMLDivElement>('.custom-dropdown--native').forEach((wrapper) => {
      const menu = wrapper.querySelector<HTMLElement>('.custom-dropdown-menu');
      const trigger = wrapper.querySelector<HTMLButtonElement>('.custom-dropdown-trigger');
      if (menu && !menu.hidden) {
        menu.hidden = true;
        trigger?.setAttribute('aria-expanded', 'false');
        trigger?.focus();
      }
    });
  });

  const observer = new MutationObserver((records) => {
    const addedElements = new Set<Element>();
    for (const record of records) {
      const target = record.target instanceof Element ? record.target.closest('select') : null;
      if (target instanceof HTMLSelectElement) {
        enhanceSelect(target);
      }
      record.addedNodes.forEach((node) => {
        if (node instanceof Element) addedElements.add(node);
      });
    }
    for (const element of addedElements) {
      let parent = element.parentElement;
      let nestedInAddedElement = false;
      while (parent) {
        if (addedElements.has(parent)) {
          nestedInAddedElement = true;
          break;
        }
        parent = parent.parentElement;
      }
      if (!nestedInAddedElement) enhanceIn(element);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
}
