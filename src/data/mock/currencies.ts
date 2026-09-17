import { ASSETS } from '@/assets/assetMap';
import type { CurrencyCatalogue, CurrencyDefinition } from '@/features/currencies/types';
import { CURRENCY_ORDER } from '@/features/currencies/constants';

/**
 * Static currency metadata. Balances are not here — they live on the account,
 * because two players signed into the same browser must not share a wallet.
 */
export const currencies: CurrencyCatalogue = {
  exchange: {
    kind: 'exchange',
    label: 'แต้มแลกเปลี่ยน',
    icon: ASSETS.brand.currencyExchange,
    iconSize: 46,
    purchasable: true,
  },
  gem: {
    kind: 'gem',
    label: 'เจม',
    icon: ASSETS.brand.currencyGem,
    iconSize: 46,
    purchasable: true,
  },
  fcpoint: {
    kind: 'fcpoint',
    label: 'เอฟซีพอยต์',
    icon: ASSETS.brand.currencyFcPoint,
    iconSize: 42,
    purchasable: true,
  },
  ticket: {
    kind: 'ticket',
    label: 'ตั๋วดราฟต์',
    icon: ASSETS.brand.currencyTicket,
    iconSize: 46,
    purchasable: true,
  },
  special: {
    kind: 'special',
    label: 'Special Point',
    icon: ASSETS.brand.currencySpecial,
    iconSize: 44,
    purchasable: false,
  },
};

export const currencyList: CurrencyDefinition[] = CURRENCY_ORDER.map((kind) => currencies[kind]);
