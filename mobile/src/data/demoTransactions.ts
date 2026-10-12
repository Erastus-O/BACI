// Twelve months of sample transactions for the demo, across the sandbox accounts in mock.ts.
// Deterministic (seeded), so the demo and its screenshots look the same every time.
// Plaid conventions: positive amount = money out; categories are Plaid's personal_finance_category.

export const DEMO_TODAY = '2026-09-26';

export type DemoTxn = {
  id: string;
  providerAccountId: string;
  date: string;
  amount: number;
  name: string;
  merchant: string | null;
  category: string;
  detailed: string | null;
  channel: 'online' | 'in store' | 'other';
};

function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let cache: DemoTxn[] | null = null;

export function demoTransactions(): DemoTxn[] {
  if (cache) return cache;
  const rand = rng(20261026);
  const between = (lo: number, hi: number) => Math.round((lo + rand() * (hi - lo)) * 100) / 100;
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const out: DemoTxn[] = [];
  let n = 0;
  const add = (acc: string, date: string, amount: number, name: string, merchant: string | null, category: string, detailed: string | null, channel: DemoTxn['channel'] = 'other') => {
    if (date > DEMO_TODAY) return;
    out.push({ id: `demo_tx_${++n}`, providerAccountId: acc, date, amount, name, merchant, category, detailed, channel });
  };

  const CUR = 'mer-4821';
  const HAR = 'har-1177';
  const CARD = 'lum-0092';
  const SAVER = 'nor-3309';

  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(2026, 8 - i, 1));
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const on = (day: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(Math.min(day, days)).padStart(2, '0')}`;

    // ----- Income and money between own accounts (not spending) -----
    add(CUR, on(25), -3550, 'ACME LTD SALARY', 'Acme Ltd', 'INCOME', 'INCOME_WAGES');
    add(CUR, on(26), 500, 'TO NORTHGATE EASY SAVER', null, 'TRANSFER_OUT', 'TRANSFER_OUT_SAVINGS');
    add(SAVER, on(26), -500, 'FROM MERIDIAN 4821', null, 'TRANSFER_IN', 'TRANSFER_IN_ACCOUNT_TRANSFER');

    // ----- Regular payments -----
    add(CUR, on(1), 1100, 'HOMELET RENT SO', null, 'RENT_AND_UTILITIES', 'RENT_AND_UTILITIES_RENT');
    add(CUR, on(2), 158, 'TFL TRAVELCARD', 'TfL', 'TRANSPORTATION', 'TRANSPORTATION_PUBLIC_TRANSIT', 'online');
    add(CUR, on(5), 164, 'LAMBETH COUNCIL TAX DD', 'Lambeth Council', 'GOVERNMENT_AND_NON_PROFIT', 'GOVERNMENT_AND_NON_PROFIT_TAX_PAYMENT');
    add(CUR, on(8), 118.5, 'OCTOPUS ENERGY DD', 'Octopus Energy', 'RENT_AND_UTILITIES', 'RENT_AND_UTILITIES_GAS_AND_ELECTRICITY');
    add(CUR, on(12), 64.99, 'VODAFONE DD', 'Vodafone', 'RENT_AND_UTILITIES', 'RENT_AND_UTILITIES_TELEPHONE');
    add(CUR, on(12), 10.99, 'STREAMFLIX.COM', 'StreamFlix', 'ENTERTAINMENT', 'ENTERTAINMENT_TV_AND_MOVIES', 'online');
    add(CUR, on(17), 39.99, 'PUREGYM DD', 'PureGym', 'PERSONAL_CARE', 'PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS');
    add(CUR, on(22), 11.5, 'ASPIRE INSURANCE DD', 'Aspire', 'GENERAL_SERVICES', 'GENERAL_SERVICES_INSURANCE');
    add(HAR, on(3), 185, 'HARBOUR LOAN 5520 SO', 'Harbour Bank', 'LOAN_PAYMENTS', 'LOAN_PAYMENTS_PERSONAL_LOAN_PAYMENT');
    add(HAR, on(20), 10.99, 'STREAMFLIX.COM', 'StreamFlix', 'ENTERTAINMENT', 'ENTERTAINMENT_TV_AND_MOVIES', 'online');

    // ----- Everyday spending -----
    for (let day = 3; day <= days; day += 7) {
      const shop = pick(['TESCO STORES 3021', 'SAINSBURYS S/MKTS', 'LIDL GB LONDON']);
      add(CUR, on(day), between(48, 92), shop, shop.split(' ')[0][0] + shop.split(' ')[0].slice(1).toLowerCase(), 'FOOD_AND_DRINK', 'FOOD_AND_DRINK_GROCERIES', 'in store');
    }
    add(CUR, on(9), 40, 'ATM WITHDRAWAL BRIXTON', null, 'TRANSFER_OUT', 'TRANSFER_OUT_WITHDRAWAL');
    if (rand() > 0.4) add(CUR, on(23), 40, 'ATM WITHDRAWAL VICTORIA', null, 'TRANSFER_OUT', 'TRANSFER_OUT_WITHDRAWAL');
    add(CUR, on(14), between(25, 120), `${pick(['J OKAFOR', 'S PATEL', 'M BROWN'])} FPS`, null, 'TRANSFER_OUT', 'TRANSFER_OUT_ACCOUNT_TRANSFER');

    let card = 0;
    const onCard = (day: number, amount: number, name: string, merchant: string, category: string, detailed: string, channel: DemoTxn['channel']) => {
      if (on(day) > DEMO_TODAY) return;
      add(CARD, on(day), amount, name, merchant, category, detailed, channel);
      card += amount;
    };
    for (let k = 0; k < 6; k++) {
      const [nm, merchant, det] = pick([
        ['PRET A MANGER', 'Pret A Manger', 'FOOD_AND_DRINK_COFFEE'],
        ['DISHOOM KINGS CROSS', 'Dishoom', 'FOOD_AND_DRINK_RESTAURANT'],
        ['NANDOS', "Nando's", 'FOOD_AND_DRINK_RESTAURANT'],
        ['DELIVEROO', 'Deliveroo', 'FOOD_AND_DRINK_FAST_FOOD'],
      ]);
      onCard(2 + k * 5, between(7, 48), nm, merchant, 'FOOD_AND_DRINK', det, nm === 'DELIVEROO' ? 'online' : 'in store');
    }
    for (let k = 0; k < 3; k++) {
      const [nm, merchant] = pick([
        ['AMAZON.CO.UK', 'Amazon'],
        ['ASOS.COM', 'ASOS'],
        ['BOOTS 1043', 'Boots'],
        ['UNIQLO OXFORD ST', 'Uniqlo'],
      ]);
      onCard(4 + k * 9, between(12, 85), nm, merchant, 'GENERAL_MERCHANDISE', 'GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE', /\.CO|\.COM/.test(nm) ? 'online' : 'in store');
    }
    onCard(11, between(9, 24), 'UBER *TRIP', 'Uber', 'TRANSPORTATION', 'TRANSPORTATION_TAXIS_AND_RIDE_SHARES', 'online');
    onCard(27, between(9, 24), 'UBER *TRIP', 'Uber', 'TRANSPORTATION', 'TRANSPORTATION_TAXIS_AND_RIDE_SHARES', 'online');
    // Seasonal: Christmas, a spring birthday, a summer holiday.
    if (m === 11) {
      onCard(6, 214.5, 'JOHN LEWIS', 'John Lewis', 'GENERAL_MERCHANDISE', 'GENERAL_MERCHANDISE_DEPARTMENT_STORES', 'in store');
      onCard(13, 189.99, 'AMAZON.CO.UK', 'Amazon', 'GENERAL_MERCHANDISE', 'GENERAL_MERCHANDISE_ONLINE_MARKETPLACES', 'online');
      onCard(19, 142.3, 'SELFRIDGES', 'Selfridges', 'GENERAL_MERCHANDISE', 'GENERAL_MERCHANDISE_DEPARTMENT_STORES', 'in store');
      onCard(21, 168, 'TRAINLINE', 'Trainline', 'TRAVEL', 'TRAVEL_OTHER_TRAVEL', 'online');
      add(CUR, on(20), 150, 'MUM GIFT FPS', null, 'TRANSFER_OUT', 'TRANSFER_OUT_ACCOUNT_TRANSFER');
    }
    if (m === 3) onCard(18, 186.4, 'HAWKSMOOR', 'Hawksmoor', 'FOOD_AND_DRINK', 'FOOD_AND_DRINK_RESTAURANT', 'in store');
    if (m === 7) {
      onCard(3, 412.6, 'EASYJET', 'easyJet', 'TRAVEL', 'TRAVEL_FLIGHTS', 'online');
      onCard(5, 538, 'AIRBNB', 'Airbnb', 'TRAVEL', 'TRAVEL_LODGING', 'online');
      onCard(16, 96.4, 'LISBOA RESTAURANTE', 'Restaurante', 'FOOD_AND_DRINK', 'FOOD_AND_DRINK_RESTAURANT', 'in store');
      add(CUR, on(12), 60, 'ATM WITHDRAWAL LISBOA', null, 'TRANSFER_OUT', 'TRANSFER_OUT_WITHDRAWAL');
    }
    // The card is paid off in full the next month (between own accounts, so not spending twice).
    const next = new Date(Date.UTC(y, m + 1, 15)).toISOString().slice(0, 10);
    const paid = Math.round(card * 100) / 100;
    add(CUR, next, paid, 'LUMEN CARD PAYMENT', 'Lumen', 'LOAN_PAYMENTS', 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT');
    add(CARD, next, -paid, 'PAYMENT RECEIVED THANK YOU', null, 'LOAN_PAYMENTS', 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT');
  }
  cache = out;
  return out;
}
