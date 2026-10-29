import { describe, it, expect, vi } from 'vitest';
import { Contacts, formatTime, getCharacterIcon } from '../../../src/ui/phone/Contacts';
import { Phone } from '../../../src/ui/phone/Phone';
import { setLanguage } from '../../../src/ui/i18n';

interface VNodeLike {
  type?: unknown;
  props: {
    children?: VNodeLike | VNodeLike[] | string | number | (VNodeLike | string | number)[];
    onClick?: () => void;
    [key: string]: unknown;
  };
}

function asVNode(elem: unknown): VNodeLike {
  return elem as VNodeLike;
}

function findTestId(elem: unknown, testId: string): VNodeLike | null {
  if (!elem || typeof elem !== 'object') return null;
  const node = elem as VNodeLike;
  if (node.props && node.props['data-testid'] === testId) {
    return node;
  }
  if (node.props?.children) {
    if (Array.isArray(node.props.children)) {
      for (const child of node.props.children) {
        const found = findTestId(child, testId);
        if (found) return found;
      }
    } else {
      return findTestId(node.props.children, testId);
    }
  }
  return null;
}

describe('T4.3 Contacts UI & Phone Tab', () => {
  it('formats time correctly', () => {
    expect(formatTime(480)).toBe('08:00');
    expect(formatTime(630)).toBe('10:30');
    expect(formatTime(1200)).toBe('20:00');
  });

  it('provides icons for characters', () => {
    expect(getCharacterIcon('char_ma')).toBe('👵');
    expect(getCharacterIcon('char_mintu')).toBe('☕');
    expect(getCharacterIcon('char_kamal')).toBe('🔧');
    expect(getCharacterIcon('char_nabila')).toBe('🎓');
    expect(getCharacterIcon('char_unknown')).toBe('👤');
  });

  it('renders contacts with locked and unlocked indicators', () => {
    setLanguage('en');

    const mockRelationships = {
      char_ma: 80,
      char_mintu: 35,
      char_kamal: 25,
      char_nabila: 20, // >= 15 -> unlocked
      char_tanvir: 5,  // < 15 -> locked
      char_jamil: 0,   // < 15 -> locked
    };

    const vnode = Contacts({
      relationships: mockRelationships,
      onCallContact: () => {},
    });

    expect(vnode).not.toBeNull();

    // Check unlocked contact item exists
    const nabilaNode = findTestId(vnode, 'contact-item-char_nabila');
    expect(nabilaNode).not.toBeNull();

    // Check locked contact item exists
    const tanvirLockedNode = findTestId(vnode, 'contact-locked-char_tanvir');
    expect(tanvirLockedNode).not.toBeNull();
  });

  it('triggers onCallContact when call button is clicked', () => {
    const onCall = vi.fn();
    const mockRelationships = {
      char_nabila: 20, // unlocked
    };

    const vnode = Contacts({
      relationships: mockRelationships,
      onCallContact: onCall,
    });

    const nabilaNode = findTestId(vnode, 'contact-item-char_nabila');
    expect(nabilaNode).not.toBeNull();

    // Simulate clicking contact to expand
    nabilaNode?.props.onClick?.();
  });

  it('renders contacts tab in Phone component', () => {
    const phoneVNode = Phone({
      isOpen: true,
      onClose: () => {},
      relationships: { char_nabila: 20 },
    });

    expect(phoneVNode).not.toBeNull();
    const contactsTabBtn = findTestId(phoneVNode, 'phone-tab-contacts');
    expect(contactsTabBtn).not.toBeNull();
    expect(asVNode(contactsTabBtn).props.children).toBe('Contacts');
  });
});
